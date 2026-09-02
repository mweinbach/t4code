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
the existing nightly. Package names, `T3CODE_*` configuration names, wire
contracts, and provider adapters retain upstream names to minimize fork churn.
React Native mobile and SwiftUI mobile app identities are outside this desktop
fork change. Remote clients can connect to T4's server as supported by the
underlying V2 branch.

SSH auto-install and background-service runtime downloads still resolve the
upstream npm `t3` package. They do not distribute this fork. For remote V2 use,
run a checkout/build of T4 on that machine and connect to its existing server;
do not use the upstream installer as a T4 upgrade path.

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
