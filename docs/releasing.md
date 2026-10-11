# CI and npm releases

Maintainer documentation for validation and publication. For local development and packaging checks, see [development](development.md); for user installation, see [usage](usage.md).

## Behavior

`.github/workflows/ci.yml` defines one workflow with two jobs:

- `ci` runs on a push to any branch, on pull requests, and on tags shaped like `v1.2.3`. It uses Node.js 24 on a GitHub-hosted Ubuntu runner, installs the lockfile dependencies with lifecycle scripts disabled, then runs `npm run check` and `npm test`. A branch push checks the pushed tip, not each intermediate commit in a batch; local commits alone do not trigger GitHub Actions.
- `publish` requires successful `ci` in the same workflow run and executes only for a tag push in `chpock/pi-mini`. Both jobs check out the event's exact commit SHA, rather than looking up a moving tag or a different successful branch run. Failed, cancelled, or skipped CI prevents publication.

The publish job installs dependencies in a fresh checkout without a dependency cache, then executes `.github/scripts/set-release-version.ts`. This script validates the triggering tag and requires `0.0.0` in the manifest and both root lockfile version entries before calling:

```sh
npm version <tag-version> --no-git-tag-version --ignore-scripts
```

It updates the three version entries only in the job's checkout. It does not commit, create a tag, or push. The workflow checks the package contents with `npm pack --dry-run`, then calls `npm publish --access public --tag latest` with lifecycle scripts disabled and the public npm registry explicitly selected. This is direct publication, not staged publication.

Only stable `vMAJOR.MINOR.PATCH` tags are supported. Numeric components must be npm-compatible and have no leading zeros. Prereleases and build metadata are not release triggers. `v0.0.0` is rejected because `0.0.0` is the local development placeholder. npm errors, including an already-published version, fail the job; the workflow does not suppress failures or fall back to another authentication method supplied by a project secret.

The workflow grants read-only repository access by default. Only the publish job requests `id-token: write`, allowing npm to authenticate the specific GitHub workflow with a short-lived OIDC identity. Checkout does not retain Git credentials. The official checkout/setup-node actions are pinned to immutable commit SHAs. No npm publishing token is stored in this repository or required in GitHub Secrets.

## One-time npm setup

1. Ensure the intended source and `.github/workflows/ci.yml` are committed and pushed to GitHub. Untracked or unpushed local files are not available to GitHub Actions. Do not create a release tag until its commit contains the complete package and workflow.
2. Sign in to npm as **`kchpock`**, the owner of [pi-mini](https://www.npmjs.com/package/pi-mini). Keep account 2FA enabled.
3. Open the package's **Settings → Trusted Publisher**, select **GitHub Actions**, and enter:

   | Field | Value |
   | --- | --- |
   | Organization or user | `chpock` |
   | Repository | `pi-mini` |
   | Workflow filename | `ci.yml` |
   | Environment name | Leave empty |
   | Allowed actions | Enable direct `npm publish`, not just `npm stage publish` |

   The first field is the **GitHub** account, not the npm username. Enter only `ci.yml`, not `.github/workflows/ci.yml`. All values must match exactly.
4. Complete the first successful publish within **two days** of creating the trusted publisher. npm expires an unvalidated configuration after that window; delete and recreate an expired entry before trying again. Create this setting when ready to release, not far in advance.

The account's local `npm login` does not authenticate GitHub Actions. No `NPM_TOKEN` secret is needed. npm validates trust only at publication time, not when the setting is saved. The package's `repository.url` points to `git+https://github.com/chpock/pi-mini.git`, as required for GitHub publishing. The repository and package are public, so npm can generate provenance automatically.

## Releasing

After the setup above and successful validation of the intended source:

```sh
git tag v1.0.0
git push origin v1.0.0
```

These commands publish a real release once the tag's CI succeeds. Select the intended version and commit before running them; this document is not authorization for an agent to create or push tags. Monitor the workflow's CI and publish jobs in GitHub Actions. The package version in the repository remains `0.0.0`; a successful release should appear in npm as `1.0.0` for the example above.

The earlier staged `0.0.0` upload was only for registration; do not approve it as a real release. The public `0.0.0-stage` placeholder is not the extension release.

## Validation boundaries

`test/release.test.ts` exercises tag parsing and actual npm version updates, rejects invalid inputs before mutation, verifies lifecycle-script suppression, and builds/extracts a real release tarball that is loaded through Pi's native package loader. Tests do not inspect workflow strings or pretend to execute GitHub Actions. Workflow syntax and action/permission expressions are checked separately with `actionlint`.

Local checks cannot prove GitHub event delivery, the job dependency behavior on a real runner, the saved npm trust configuration, OIDC token exchange, or a successful registry publication. Those remain unverified until the workflow runs on GitHub and the first authorized release completes. No live publish is part of local validation.

The [known Pi core limitations](known-issues.md) remain unchanged, including the [strict expected-failure test](development.md#strict-expected-failure-for-paste-transfer) for large pending paste transfer. A passing suite reproduces that core defect; it does not mean the defect is fixed.

## References

- [GitHub Actions job dependencies](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds)
- [GitHub branch/tag filters](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushbranchestagsbranches-ignoretags-ignore)
- [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/)
