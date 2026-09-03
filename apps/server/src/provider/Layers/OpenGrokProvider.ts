import type { OpenGrokSettings, ServerProviderAuth, ServerProviderModel } from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { causeErrorTag } from "@t3tools/shared/observability";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import type * as EffectAcpSchema from "effect-acp/schema";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { sessionModelStateFromInitialize } from "../acp/AcpRuntimeModel.ts";
import {
  makeOpenGrokAcpRuntime,
  OPEN_GROK_DEFAULT_MODEL_SLUG,
  resolveOpenGrokAuthMethodId,
} from "../acp/OpenGrokAcpSupport.ts";
import {
  buildServerProvider,
  isCommandMissingCause,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import { buildGrokModelsFromSessionModelState } from "./GrokProvider.ts";

const PRESENTATION = { displayName: "OpenGrok", showInteractionModeToggle: false } as const;
const EMPTY_CAPABILITIES = createModelCapabilities({ optionDescriptors: [] });
const FALLBACK_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: OPEN_GROK_DEFAULT_MODEL_SLUG,
    name: "Configured model",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
];
const VERSION_PROBE_TIMEOUT_MS = 4_000;
const INITIALIZE_PROBE_TIMEOUT_MS = 8_000;

const modelsFromSettings = (
  settings: OpenGrokSettings,
  models: ReadonlyArray<ServerProviderModel> = FALLBACK_MODELS,
) => providerModelsFromSettings(models, settings.customModels, EMPTY_CAPABILITIES);

export const buildInitialOpenGrokProviderSnapshot = Effect.fn(
  "buildInitialOpenGrokProviderSnapshot",
)(function* (settings: OpenGrokSettings) {
  return buildServerProvider({
    presentation: PRESENTATION,
    enabled: settings.enabled,
    checkedAt: DateTime.formatIso(yield* DateTime.now),
    models: modelsFromSettings(settings),
    probe: {
      installed: settings.enabled,
      version: null,
      status: "warning",
      auth: { status: "unknown" },
      message: settings.enabled
        ? "Checking OpenGrok CLI availability..."
        : "OpenGrok is disabled in T4 Code settings.",
    },
  });
});

function authFromInitialize(initialized: EffectAcpSchema.InitializeResponse): ServerProviderAuth {
  const methodId = resolveOpenGrokAuthMethodId(initialized);
  if (methodId) {
    const method = initialized.authMethods?.find((candidate) => candidate.id === methodId);
    return {
      status: "authenticated",
      type: methodId === "xai.api_key" ? "api_key" : methodId,
      ...(method?.name.trim() ? { label: method.name.trim() } : {}),
    };
  }
  return { status: "unknown" };
}

const probeInitialize = Effect.fn("OpenGrokProvider.probeInitialize")(function* (
  settings: OpenGrokSettings,
  environment: NodeJS.ProcessEnv,
  cwd: string,
) {
  const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const runtime = yield* makeOpenGrokAcpRuntime({
    openGrokSettings: settings,
    childProcessSpawner,
    environment,
    cwd,
    clientInfo: { name: "t4-code-provider-probe", version: "0.0.0" },
  });
  // Initialize reads local model/auth metadata without authenticating or creating a session.
  const initialized = yield* runtime.initialize();
  const models = buildGrokModelsFromSessionModelState(sessionModelStateFromInitialize(initialized));
  return { models, auth: authFromInitialize(initialized) };
}, Effect.scoped);

export const checkOpenGrokProviderStatus = Effect.fn("checkOpenGrokProviderStatus")(function* (
  settings: OpenGrokSettings,
  environment: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): Effect.fn.Return<
  ServerProviderDraft,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto
> {
  const initial = yield* buildInitialOpenGrokProviderSnapshot(settings);
  if (!settings.enabled) return initial;

  const command = settings.binaryPath || "open-grok";
  const versionResult = yield* Effect.gen(function* () {
    const spawn = yield* resolveSpawnCommand(command, ["--version"], { env: environment });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawn.command, spawn.args, { env: environment, shell: spawn.shell }),
    );
  }).pipe(Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS), Effect.result);

  if (Result.isFailure(versionResult)) {
    return {
      ...initial,
      installed: !isCommandMissingCause(versionResult.failure),
      status: "error",
      message: isCommandMissingCause(versionResult.failure)
        ? "OpenGrok CLI (`open-grok`) is not installed or not on PATH."
        : "Failed to execute OpenGrok CLI health check.",
    };
  }
  if (Option.isNone(versionResult.success)) {
    return {
      ...initial,
      status: "error",
      message: "OpenGrok CLI timed out while running `open-grok --version`.",
    };
  }

  const versionOutput = versionResult.success.value;
  const version =
    `${versionOutput.stdout}\n${versionOutput.stderr}`.match(
      /\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\b/,
    )?.[1] ?? null;
  if (versionOutput.code !== 0) {
    return {
      ...initial,
      version,
      status: "error",
      message: "OpenGrok CLI is installed but failed to run.",
    };
  }

  const initialized = yield* probeInitialize(settings, environment, cwd).pipe(
    Effect.timeoutOption(INITIALIZE_PROBE_TIMEOUT_MS),
    Effect.exit,
  );
  if (Exit.isFailure(initialized) || Option.isNone(initialized.value)) {
    yield* Effect.logWarning("OpenGrok ACP initialize probe failed or timed out.", {
      errorTag: Exit.isFailure(initialized) ? causeErrorTag(initialized.cause) : "Timeout",
    });
    return {
      ...initial,
      version,
      message:
        "OpenGrok CLI is installed but ACP initialize failed. Model options may be incomplete.",
    };
  }

  const discovered = initialized.value.value;
  return buildServerProvider({
    presentation: PRESENTATION,
    enabled: true,
    checkedAt: initial.checkedAt,
    models: modelsFromSettings(settings, [
      ...discovered.models.filter((model) => model.slug !== OPEN_GROK_DEFAULT_MODEL_SLUG),
      ...FALLBACK_MODELS,
    ]),
    probe: { installed: true, version, status: "ready", auth: discovered.auth },
  });
});
