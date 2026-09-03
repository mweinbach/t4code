import { HostProcessEnvironment, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { defaultInstanceIdForDriver, OpenGrokSettings } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as EffectAcpErrors from "effect-acp/errors";

import { ServerConfig } from "../../config.ts";
import { makeAcpNativeLoggerFactory } from "../../provider/acp/AcpNativeLogging.ts";
import {
  makeOpenGrokAcpRuntime,
  OPEN_GROK_DRIVER_KIND,
  resolveOpenGrokAcpBaseModelId,
} from "../../provider/acp/OpenGrokAcpSupport.ts";
import { extractGrokPlanMarkdownFromToolCallData } from "../../provider/acp/XAiAcpExtension.ts";
import { ProviderEventLoggers } from "../../provider/Layers/ProviderEventLoggers.ts";
import { mergeProviderInstanceEnvironment } from "../../provider/ProviderInstanceEnvironment.ts";
import { IdAllocatorV2 } from "../IdAllocator.ts";
import { ProviderContinuationRequests } from "../ProviderContinuationRequests.ts";
import {
  ProviderAdapterDriverCreateError,
  type ProviderAdapterDriver,
  type ProviderAdapterDriverCreateInput,
} from "../ProviderAdapterDriver.ts";
import {
  makeAcpAdapterV2,
  type AcpAdapterV2Flavor,
  type AcpAdapterV2SteerInput,
} from "./AcpAdapterV2.ts";
import {
  GrokProviderCapabilitiesV2,
  makeGrokAcpAdapterFlavor,
  type GrokAdapterV2DriverEnv,
  type GrokAdapterV2Options,
} from "./GrokAdapterV2.ts";

export { OPEN_GROK_DRIVER_KIND };
export const OPEN_GROK_DEFAULT_INSTANCE_ID = defaultInstanceIdForDriver(OPEN_GROK_DRIVER_KIND);
export const OpenGrokProviderCapabilitiesV2 = {
  ...GrokProviderCapabilitiesV2,
  turns: { ...GrokProviderCapabilitiesV2.turns, supportsActiveSteering: true },
};

export interface OpenGrokAdapterV2Options extends Omit<GrokAdapterV2Options, "settings"> {
  readonly settings: OpenGrokSettings;
}

const OpenGrokInterjectionResponse = Schema.Struct({
  result: Schema.Struct({ status: Schema.Literal("queued") }),
  error: Schema.optional(Schema.Undefined),
});
const isAcpError = Schema.is(EffectAcpErrors.AcpError);
const decodeOpenGrokSettings = Schema.decodeSync(OpenGrokSettings);

export const steerOpenGrokTurn = (
  input: Omit<AcpAdapterV2SteerInput, "runtime"> & {
    readonly runtime: Pick<AcpAdapterV2SteerInput["runtime"], "request">;
  },
) =>
  input.runtime
    .request("_x.ai/interject", {
      sessionId: input.sessionId,
      interjectionId: input.interjectionId,
      text: input.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n"),
      content: input.content,
    })
    .pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(OpenGrokInterjectionResponse)),
      Effect.mapError((cause) =>
        isAcpError(cause)
          ? cause
          : new EffectAcpErrors.AcpTransportError({
              method: "_x.ai/interject",
              detail: "OpenGrok did not acknowledge the steering message.",
              cause,
            }),
      ),
      Effect.asVoid,
    );

export function makeOpenGrokAcpAdapterFlavor(
  options: OpenGrokAdapterV2Options,
): AcpAdapterV2Flavor {
  const home = options.environment.HOME ?? options.environment.USERPROFILE;
  const openGrokHome =
    options.environment.OPENGROK_HOME ?? (home ? `${home}/.opengrok` : undefined);
  return {
    ...makeGrokAcpAdapterFlavor(options),
    driver: OPEN_GROK_DRIVER_KIND,
    capabilities: OpenGrokProviderCapabilitiesV2,
    resolveModelId: (selection) => resolveOpenGrokAcpBaseModelId(selection.model),
    makeRuntime:
      options.makeRuntime ??
      ((input) =>
        makeOpenGrokAcpRuntime({
          ...input,
          openGrokSettings: options.settings,
          environment: options.environment,
          childProcessSpawner: options.childProcessSpawner,
        })),
    steerTurn: steerOpenGrokTurn,
    extractProposedPlanMarkdown: (toolCall) =>
      extractGrokPlanMarkdownFromToolCallData(toolCall.data, {
        platform: options.hostPlatform,
        environment: { ...options.environment, GROK_HOME: openGrokHome },
      }),
  };
}

export function makeOpenGrokAdapterV2(options: OpenGrokAdapterV2Options) {
  return makeAcpAdapterV2({
    instanceId: options.instanceId,
    flavor: makeOpenGrokAcpAdapterFlavor(options),
    crypto: options.crypto,
    fileSystem: options.fileSystem,
    idAllocator: options.idAllocator,
    serverConfig: options.serverConfig,
    ...(options.nativeLogging === undefined ? {} : { nativeLogging: options.nativeLogging }),
    ...(options.continuationRequests === undefined
      ? {}
      : { continuationRequests: options.continuationRequests }),
  });
}

export type OpenGrokAdapterV2DriverEnv = GrokAdapterV2DriverEnv;

export const OpenGrokAdapterV2Driver: ProviderAdapterDriver<
  OpenGrokSettings,
  OpenGrokAdapterV2DriverEnv
> = {
  driverKind: OPEN_GROK_DRIVER_KIND,
  configSchema: OpenGrokSettings,
  defaultConfig: () => decodeOpenGrokSettings({}),
  create: Effect.fn("OpenGrokAdapterV2Driver.create")(
    function* (input: ProviderAdapterDriverCreateInput<OpenGrokSettings>) {
      const hostEnvironment = yield* HostProcessEnvironment;
      const hostPlatform = yield* HostProcessPlatform;
      const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const crypto = yield* Crypto.Crypto;
      const fileSystem = yield* FileSystem.FileSystem;
      const idAllocator = yield* IdAllocatorV2;
      const providerEventLoggers = yield* ProviderEventLoggers;
      const serverConfig = yield* ServerConfig;
      const continuationRequests = yield* ProviderContinuationRequests;
      const makeNativeLogger = yield* makeAcpNativeLoggerFactory();
      return makeOpenGrokAdapterV2({
        instanceId: input.instanceId,
        settings: { ...input.config, enabled: input.enabled },
        environment: mergeProviderInstanceEnvironment(input.environment, hostEnvironment),
        hostPlatform,
        childProcessSpawner,
        crypto,
        fileSystem,
        idAllocator,
        serverConfig,
        continuationRequests,
        nativeLogging: (threadId) =>
          makeNativeLogger({
            nativeEventLogger: providerEventLoggers.native,
            provider: OPEN_GROK_DRIVER_KIND,
            threadId,
          }),
      });
    },
    (effect, input) =>
      effect.pipe(
        Effect.mapError(
          (cause) =>
            new ProviderAdapterDriverCreateError({
              driver: OPEN_GROK_DRIVER_KIND,
              instanceId: input.instanceId,
              detail: "Failed to create OpenGrok ACP adapter.",
              cause,
            }),
        ),
      ),
  ),
};
