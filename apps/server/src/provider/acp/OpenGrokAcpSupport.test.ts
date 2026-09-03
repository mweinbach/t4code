import { describe, expect, it } from "@effect/vitest";

import {
  buildOpenGrokAcpSpawnInput,
  resolveOpenGrokAcpBaseModelId,
  resolveOpenGrokAuthMethodId,
} from "./OpenGrokAcpSupport.ts";

describe("OpenGrok ACP launch", () => {
  it("uses its own executable and preserves OpenGrok configuration without attaching a leader", () => {
    expect(
      buildOpenGrokAcpSpawnInput(undefined, "/project", {
        OPENGROK_HOME: "/private/open-grok",
        GROK_OAUTH2_REFERRER: "configured-referrer",
      }),
    ).toEqual({
      command: "open-grok",
      args: ["agent", "--no-leader", "stdio"],
      cwd: "/project",
      env: {
        OPENGROK_HOME: "/private/open-grok",
        GROK_OAUTH2_REFERRER: "configured-referrer",
      },
    });
  });

  it.each([
    ["approval-required", ["--permission-mode", "default", "agent", "--no-leader", "stdio"]],
    ["auto-accept-edits", ["--permission-mode", "acceptEdits", "agent", "--no-leader", "stdio"]],
    ["auto", ["--permission-mode", "auto", "agent", "--no-leader", "stdio"]],
    ["full-access", ["agent", "--no-leader", "--always-approve", "stdio"]],
  ] as const)("honors %s permissions with an isolated agent", (mode, expected) => {
    const spawn = buildOpenGrokAcpSpawnInput(
      { binaryPath: "/custom/open-grok" },
      "/project",
      {},
      mode,
    );
    expect(spawn.command).toBe("/custom/open-grok");
    expect(spawn.args).toEqual(expected);
  });
});

describe("OpenGrok model and auth selection", () => {
  it("keeps the configured model for its product fallback and passes real catalog IDs unchanged", () => {
    expect(resolveOpenGrokAcpBaseModelId("open-grok")).toBe("default");
    expect(resolveOpenGrokAcpBaseModelId(undefined)).toBe("default");
    expect(resolveOpenGrokAcpBaseModelId("  custom/provider-model  ")).toBe(
      "custom/provider-model",
    );
  });

  it("honors the CLI's cached-token precedence over a listed API key", () => {
    expect(
      resolveOpenGrokAuthMethodId({
        protocolVersion: 1,
        authMethods: [
          { id: "xai.api_key", name: "API key" },
          { id: "cached_token", name: "Cached" },
        ],
        _meta: { defaultAuthMethodId: "cached_token" },
      }),
    ).toBe("cached_token");
  });

  it.each(["grok.com", "oidc", null])(
    "never selects interactive or unavailable default %s",
    (defaultAuthMethodId) => {
      expect(
        resolveOpenGrokAuthMethodId({
          protocolVersion: 1,
          authMethods: [
            { id: "grok.com", name: "Log in" },
            { id: "xai.api_key", name: "API key" },
          ],
          _meta: { defaultAuthMethodId },
        }),
      ).toBeUndefined();
    },
  );

  it("uses an advertised noninteractive method on older metadata and leaves other provider auth alone", () => {
    expect(
      resolveOpenGrokAuthMethodId({
        protocolVersion: 1,
        authMethods: [
          { id: "grok.com", name: "Log in" },
          { id: "xai.api_key", name: "API key" },
        ],
      }),
    ).toBe("xai.api_key");
    expect(resolveOpenGrokAuthMethodId({ protocolVersion: 1, authMethods: [] })).toBeUndefined();
  });
});
