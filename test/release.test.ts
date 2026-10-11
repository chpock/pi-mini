import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createAgentSessionServices,
  parseArgs,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  releaseVersion,
  setReleaseVersion,
} from "../.github/scripts/set-release-version.ts";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const releaseScript = join(packageRoot, ".github/scripts/set-release-version.ts");

async function fixture(t: TestContext, versions = ["0.0.0", "0.0.0", "0.0.0"]) {
  const cwd = await mkdtemp(join(tmpdir(), "pi-mini-release-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, "package.json"), JSON.stringify({
    name: "pi-mini",
    version: versions[0],
    scripts: { preversion: "node -e \"process.exit(17)\"" },
  }));
  await writeFile(join(cwd, "package-lock.json"), JSON.stringify({
    name: "pi-mini",
    version: versions[1],
    lockfileVersion: 3,
    packages: { "": { name: "pi-mini", version: versions[2] } },
  }));
  return cwd;
}

async function readVersions(cwd: string) {
  const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(join(cwd, "package-lock.json"), "utf8"));
  return [pkg.version, lock.version, lock.packages[""].version];
}

test("Stable release tags map to their exact npm version", () => {
  for (const [tag, version] of [
    ["v1.0.0", "1.0.0"],
    ["v0.1.0", "0.1.0"],
    ["v12.34.56", "12.34.56"],
  ] as const) {
    assert.equal(releaseVersion(tag), version);
  }
});

test("Non-release tags, normalization, injection and the placeholder are rejected", () => {
  for (const tag of [
    undefined, "", "1.0.0", "refs/tags/v1.0.0", "v1.0", "v1.0.0.1",
    "v01.0.0", "v1.02.0", "v1.0.03", "v1.0.0-rc.1", "v1.0.0+build",
    "v1.0.0\n", "v1.0.0; echo injected", "v9007199254740992.0.0", "v0.0.0",
  ]) {
    assert.throws(() => releaseVersion(tag), /release tag|placeholder/);
  }
});

test("Release CLI updates all three versions without Git commits, tags or version lifecycle scripts", async (t) => {
  const cwd = await fixture(t);
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd });
  const headBefore = await readFile(join(cwd, ".git/HEAD"), "utf8");
  const output = execFileSync(process.execPath, [releaseScript], {
    cwd,
    env: { ...process.env, RELEASE_TAG: "v1.2.3" },
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.match(output, /v1\.2\.3/);
  assert.deepEqual(await readVersions(cwd), ["1.2.3", "1.2.3", "1.2.3"]);
  assert.equal(await readFile(join(cwd, ".git/HEAD"), "utf8"), headBefore);
  assert.equal(execFileSync("git", ["for-each-ref"], { cwd, encoding: "utf8" }), "");
});

test("Invalid release inputs leave the package and lockfile unchanged", async (t) => {
  const cwd = await fixture(t);
  const before = await Promise.all(["package.json", "package-lock.json"].map(
    (name) => readFile(join(cwd, name), "utf8"),
  ));
  assert.throws(() => setReleaseVersion("v1.0.0-rc.1", cwd), /release tag/);
  assert.throws(() => setReleaseVersion("v0.0.0", cwd), /placeholder/);
  const after = await Promise.all(["package.json", "package-lock.json"].map(
    (name) => readFile(join(cwd, name), "utf8"),
  ));
  assert.deepEqual(after, before);
});

test("Release preparation refuses committed release numbers or inconsistent placeholders", async (t) => {
  for (const versions of [
    ["1.0.0", "0.0.0", "0.0.0"],
    ["0.0.0", "1.0.0", "0.0.0"],
    ["0.0.0", "0.0.0", "1.0.0"],
  ]) {
    const cwd = await fixture(t, versions);
    assert.throws(() => setReleaseVersion("v1.2.3", cwd), /0\.0\.0/);
    assert.deepEqual(await readVersions(cwd), versions);
  }
});


test("The real release tarball carries the tag version and loads through Pi's native package loader", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-mini-release-package-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const path of ["package.json", "package-lock.json", "README.md", "LICENSE", "src"]) {
    await cp(join(packageRoot, path), join(cwd, path), { recursive: true });
  }
  setReleaseVersion("v1.2.3", cwd);
  const filename = execFileSync("npm", ["pack", "--ignore-scripts"], {
    cwd,
    encoding: "utf8",
    timeout: 15_000,
  }).trim();
  const extracted = join(cwd, "extracted");
  await mkdir(extracted);
  execFileSync("tar", ["-xzf", join(cwd, filename), "-C", extracted]);
  const installed = join(extracted, "package");
  const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
  assert.equal(manifest.name, "pi-mini");
  assert.equal(manifest.version, "1.2.3");
  assert.equal(manifest.repository.url, "git+https://github.com/chpock/pi-mini.git");
  const parsed = parseArgs(["--tui-mini"]);
  const services = await createAgentSessionServices({
    cwd,
    agentDir: join(cwd, "agent"),
    settingsManager: SettingsManager.inMemory(),
    extensionFlagValues: parsed.unknownFlags,
    resourceLoaderOptions: {
      additionalExtensionPaths: [installed],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    },
  });
  assert.deepEqual(services.diagnostics, []);
  const { extensions, errors, warnings, runtime } = services.resourceLoader.getExtensions();
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings ?? [], []);
  assert.equal(extensions.length, 1);
  assert.equal(extensions[0]?.resolvedPath, join(installed, "src/index.ts"));
  assert.equal(extensions[0]?.flags.get("tui-mini")?.type, "boolean");
  assert.equal(runtime.flagValues.get("tui-mini"), true);
  assert.deepEqual(await readVersions(packageRoot), ["0.0.0", "0.0.0", "0.0.0"]);
});
