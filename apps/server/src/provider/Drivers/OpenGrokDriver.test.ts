import { describe, expect, it } from "@effect/vitest";
import { ProviderInstanceId, ServerSettings } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { BUILT_IN_DRIVERS } from "../builtInDrivers.ts";
import { deriveProviderInstanceConfigMap } from "../Layers/ProviderInstanceRegistryHydration.ts";
import { BUILT_IN_PROVIDER_ADAPTER_DRIVERS_V2 } from "../../orchestration-v2/builtInProviderAdapterDrivers.ts";

const decodeServerSettings = Schema.decodeSync(ServerSettings);

describe("OpenGrok default provider hydration", () => {
  it("creates a separate enabled OpenGrok instance and keeps official Grok configuration separate", () => {
    const config = deriveProviderInstanceConfigMap(decodeServerSettings({}));
    expect(config[ProviderInstanceId.make("open-grok")]).toEqual({
      driver: "open-grok",
      config: { enabled: true, binaryPath: "open-grok", customModels: [] },
    });
    expect(config[ProviderInstanceId.make("grok")]?.driver).toBe("grok");
    expect(BUILT_IN_DRIVERS.filter((driver) => driver.driverKind === "open-grok")).toHaveLength(1);
    expect(
      BUILT_IN_PROVIDER_ADAPTER_DRIVERS_V2.filter((driver) => driver.driverKind === "open-grok"),
    ).toHaveLength(1);
  });

  it("preserves explicit instance disablement and executable overrides", () => {
    const config = deriveProviderInstanceConfigMap(
      decodeServerSettings({
        providerInstances: {
          "open-grok": {
            driver: "open-grok",
            config: {
              enabled: false,
              binaryPath: "/another/open-grok",
              customModels: ["custom/model"],
            },
          },
        },
      }),
    );
    expect(config[ProviderInstanceId.make("open-grok")]?.config).toEqual({
      enabled: false,
      binaryPath: "/another/open-grok",
      customModels: ["custom/model"],
    });
  });
});
