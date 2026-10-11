# Development

User-facing setup is in the [README](../README.md) and [usage guide](usage.md). Current runtime contracts are described in [implementation](implementation.md); this document is for contributors.

## Local setup

Requires Node.js **22.19 or newer** and npm. Locked development dependencies use Pi **1.1.0**. CI uses Node.js 24.

```sh
npm ci --ignore-scripts
npm run check
npm test
```

Pi loads the TypeScript entry point directly; no build step is required. The host supplies Pi's extension API and terminal UI packages at runtime.

## Run the local extension

```sh
npm run dev -- --tui-mini --tui-mode regular
```

`npm run dev` already passes `--no-session` and loads the checkout. Without `--tui-mini`, the extension remains inactive.

If an installed copy of pi-mini is also configured, avoid loading both copies. An isolated extension selection is:

```sh
pi --offline --no-session --tui-mini --tui-mode regular --no-extensions -e .
```

Run from the repository root. This isolates extension selection, not provider settings, project instructions, skills, or other resources. For fully isolated tests, use a temporary `PI_CODING_AGENT_DIR` and explicit fixture configuration as the native integration tests do. Do not send model requests or modify operator settings as an incidental test side effect.

## Code map

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Flag/TUI boundary, component installation, hook lifecycle. |
| `src/editor.ts` | Prompt formatting and borderless native editor presentation. |
| `src/thinking-status.ts` | Reversible private-method hook for thinking status output. |
| `test/extension.test.ts` | Real package loading, CLI flag handling, activation and non-TUI safeguards. |
| `test/editor.test.ts` | Theme colors, input, layout, cursor/mouse coordinates, native editor installation. |
| `test/thinking-status.test.ts` | Filtering, cleanup, native switching, events, defaults, and redraws. |
| `test/release.test.ts` | Version validation, native npm mutation boundaries, and packaged extension loading. |
| `.github/scripts/set-release-version.ts` | Release version assignment in the publish checkout. |

## Validation

Run `npm run check` for strict TypeScript checks and `npm test` for observable behavior. Native fixtures exercise Pi's own package loader, editor, session services, and thinking handlers without model requests.

CLI `--help` is only a discovery check: Pi prints help before reporting runtime diagnostics, so its exit code and flag listing do not prove flag acceptance. Native service tests cover applied flag values and the activation boundary; real CLI checks must use a path that reaches runtime diagnostics.

Tests should prove behavior, not that code or workflow YAML contains particular strings. Workflow syntax is checked separately with `actionlint`. Local tests or publish dry-runs do not prove a GitHub/OIDC/npm release; see [releasing](releasing.md#validation-boundaries).

Changes affecting terminal presentation also need real TUI checks appropriate to their impact: regular/fullscreen rendering, input, resizing, and shutdown/reload where relevant. Keep model traffic and operator configuration untouched unless a check explicitly requires and authorizes them.

### Strict expected failure for paste transfer

Pi 1.1.0 loses a large-paste marker's backing contents when replacing an editor. [Known issues](known-issues.md#large-pastes-at-editor-replacement) describes the effect and core cause. The native installer regression runs actively; it is not skipped or marked `todo`.

```sh
node --test --test-name-pattern='Native editor installation expects the known large-paste loss' test/editor.test.ts
```

The test accepts only the reproduced preservation assertion failure where **both expanded input and submitted text equal the original paste marker**. Its matcher checks the assertion name, code, operator, expected values, and exact observed marker values—not just that an exception was thrown. Setup, installation, expanded-text reads, and submission execute outside the expected-failure assertion. Unrelated exceptions, partial preservation, a different marker, or a missing submission fail the test.

Unexpected full preservation also fails with an instruction to review compatibility with the tested Pi core before changing the expectation. Guard tests cover the known observation, unexpected preservation, and changed outcomes. A passing suite reproduces the known core defect; it does not mean data loss is fixed.

The project decision is to document this upstream defect without an extension-side save/restore workaround or changes to Pi core. Preserving the old draft is the core editor installer's responsibility, not the presentation subclass's; an extension-side transfer would take over that responsibility rather than correct the owning API. Revisit the expectation only after understanding changed core behavior and its effect on the extension.

## Packaging and releases

The repository version stays at `0.0.0` in the manifest and both root lockfile entries. CI derives the public version from a stable release tag and applies it only to the publish checkout.

The npm package includes `src/`, `README.md`, `LICENSE`, and its manifest—not contributor docs, tests, or release scripts. README documentation links therefore point to GitHub so they also work from the npm package page. Check contents without publishing:

```sh
npm pack --dry-run --ignore-scripts
```

For Trusted Publisher setup, tag constraints, and the CI-to-publish gate, see [releasing](releasing.md). No commit, push, tag creation, or registry publication is implied by local validation.
