export const T4_RELEASE_REPOSITORY = "mweinbach/t4code";
export const T4_SERVER_PACKAGE_NAME = "@mweinbach/t4code";
export const T4_SERVER_BIN = "t4";
export const T4_SERVER_ASSET_NAME = "t4-server.tgz";
export const T4_NATIVE_INSTALL_SCRIPTS = ["node-pty", "msgpackr-extract"] as const;
export const T4_NPX_INSTALL_FLAGS = `--allow-scripts=${T4_NATIVE_INSTALL_SCRIPTS.join(",")}`;

const NUMBER = "(?:0|[1-9]\\d*)";
const PRERELEASE = `(?:${NUMBER}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
const EXACT_VERSION = new RegExp(
  `^${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-${PRERELEASE}(?:\\.${PRERELEASE})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
);
const RELEASES_URL = `https://github.com/${T4_RELEASE_REPOSITORY}/releases`;

export function getT4ReleaseTag(version: string): string {
  return `t4-v${version.trim()}`;
}

/** Resolves an exact fork build when available, or the latest published fork build. */
export function getT4ServerPackageSpec(version?: string): string {
  const normalized = version?.trim();
  return normalized && EXACT_VERSION.test(normalized)
    ? `${RELEASES_URL}/download/${encodeURIComponent(getT4ReleaseTag(normalized))}/${T4_SERVER_ASSET_NAME}`
    : `${RELEASES_URL}/latest/download/${T4_SERVER_ASSET_NAME}`;
}
