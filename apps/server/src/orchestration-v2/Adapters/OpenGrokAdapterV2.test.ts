import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as EffectAcpErrors from "effect-acp/errors";

import { OpenGrokProviderCapabilitiesV2, steerOpenGrokTurn } from "./OpenGrokAdapterV2.ts";
import type * as AcpSessionRuntime from "../../provider/acp/AcpSessionRuntime.ts";

describe("OpenGrok native steering protocol", () => {
  it.effect(
    "sends ACP's prefixed extension with text, images, and stable interjection identity",
    () =>
      Effect.gen(function* () {
        const calls: Array<{ method: string; payload: unknown }> = [];
        const request: AcpSessionRuntime.AcpSessionRuntime["Service"]["request"] = (
          method,
          payload,
        ) =>
          Effect.sync(() => {
            calls.push({ method, payload });
            return { result: { status: "queued" } };
          });
        const content = [
          { type: "text" as const, text: "Use the new design" },
          { type: "image" as const, data: "aW1hZ2U=", mimeType: "image/png" },
        ];
        yield* steerOpenGrokTurn({
          runtime: { request },
          sessionId: "native-session",
          interjectionId: "user-message-id",
          content,
        });
        expect(calls).toEqual([
          {
            method: "_x.ai/interject",
            payload: {
              sessionId: "native-session",
              interjectionId: "user-message-id",
              text: "Use the new design",
              content,
            },
          },
        ]);
      }),
  );

  it.effect("rejects malformed or failed queue receipts instead of claiming a sent message", () =>
    Effect.gen(function* () {
      for (const response of [
        { result: null, error: { code: "not_running", message: "No active turn" } },
        { result: { status: "queued" }, error: "partial failure" },
        { result: { status: "ignored" } },
      ]) {
        const error = yield* Effect.flip(
          steerOpenGrokTurn({
            runtime: { request: () => Effect.succeed(response) },
            sessionId: "native-session",
            interjectionId: "user-message-id",
            content: [],
          }),
        );
        expect(error._tag).toBe("AcpTransportError");
      }
      const rejected = EffectAcpErrors.AcpRequestError.invalidParams("Unknown session");
      const error = yield* Effect.flip(
        steerOpenGrokTurn({
          runtime: { request: () => Effect.fail(rejected) },
          sessionId: "missing-session",
          interjectionId: "user-message-id",
          content: [],
        }),
      );
      expect(error).toBe(rejected);
    }),
  );

  it("advertises active steering and MCP without unsupported fork or rollback", () => {
    expect(OpenGrokProviderCapabilitiesV2.turns.supportsActiveSteering).toBe(true);
    expect(OpenGrokProviderCapabilitiesV2.tools.supportsMcpTools).toBe(true);
    expect(OpenGrokProviderCapabilitiesV2.threads.canReadThreadSnapshot).toBe(true);
    expect(OpenGrokProviderCapabilitiesV2.threads.canForkThread).toBe(false);
    expect(OpenGrokProviderCapabilitiesV2.threads.canForkFromTurn).toBe(false);
    expect(OpenGrokProviderCapabilitiesV2.checkpointing.providerCanRollbackConversation).toBe(
      false,
    );
  });
});
