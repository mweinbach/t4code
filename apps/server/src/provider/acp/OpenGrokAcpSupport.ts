import { type OpenGrokSettings, ProviderDriverKind, type RuntimeMode } from "@t3tools/contracts";
import { normalizeModelSlug } from "@t3tools/shared/model";
import type * as EffectAcpSchema from "effect-acp/schema";

import type * as AcpSessionRuntime from "./AcpSessionRuntime.ts";
import { grokAcpSpawnArgs, makeXAiAcpRuntime } from "./GrokAcpSupport.ts";

export const OPEN_GROK_DRIVER_KIND = ProviderDriverKind.make("open-grok");
export const OPEN_GROK_DEFAULT_MODEL_SLUG = "open-grok";

type OpenGrokRuntimeSettings = Pick<OpenGrokSettings, "binaryPath">;

export interface OpenGrokAcpRuntimeInput extends Omit<
  Parameters<typeof makeXAiAcpRuntime>[0],
  "spawn" | "authMethodId" | "resolveAuthMethodId"
> {
  readonly openGrokSettings: OpenGrokRuntimeSettings | null | undefined;
  readonly environment?: NodeJS.ProcessEnv;
  readonly runtimeMode?: RuntimeMode;
}

export function buildOpenGrokAcpSpawnInput(
  settings: OpenGrokRuntimeSettings | null | undefined,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
  runtimeMode?: RuntimeMode,
): AcpSessionRuntime.AcpSpawnInput {
  const args = [...grokAcpSpawnArgs(runtimeMode)];
  // The server owns this process and its tools, never an existing interactive leader.
  args.splice(args.indexOf("agent") + 1, 0, "--no-leader");
  return {
    command: settings?.binaryPath || "open-grok",
    args,
    cwd,
    env: { ...environment },
  };
}

/** Keep the CLI's provider and credential precedence without starting browser authentication. */
export function resolveOpenGrokAuthMethodId(
  initialized: EffectAcpSchema.InitializeResponse,
): string | undefined {
  const configured = initialized._meta?.defaultAuthMethodId;
  const noninteractive = (id: string) => id === "cached_token" || id === "xai.api_key";
  if (configured !== undefined) {
    return typeof configured === "string" &&
      noninteractive(configured) &&
      initialized.authMethods?.some((method) => method.id === configured && !("type" in method))
      ? configured
      : undefined;
  }
  return initialized.authMethods?.find((method) => noninteractive(method.id) && !("type" in method))
    ?.id;
}

export const makeOpenGrokAcpRuntime = (input: OpenGrokAcpRuntimeInput) =>
  makeXAiAcpRuntime({
    ...input,
    spawn: buildOpenGrokAcpSpawnInput(
      input.openGrokSettings,
      input.cwd,
      input.environment,
      input.runtimeMode,
    ),
    resolveAuthMethodId: resolveOpenGrokAuthMethodId,
  });

export function resolveOpenGrokAcpBaseModelId(model: string | null | undefined): string {
  const normalized = normalizeModelSlug(
    model?.trim() || OPEN_GROK_DEFAULT_MODEL_SLUG,
    OPEN_GROK_DRIVER_KIND,
  );
  return !normalized || normalized === OPEN_GROK_DEFAULT_MODEL_SLUG ? "default" : normalized;
}
