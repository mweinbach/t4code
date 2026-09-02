#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - Standalone artifact packaging does not start an Effect runtime.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeUtil from "node:util";
import * as Schema from "effect/Schema";

import { fromYaml } from "@t3tools/shared/schemaYaml";
import {
  T4_RELEASE_REPOSITORY,
  T4_SERVER_ASSET_NAME,
  T4_SERVER_BIN,
  T4_SERVER_PACKAGE_NAME,
} from "@t3tools/shared/t4Release";
import { selectCliRuntimeExternalDependencies } from "./lib/cli-external-packages.ts";
import { resolveCatalogDependencies } from "./lib/resolve-catalog.ts";

const PackageMetadata = Schema.Struct({
  version: Schema.String,
  license: Schema.String,
  engines: Schema.Record(Schema.String, Schema.String),
  dependencies: Schema.Record(Schema.String, Schema.String),
});
const PackageVersion = Schema.Struct({ version: Schema.String });
const WorkspaceConfig = Schema.Struct({
  catalog: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
const NpmPackResult = Schema.Array(Schema.Struct({ filename: Schema.String }));
const decodePackageMetadata = Schema.decodeUnknownSync(PackageMetadata);
const decodePackageVersion = Schema.decodeUnknownSync(PackageVersion);
const decodeWorkspaceConfig = Schema.decodeUnknownSync(fromYaml(WorkspaceConfig));
const decodeNpmPackResult = Schema.decodeUnknownSync(NpmPackResult);

const releasePackageFiles = [
  "apps/server/package.json",
  "apps/desktop/package.json",
  "apps/web/package.json",
  "packages/contracts/package.json",
] as const;

export function packT4Server({
  rootDir = NodePath.resolve(import.meta.dirname, ".."),
  outputDirectory,
}: {
  readonly rootDir?: string;
  readonly outputDirectory: string;
}) {
  const serverDir = NodePath.join(rootDir, "apps/server");
  const source = decodePackageMetadata(
    JSON.parse(NodeFS.readFileSync(NodePath.join(serverDir, "package.json"), "utf8")),
  );
  if (!/^\d+\.\d+\.\d+-t4\.\d+$/.test(source.version)) {
    throw new Error(
      `Expected a fork release version like 0.0.38-t4.1; received ${source.version}.`,
    );
  }
  for (const file of releasePackageFiles) {
    const metadata = decodePackageVersion(
      JSON.parse(NodeFS.readFileSync(NodePath.join(rootDir, file), "utf8")),
    );
    if (metadata.version !== source.version) {
      throw new Error(`${file} must have version ${source.version}; received ${metadata.version}.`);
    }
  }
  for (const file of ["dist/bin.mjs", "dist/service-launcher.mjs", "dist/client/index.html"]) {
    if (!NodeFS.existsSync(NodePath.join(serverDir, file))) {
      throw new Error(`Missing ${file}. Build first with: vp run --filter t3 build`);
    }
  }

  const workspace = decodeWorkspaceConfig(
    NodeFS.readFileSync(NodePath.join(rootDir, "pnpm-workspace.yaml"), "utf8"),
  );
  const dependencies = resolveCatalogDependencies(
    selectCliRuntimeExternalDependencies(source.dependencies),
    workspace.catalog ?? {},
    "T4 server artifact",
  );
  for (const [name, spec] of Object.entries(dependencies)) {
    if (/^(?:workspace|catalog|link|file):/.test(spec)) {
      throw new Error(`Dependency ${name} cannot be installed outside the workspace: ${spec}.`);
    }
  }

  const outputPath = NodePath.resolve(outputDirectory, T4_SERVER_ASSET_NAME);
  NodeFS.mkdirSync(NodePath.dirname(outputPath), { recursive: true });
  if (NodeFS.existsSync(outputPath)) {
    throw new Error(`Refusing to overwrite ${outputPath}. Use an empty output directory.`);
  }
  const stagingDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t4-server-pack-"));
  try {
    NodeFS.cpSync(NodePath.join(serverDir, "dist"), NodePath.join(stagingDir, "dist"), {
      recursive: true,
    });
    NodeFS.copyFileSync(NodePath.join(rootDir, "LICENSE"), NodePath.join(stagingDir, "LICENSE"));
    NodeFS.writeFileSync(
      NodePath.join(stagingDir, "package.json"),
      `${JSON.stringify(
        {
          name: T4_SERVER_PACKAGE_NAME,
          version: source.version,
          description: "T4 Code personal fork server and web client",
          license: source.license,
          repository: {
            type: "git",
            url: `https://github.com/${T4_RELEASE_REPOSITORY}`,
            directory: "apps/server",
          },
          bin: { [T4_SERVER_BIN]: "./dist/bin.mjs" },
          type: "module",
          files: ["dist", "LICENSE"],
          engines: source.engines,
          dependencies,
          t4code: true,
        },
        null,
        2,
      )}\n`,
    );
    const result = decodeNpmPackResult(
      JSON.parse(
        NodeChildProcess.execFileSync("npm", ["pack", "--ignore-scripts", "--json"], {
          cwd: stagingDir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "inherit"],
        }),
      ),
    );
    const archive = result[0];
    if (result.length !== 1 || archive === undefined) {
      throw new Error("npm pack did not produce exactly one package.");
    }
    NodeFS.copyFileSync(
      NodePath.join(stagingDir, archive.filename),
      outputPath,
      NodeFS.constants.COPYFILE_EXCL,
    );
    return { outputPath, version: source.version };
  } finally {
    NodeFS.rmSync(stagingDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const { values } = NodeUtil.parseArgs({ options: { "out-dir": { type: "string" } } });
  if (values["out-dir"] === undefined) {
    throw new Error("Usage: node scripts/pack-t4-server.ts --out-dir <empty output directory>");
  }
  const result = packT4Server({ outputDirectory: values["out-dir"] });
  NodeProcess.stdout.write(`Packed T4 Code ${result.version}: ${result.outputPath}\n`);
}
