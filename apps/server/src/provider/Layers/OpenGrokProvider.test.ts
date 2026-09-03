import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { OpenGrokSettings } from "@t3tools/contracts";
import type * as EffectAcpSchema from "effect-acp/schema";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  buildInitialOpenGrokProviderSnapshot,
  checkOpenGrokProviderStatus,
} from "./OpenGrokProvider.ts";

const decodeSettings = Schema.decodeSync(OpenGrokSettings);
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;
const MODEL_STATE: EffectAcpSchema.SessionModelState = {
  currentModelId: "custom/model-a",
  availableModels: [
    {
      modelId: "custom/model-a",
      name: "Configured model A",
      _meta: {
        supportsReasoningEffort: true,
        reasoningEffort: "high",
        reasoningEfforts: [
          { value: "high", label: "High", default: true },
          { value: "low", label: "Low" },
        ],
      },
    },
    { modelId: "custom/model-b", name: "Configured model B" },
  ],
};

const runFixture = Effect.fn("OpenGrokProvider.test.runFixture")(function* (input: {
  initialized?: Partial<EffectAcpSchema.InitializeResponse>;
  versionExitCode?: number;
  initializeFails?: boolean;
  customModels?: ReadonlyArray<string>;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t4-opengrok-probe-" });
  const binaryPath = path.join(dir, "open-grok");
  const agentPath = path.join(dir, "agent.mjs");
  const callsPath = path.join(dir, "calls.jsonl");
  const initialized: EffectAcpSchema.InitializeResponse = {
    protocolVersion: 1,
    authMethods: [],
    agentCapabilities: {},
    ...input.initialized,
  };
  yield* fs.writeFileString(callsPath, "");
  yield* fs.writeFileString(
    agentPath,
    [
      'import { appendFileSync } from "node:fs";',
      'import { createInterface } from "node:readline";',
      'createInterface({ input: process.stdin }).on("line", (line) => {',
      "  const request = JSON.parse(line);",
      `  appendFileSync(${encodeJson(callsPath)}, JSON.stringify({ method: request.method }) + "\\n");`,
      '  if (request.method !== "initialize") process.exit(5);',
      input.initializeFails
        ? '  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32603, message: "fixture failure" } }) + "\\n");'
        : `  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: ${encodeJson(initialized)} }) + "\\n");`,
      "});",
    ].join("\n"),
  );
  yield* fs.writeFileString(
    binaryPath,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> ${quote(path.join(dir, "commands.txt"))}`,
      'if [ "$1" = "--version" ]; then',
      "  printf 'open-grok 1.0.13-open-grok.87 (240c99c9)\\n'",
      input.versionExitCode ? "  printf 'secret-value' >&2" : "",
      `  exit ${input.versionExitCode ?? 0}`,
      "fi",
      `exec ${quote(process.execPath)} ${quote(agentPath)}`,
      "",
    ].join("\n"),
  );
  yield* fs.chmod(binaryPath, 0o755);
  const snapshot = yield* checkOpenGrokProviderStatus(
    decodeSettings({ enabled: true, binaryPath, customModels: input.customModels ?? [] }),
    {},
    dir,
  );
  return {
    snapshot,
    calls: yield* fs.readFileString(callsPath),
    commands: (yield* fs.readFileString(path.join(dir, "commands.txt"))).trim().split("\n"),
  };
}, Effect.scoped);

describe("buildInitialOpenGrokProviderSnapshot", () => {
  it.effect(
    "keeps disabled OpenGrok separate from Grok and uses its configured-model fallback",
    () =>
      Effect.gen(function* () {
        const snapshot = yield* buildInitialOpenGrokProviderSnapshot(
          decodeSettings({ enabled: false }),
        );
        expect(snapshot.displayName).toBe("OpenGrok");
        expect(snapshot.status).toBe("disabled");
        expect(snapshot.installed).toBe(false);
        expect(snapshot.models.map((model) => model.slug)).toEqual(["open-grok"]);
      }),
  );
});

it.layer(NodeServices.layer)("checkOpenGrokProviderStatus", (it) => {
  it.effect("reports missing OpenGrok without falling back to the Grok binary", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkOpenGrokProviderStatus(
        decodeSettings({ enabled: true, binaryPath: "/definitely/missing/open-grok" }),
      );
      expect(snapshot.installed).toBe(false);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toContain("OpenGrok");
    }),
  );

  it.effect("stops after a failed version probe without exposing stderr", () =>
    Effect.gen(function* () {
      const { snapshot, calls, commands } = yield* runFixture({ versionExitCode: 2 });
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).not.toContain("secret-value");
      expect(commands).toEqual(["--version"]);
      expect(calls).toBe("");
    }),
  );

  it.effect(
    "discovers model options using initialize only and preserves the OpenGrok version",
    () =>
      Effect.gen(function* () {
        const { snapshot, calls, commands } = yield* runFixture({
          initialized: {
            authMethods: [{ id: "cached_token", name: "Grok account" }],
            _meta: { defaultAuthMethodId: "cached_token", modelState: MODEL_STATE },
          },
          customModels: ["custom/model-a", "extra-model"],
        });
        expect(snapshot.status).toBe("ready");
        expect(snapshot.version).toBe("1.0.13-open-grok.87");
        expect(snapshot.auth).toEqual({
          status: "authenticated",
          type: "cached_token",
          label: "Grok account",
        });
        expect(snapshot.models.map((model) => [model.slug, model.isCustom])).toEqual([
          ["custom/model-a", false],
          ["custom/model-b", false],
          ["open-grok", false],
          ["extra-model", true],
        ]);
        expect(snapshot.models[0]?.isDefault).toBe(true);
        expect(snapshot.models[0]?.capabilities?.optionDescriptors?.[0]).toMatchObject({
          id: "reasoningEffort",
          currentValue: "high",
          options: [
            { id: "high", label: "High", isDefault: true },
            { id: "low", label: "Low" },
          ],
        });
        expect(commands).toEqual(["--version", "agent --no-leader stdio"]);
        expect(calls).toBe('{"method":"initialize"}\n');
      }),
  );

  it.effect("keeps configured providers usable when Grok authentication methods are absent", () =>
    Effect.gen(function* () {
      const { snapshot } = yield* runFixture({
        initialized: { authMethods: [], _meta: { modelState: MODEL_STATE } },
      });
      expect(snapshot.status).toBe("ready");
      expect(snapshot.auth.status).toBe("unknown");
      expect(snapshot.models.map((model) => model.slug)).toEqual([
        "custom/model-a",
        "custom/model-b",
        "open-grok",
      ]);
      expect(snapshot.message).toBeUndefined();
    }),
  );

  it.effect("keeps unknown configured provider authentication methods unknown", () =>
    Effect.gen(function* () {
      const { snapshot } = yield* runFixture({
        initialized: {
          authMethods: [{ id: "custom-provider", name: "Configured provider" }],
          _meta: { defaultAuthMethodId: "custom-provider", modelState: MODEL_STATE },
        },
      });
      expect(snapshot.auth).toEqual({ status: "unknown" });
      expect(snapshot.status).toBe("ready");
    }),
  );

  it.effect("does not report an interactive grok.com login option as authenticated", () =>
    Effect.gen(function* () {
      const { snapshot, calls } = yield* runFixture({
        initialized: {
          authMethods: [
            { id: "grok.com/oidc", name: "Log in with Grok" },
            { id: "cached_token", name: "Grok account" },
          ],
          _meta: { defaultAuthMethodId: "grok.com/oidc", modelState: MODEL_STATE },
        },
      });
      expect(snapshot.auth).toEqual({ status: "unknown" });
      expect(snapshot.status).toBe("ready");
      expect(calls).toBe('{"method":"initialize"}\n');
    }),
  );

  it.effect(
    "retains the configured-model fallback with unknown authentication for missing metadata",
    () =>
      Effect.gen(function* () {
        const { snapshot } = yield* runFixture({});
        expect(snapshot.status).toBe("ready");
        expect(snapshot.auth.status).toBe("unknown");
        expect(snapshot.models.map((model) => model.slug)).toEqual(["open-grok"]);
      }),
  );

  it.effect("degrades to fallback models when ACP initialize fails", () =>
    Effect.gen(function* () {
      const { snapshot, calls, commands } = yield* runFixture({ initializeFails: true });
      expect(snapshot.installed).toBe(true);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.auth.status).toBe("unknown");
      expect(snapshot.models.map((model) => model.slug)).toEqual(["open-grok"]);
      expect(snapshot.message).toContain("ACP initialize failed");
      expect(commands).toEqual(["--version", "agent --no-leader stdio"]);
      expect(calls).toBe('{"method":"initialize"}\n');
    }),
  );
});
