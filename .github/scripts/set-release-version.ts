import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function releaseVersion(tag: string | undefined): string {
  const match = tag?.match(/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!match || match[0] !== tag || !match.slice(1).every((part) => Number.isSafeInteger(Number(part)))) {
    throw new Error("Expected a stable release tag vMAJOR.MINOR.PATCH with npm-compatible numeric components.");
  }
  const version = match.slice(1).join(".");
  if (version === "0.0.0") {
    throw new Error("0.0.0 is the local development placeholder and must not be published.");
  }
  return version;
}

export function setReleaseVersion(tag: string | undefined, cwd = process.cwd()): void {
  const version = releaseVersion(tag);
  const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(cwd, "package-lock.json"), "utf8"));
  if (pkg.version !== "0.0.0" || lock.version !== "0.0.0" || lock.packages?.[""]?.version !== "0.0.0") {
    throw new Error("The checked-out package and both root lockfile entries must use 0.0.0 before release preparation.");
  }
  execFileSync("npm", ["version", version, "--no-git-tag-version", "--ignore-scripts"], {
    cwd,
    stdio: "inherit",
  });
}

if (import.meta.main) {
  setReleaseVersion(process.env.RELEASE_TAG);
}
