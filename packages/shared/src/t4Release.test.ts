import { describe, expect, it } from "vite-plus/test";
import { getT4ServerPackageSpec } from "./t4Release.ts";

describe("T4 server distribution", () => {
  it.each(["0.0.38-t4.1", "0.0.38-t4.2", "1.2.3"])(
    "pins version %s to an immutable fork release",
    (version) => {
      expect(getT4ServerPackageSpec(version)).toBe(
        `https://github.com/mweinbach/t4code/releases/download/t4-v${version}/t4-server.tgz`,
      );
    },
  );

  it("keeps exact versions with build metadata pinned", () => {
    expect(getT4ServerPackageSpec("0.0.38-t4.1+build.2")).toBe(
      "https://github.com/mweinbach/t4code/releases/download/t4-v0.0.38-t4.1%2Bbuild.2/t4-server.tgz",
    );
  });

  it.each([undefined, "", "dev", "../upstream", "1.2.3/other.tgz", "1.2.3-.."])(
    "keeps an unversioned build on the fork (%s)",
    (version) => {
      expect(getT4ServerPackageSpec(version)).toBe(
        "https://github.com/mweinbach/t4code/releases/latest/download/t4-server.tgz",
      );
    },
  );
});
