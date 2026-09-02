// @effect-diagnostics nodeBuiltinImport:off - Packaging tests use isolated temporary filesystem fixtures.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { packT4Server } from "./pack-t4-server.ts";

const temporaryRoots: string[] = [];

function fixture() {
  const rootDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t4-package-test-"));
  temporaryRoots.push(rootDir);
  const version = "0.0.38-t4.1";
  for (const file of [
    "apps/server/package.json",
    "apps/desktop/package.json",
    "apps/web/package.json",
    "packages/contracts/package.json",
  ]) {
    const path = NodePath.join(rootDir, file);
    NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
    NodeFS.writeFileSync(
      path,
      JSON.stringify({
        name: "t3",
        version,
        license: "MIT",
        engines: { node: ">=24.10" },
        dependencies: { "node-pty": "catalog:", effect: "catalog:" },
        devDependencies: { "@t3tools/shared": "workspace:*" },
      }),
    );
  }
  const dist = NodePath.join(rootDir, "apps/server/dist");
  NodeFS.mkdirSync(NodePath.join(dist, "client"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(dist, "bin.mjs"),
    `#!/usr/bin/env node\nconsole.log('${version}');\n`,
  );
  NodeFS.writeFileSync(NodePath.join(dist, "service-launcher.mjs"), "export {};\n");
  NodeFS.writeFileSync(NodePath.join(dist, "client/index.html"), "<title>T4</title>\n");
  NodeFS.writeFileSync(NodePath.join(rootDir, "LICENSE"), "MIT\n");
  NodeFS.writeFileSync(
    NodePath.join(rootDir, "pnpm-workspace.yaml"),
    "catalog:\n  node-pty: 1.1.0\n  effect: 4.0.0-beta.103\n",
  );
  return { rootDir, outputDirectory: NodePath.join(rootDir, "output") };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
});

describe("T4 server package", () => {
  it("creates an installable fork archive without changing workspace metadata", () => {
    const options = fixture();
    const sourceManifestPath = NodePath.join(options.rootDir, "apps/server/package.json");
    const before = NodeFS.readFileSync(sourceManifestPath, "utf8");
    const result = packT4Server(options);
    const unpackDir = NodePath.join(options.rootDir, "unpacked");
    NodeFS.mkdirSync(unpackDir);
    NodeChildProcess.execFileSync("tar", ["-xzf", result.outputPath, "-C", unpackDir]);
    const packaged = JSON.parse(
      NodeFS.readFileSync(NodePath.join(unpackDir, "package/package.json"), "utf8"),
    );
    expect(packaged).toMatchObject({
      name: "@mweinbach/t4code",
      version: "0.0.38-t4.1",
      bin: { t4: "./dist/bin.mjs" },
      dependencies: { "node-pty": "1.1.0" },
      t4code: true,
    });
    expect(packaged.dependencies).not.toHaveProperty("effect");
    expect(packaged).not.toHaveProperty("devDependencies");
    expect(NodeFS.readFileSync(sourceManifestPath, "utf8")).toBe(before);
    expect(
      NodeChildProcess.execFileSync(
        process.execPath,
        [NodePath.join(unpackDir, "package/dist/bin.mjs"), "--version"],
        { encoding: "utf8" },
      ).trim(),
    ).toBe(result.version);
    expect(NodeFS.existsSync(NodePath.join(unpackDir, "package/dist/service-launcher.mjs"))).toBe(
      true,
    );
    expect(NodeFS.existsSync(NodePath.join(unpackDir, "package/dist/client/index.html"))).toBe(
      true,
    );
    expect(() => packT4Server(options)).toThrow("Refusing to overwrite");
  });

  it("rejects mismatched client versions before publishing an artifact", () => {
    const options = fixture();
    NodeFS.writeFileSync(
      NodePath.join(options.rootDir, "apps/desktop/package.json"),
      JSON.stringify({ version: "0.0.38" }),
    );
    expect(() => packT4Server(options)).toThrow("apps/desktop/package.json must have version");
    expect(NodeFS.existsSync(options.outputDirectory)).toBe(false);
  });

  it("rejects a server bundle without its web client", () => {
    const options = fixture();
    NodeFS.rmSync(NodePath.join(options.rootDir, "apps/server/dist/client/index.html"));
    expect(() => packT4Server(options)).toThrow("Missing dist/client/index.html");
    expect(NodeFS.existsSync(options.outputDirectory)).toBe(false);
  });
});
