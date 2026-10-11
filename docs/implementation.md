# Implementation and compatibility

This document describes current behavior and technical dependencies. For installation and everyday use, see [usage](usage.md). For working on the code, see [development](development.md).

## Activation and lifecycle

`src/index.ts` registers Pi's native boolean `tui-mini` flag with a `false` default. At `session_start`, after CLI values have been applied, it requires both:

```text
pi.getFlag("tui-mini") === true
ctx.mode === "tui"
```

Pi's built-in `--tui-mode` accepts only `regular` and `fullscreen`; it rejects `mini` before loading extensions. Mini mode therefore uses the separate `--tui-mini` flag rather than trying to extend that parser option.

The extension factory runs before CLI flag values are assigned. Checking the flag there would be too early; `session_start` is the activation boundary.

Only then does it install the thinking-status filter, empty footer, and custom editor. Both Pi terminal renderers (`regular` and `fullscreen`) are supported. Without the flag, and in RPC, JSON, print, or other non-TUI modes, it installs no UI changes or filter.

A prior thinking-status hook is deactivated/restored before another session-start activation, preventing stacked hooks. `session_shutdown`, including reload, also deactivates/restores it. Cleanup is idempotent. UI component installation uses Pi's native extension lifecycle.

The extension registers no tools, commands, or shortcuts. It does not select a renderer, disable session persistence, restrict other extensions, change the model, or modify installed Pi files. Those choices remain Pi options and user configuration.

## Footer

`ctx.ui.setFooter()` receives a component whose `render()` returns no lines and whose `invalidate()` is a no-op. This replaces the built-in footer, including extension statuses displayed there. Passing `undefined` would restore the default footer, not hide it.

## Shell-style editor

`src/editor.ts` defines `MiniEditor`, a subclass of Pi's `CustomEditor`. Native input handling is retained; the subclass changes presentation and translates mouse coordinates back to the native layout.

The editor:

- Makes native border hooks render empty rows, removes those rows, and prefixes the first visible input row with the prompt.
- Aligns continuation and autocomplete rows with the input, not the left edge of the prompt.
- Keeps horizontal padding at zero, including when Pi tries to copy padding from the previous editor.
- Uses Pi's terminal-width and ANSI utilities to shorten the prompt with an ellipsis while retaining its ending and input space. It normally reserves up to ten input columns and at least three when the terminal permits.
- Recomputes the prompt on render from the current model, thinking level, and theme. It does not store the prompt in the editor's text, so submission contains only user input.

Native multiline editing, input history, shortcuts, autocomplete, cursor behavior, and paste handling remain in use. Pi's editor-replacement paste defect is a separate limitation described in [known issues](known-issues.md).

## Prompt and colors

```text
<model name>/<provider>:<thinking level>>
```

The final `>` is literal and is followed by one space. The model uses `model.name`, not the technical `model.id`.

| Part | Theme color |
| --- | --- |
| Model display name | `mdHeading` |
| Provider | `dim` |
| `/`, `:`, final `>` | `muted` |
| Thinking level | `theme.getThinkingBorderColor(level)` |

Thinking colors follow Pi's `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh`, and `thinkingMax` theme entries. ANSI styling is kept balanced during shortening so prompt colors do not leak into input. Column slicing alone can stop before a closing reset; the complete styled `> ` suffix is therefore extracted before ANSI-aware truncation, including when only one prompt column fits.

External model/provider labels are stripped of terminal sequences and made single-line before styling. With no selected model, the prompt uses `no-model/no-provider`.

## Quiet thinking-level statuses

Pi 1.1.0 adds `Thinking level: …` and `Default thinking level: …` to the chat through `InteractiveMode.showStatus()`. Its public extension API has no dedicated suppression hook.

`src/thinking-status.ts` wraps that runtime method and returns before it adds any transcript rows for messages starting with either exact prefix. All other messages are delegated to the original method with the same receiver, return value, and error behavior.

Filtering output instead of implementing separate quiet switching preserves every built-in switching path and avoids duplicating Pi's state and settings logic. The native switching handlers are not replaced. Shortcut/command/selector behavior, supported-level checks, session events, transcript recording, default-setting persistence, footer invalidation, and redraws remain native. Errors and the unsupported-model notice remain visible.

Cleanup restores the original method if our wrapper is still installed. If another extension has subsequently wrapped it, cleanup leaves that wrapper in place but disables our filtering inside the chain.

## Compatibility

The implementation is verified with Pi **1.1.0**; the package's broad peer version range does not establish compatibility with every host version.

Pi's extension loader resolves SDK imports to host aliases or embedded virtual modules. The hook must modify the host's `InteractiveMode`, not a separate development copy of the SDK. Compatibility checks therefore need the actual host loader and bundled CLI, not only direct imports in a test process.

The thinking-status hook depends on a **private runtime method**, not a supported UI API. A missing method raises a compatibility-review error rather than silently leaving suppression inactive. Changes to status text or native handler behavior can invalidate the integration even if the method still exists.

The active prototype hook is process-wide and text-based: it also suppresses identical status text from other sources. It assumes Pi's ordinary single interactive-mode instance. Editor layout overrides also depend on the native editor's border and rendering behavior. Core updates require native integration tests, not just type checks.

Known startup, paste-transfer, and very narrow input limitations are documented in [known issues](known-issues.md). The enabled paste regression strictly expects the existing core defect; if that behavior changes, the test requires a compatibility review rather than silently accepting it.
