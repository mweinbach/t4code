import { OpenGrokSettings } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/unstable/http";
import { ChildProcessSpawner } from "effect/unstable/process";

import { ServerConfig } from "../../config.ts";
import {
  OpenGrokAdapterV2Driver,
  OPEN_GROK_DRIVER_KIND,
} from "../../orchestration-v2/Adapters/OpenGrokAdapterV2.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { makeGrokTextGeneration } from "../../textGeneration/GrokTextGeneration.ts";
import {
  makeOpenGrokAcpRuntime,
  resolveOpenGrokAcpBaseModelId,
} from "../acp/OpenGrokAcpSupport.ts";
import { ProviderDriverError } from "../Errors.ts";
import { enrichGrokSnapshot } from "../Layers/GrokProvider.ts";
import {
  buildInitialOpenGrokProviderSnapshot,
  checkOpenGrokProviderStatus,
} from "../Layers/OpenGrokProvider.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import {
  makeManualOnlyProviderMaintenanceCapabilities,
  makeStaticProviderMaintenanceResolver,
  resolveProviderMaintenanceCapabilitiesEffect,
} from "../providerMaintenance.ts";
import {
  haveProviderSnapshotSettingsChanged,
  makeProviderSnapshotSettingsSource,
  type ProviderSnapshotSettings,
} from "../providerUpdateSettings.ts";
import type { GrokDriverEnv } from "./GrokDriver.ts";
import { withInstanceIdentity } from "./instanceIdentity.ts";

const UPDATE = makeStaticProviderMaintenanceResolver(
  makeManualOnlyProviderMaintenanceCapabilities({
    provider: OPEN_GROK_DRIVER_KIND,
    packageName: null,
  }),
);
const decodeOpenGrokSettings = Schema.decodeSync(OpenGrokSettings);

export type OpenGrokDriverEnv = GrokDriverEnv;

export const OpenGrokDriver: ProviderDriver<OpenGrokSettings, OpenGrokDriverEnv> = {
  driverKind: OPEN_GROK_DRIVER_KIND,
  metadata: { displayName: "OpenGrok", supportsMultipleInstances: true },
  configSchema: OpenGrokSettings,
  defaultConfig: () => decodeOpenGrokSettings({}),
  create: ({ instanceId, displayName, accentColor, environment, enabled, config }) =>
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const httpClient = yield* HttpClient.HttpClient;
      const serverSettings = yield* ServerSettingsService;
      const { cwd } = yield* ServerConfig;
      const processEnv = mergeProviderInstanceEnvironment(environment);
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: OPEN_GROK_DRIVER_KIND,
        instanceId,
      });
      const stampIdentity = withInstanceIdentity({
        instanceId,
        driverKind: OPEN_GROK_DRIVER_KIND,
        displayName,
        accentColor,
        continuationGroupKey: continuationIdentity.continuationKey,
      });
      const effectiveConfig = { ...config, enabled } satisfies OpenGrokSettings;
      const maintenanceCapabilities = yield* resolveProviderMaintenanceCapabilitiesEffect(UPDATE, {
        binaryPath: effectiveConfig.binaryPath,
        env: processEnv,
      });
      const orchestrationAdapter = yield* OpenGrokAdapterV2Driver.create({
        instanceId,
        displayName,
        accentColor,
        environment,
        enabled,
        config,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: OPEN_GROK_DRIVER_KIND,
              instanceId,
              detail: "Failed to build OpenGrok orchestration adapter.",
              cause,
            }),
        ),
      );
      const textGeneration = yield* makeGrokTextGeneration(effectiveConfig, processEnv, {
        displayName: "OpenGrok",
        resolveModelId: resolveOpenGrokAcpBaseModelId,
        makeRuntime: ({ grokSettings, ...input }) =>
          makeOpenGrokAcpRuntime({ ...input, openGrokSettings: grokSettings }),
      });
      const checkProvider = checkOpenGrokProviderStatus(effectiveConfig, processEnv, cwd).pipe(
        Effect.map(stampIdentity),
        Effect.provideService(Crypto.Crypto, crypto),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      );
      const snapshotSettings = makeProviderSnapshotSettingsSource(effectiveConfig, serverSettings);
      const snapshot = yield* makeManagedServerProvider<ProviderSnapshotSettings<OpenGrokSettings>>(
        {
          maintenanceCapabilities,
          getSettings: snapshotSettings.getSettings,
          streamSettings: snapshotSettings.streamSettings,
          haveSettingsChanged: haveProviderSnapshotSettingsChanged,
          initialSnapshot: (settings) =>
            buildInitialOpenGrokProviderSnapshot(settings.provider).pipe(Effect.map(stampIdentity)),
          checkProvider,
          enrichSnapshot: ({ settings, snapshot: currentSnapshot, publishSnapshot }) =>
            enrichGrokSnapshot({
              snapshot: currentSnapshot,
              maintenanceCapabilities,
              enableProviderUpdateChecks: settings.enableProviderUpdateChecks,
              publishSnapshot,
              httpClient,
            }),
        },
      ).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: OPEN_GROK_DRIVER_KIND,
              instanceId,
              detail: `Failed to build OpenGrok snapshot: ${cause.message ?? String(cause)}`,
              cause,
            }),
        ),
      );
      return {
        instanceId,
        driverKind: OPEN_GROK_DRIVER_KIND,
        continuationIdentity,
        displayName,
        accentColor,
        enabled,
        snapshot,
        orchestrationAdapter,
        textGeneration,
      } satisfies ProviderInstance;
    }),
};
