# T4 Code fork

T4 Code is a personal fork of T3 Code. The `t4code` branch starts from upstream
PR #2829, `t3code/codex-turn-mapping`, at `d2f1f511f`. Preserve upstream history
and keep fork changes small so they are easy to merge forward.

## Run locally

```sh
vp i
vp run dev:desktop
```

Use `vp run dev` for the web client. Run `vp run dev:desktop --dry-run` to inspect
the selected ports and home without launching the app.

| Launch                                | Default state directory   |
| ------------------------------------- | ------------------------- |
| T4 desktop build or standalone server | `~/.t4/userdata`          |
| T4 development from the main checkout | `~/.t4/dev`               |
| T4 development in a linked worktree   | `<worktree>/.t4/userdata` |
| Installed upstream T3 Code            | `~/.t3/userdata`          |

`--home-dir` and the existing `T3CODE_HOME` environment variable still override
these defaults. Leave `T3CODE_HOME` unset when using the defaults; explicitly
pointing it at `~/.t3` opts back into upstream's data. No data is copied
automatically. To try existing threads, take a consistent read-only SQLite
snapshot into T4's directory; never share a live database between the apps.
The V2 migration can delete imported V1 events, so going back to nightly requires
the original T3 database, not T4's migrated copy.

Desktop builds use the T4 Code name, `com.mweinbach.t4code` bundle identity,
`t4code` Electron profile, and `t4code://` URL scheme. Development uses separate
`t4code-dev` identifiers. Real desktop automatic updates are disabled; update
this fork by merging upstream and rebuilding. Local mock-update tests remain
available. Existing provider subscriptions and CLI installations still work.

## Build

```sh
vp run dist:desktop:dmg:arm64
```

This produces a separate T4 Code application. It does not install or replace
the existing nightly. Workspace package names, `T3CODE_*` configuration names,
wire contracts, and provider adapters retain upstream names to minimize fork churn.
React Native mobile and SwiftUI mobile app identities are outside this desktop
fork change. Remote clients can connect to T4's server as supported by the
underlying V2 branch.

Orchestrator V2 is the default server runtime. See [agent thread controls](../user/agent-thread-controls.md)
for MCP controls and steering modes, and [OpenGrok](../user/open-grok.md) for
the fork's additional provider.

## Remote server releases

SSH auto-install and background-service upgrades install the exact T4 GitHub
release matching the client or requested server version. The release contains
an npm-installable `@mweinbach/t4code` package with a `t4` executable, bundled
server, and web client. No npm publishing account is required. An existing
upstream `t3` executable on the remote host is not used.

For example, the first release can be run directly with:

```sh
npx --yes --allow-scripts=node-pty,msgpackr-extract --package https://github.com/mweinbach/t4code/releases/download/t4-v0.0.38-t4.1/t4-server.tgz -- t4
```

The target needs supported Node.js and npm/npx. Native dependencies may need a
C/C++ build toolchain. Data stays in `~/.t4`. Installing another version changes
server code without copying or opening the upstream `~/.t3` database.

To release server or client changes, choose a new version such as
`0.0.38-t4.2`, then:

```sh
node scripts/update-release-package-versions.ts 0.0.38-t4.2
git add apps/server/package.json apps/desktop/package.json apps/web/package.json packages/contracts/package.json
git commit -m 'chore(release): prepare T4 0.0.38-t4.2'
git push origin t4code
git tag t4-v0.0.38-t4.2
git push origin t4-v0.0.38-t4.2
```

The `T4 release` workflow builds the server, web client, and desktop installers
from the same commit and package version. It publishes one complete GitHub
release containing:

- `t4-server.tgz`: the npm-installable server and web client.
- `T4-Code-<version>-arm64.dmg` and `.zip`: macOS Apple Silicon.
- `SHA256SUMS`: checksums for those three files.

The workflow uses GitHub-hosted Linux and macOS runners. It verifies the server
package installation and native dependencies, plus the macOS archives and
bundled server version before publication. Intel macOS and Windows installers
are not currently built. The standalone server package still omits optional
native process-metrics binaries; the macOS app includes its resource monitor.

These personal-fork installers are not configured with signing credentials.
macOS builds are not Developer ID signed or notarized. Gatekeeper may require an
explicit override on first launch. T4's app identity and data stay separate from
T3, and desktop automatic updates remain disabled.

Versions are immutable: bump the version instead of replacing a published
asset. The release remains a draft while its assets upload and becomes public
only after all builds pass. Wait for it to finish before distributing an iOS
client that expects that server version. Exact-version installs never fall back
to upstream or a different T4 release. Clients without a usable version select
the latest published T4 release. Turn off the `publish` input on a manual
workflow run to build and verify artifacts without creating a release.
Manual workflow dispatch otherwise performs the same release checks and
publication for the selected commit.

The artifact can also be built locally with `vp run --filter t3 build` followed
by `node scripts/pack-t4-server.ts --out-dir /tmp/t4-release`. Use an empty output
directory. Official fork artifacts come from the clean GitHub workflow checkout.

## Follow upstream

- `origin`: `https://github.com/mweinbach/t4code.git`
- `upstream`: `https://github.com/pingdotgg/t3code.git`
- Current upstream branch: `t3code/codex-turn-mapping`

From a clean working tree on `t4code`:

```sh
git fetch upstream
git merge upstream/t3code/codex-turn-mapping
git push origin t4code
```

Once PR #2829 merges, follow `upstream/main`. Keep fork identity and data-path
changes when resolving conflicts. The original fork's `main` branch is retained.
