# T4 remote servers

When you add an SSH environment in T4 Code, the app installs the matching T4
server release on that machine. It does not use an existing T3 installation.
The remote machine needs supported Node.js and npm or npx. If installation
reports a native build failure, install your system's C/C++ build tools and retry.

To run a T4 server directly, use the package for your client's version. For
version `0.0.38-t4.1`:

```sh
npx --yes --allow-scripts=node-pty,msgpackr-extract --package https://github.com/mweinbach/t4code/releases/download/t4-v0.0.38-t4.1/t4-server.tgz -- t4 serve
```

Use the printed pairing link or QR code to connect your matching desktop or iOS
client. A server bound only to localhost is reachable only from that machine;
use a reachable host address or Tailscale when connecting from another device.

T4 keeps its data in `~/.t4`, separately from T3's `~/.t3`. Both applications can
remain installed. Explicit home-directory overrides still take precedence.

When a newer T4 client offers a managed-server update, it installs that exact
T4 server version. If the release is unavailable, the update fails without
substituting an upstream T3 build. A manually launched server instead shows the
command needed to install the matching version. Desktop application updates
remain manual.
