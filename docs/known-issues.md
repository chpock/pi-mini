# Known issues

These limitations were verified with Pi **1.1.0**. They are not fixed by pi-mini, and their behavior on other Pi versions has not been validated. For version-dependent integration details, see [compatibility](implementation.md#compatibility).

## Large pastes at editor replacement

**What can happen:** a large paste already in the input when Pi replaces its editor can lose its contents. The new editor retains only a marker such as `[paste #1 1200 chars]`; submitting it sends that marker instead of the pasted text.

The native editor uses markers for bracketed pastes exceeding 1,000 characters or 10 lines. This failure requires a marker **at the replacement boundary**, such as input entered before mini's startup replacement. Pasting into an already installed mini editor does not cause this transfer defect.

**When using it:** wait for the mini prompt before pasting large input, and inspect the draft before submitting. The extension contains no save/restore workaround, and Pi core is not patched.

### Core cause

Pi's native editor keeps paste contents in a per-editor map. `getText()` returns the marker; `getExpandedText()` resolves it to the original text. Pi 1.1.0's `InteractiveMode.setCustomEditorComponent()` copies `getText()` into the replacement editor, but not the paste map. The new editor therefore cannot expand the marker.

The owning installer would need to transfer `getExpandedText()` when available, with raw text as the fallback for other editor implementations. Pi's public `ctx.ui.getEditorText()` already reads expanded text, but its installer does not.

Verified source locations in the installed Pi 1.1.0 packages:

- `@earendil-works/pi-tui/dist/components/editor.js:897–913` — raw/expanded getters.
- `@earendil-works/pi-tui/dist/components/editor.js:1084–1097` — paste storage and marker creation.
- `@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js:2242–2255` — replacement text transfer.
- `@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js:2077` — public expanded-text getter.

The native integration reproduction turns **1,200 characters into a 21-character marker**, including submission. Its strict expected-failure policy and reproduction command are documented in [development](development.md#strict-expected-failure-for-paste-transfer). A green test suite does not mean this data-loss defect is fixed.

## Startup flash and leftover blank space

The default footer and editor can appear briefly before mini's UI is installed. In regular mode, shrinking the layout can also leave blank rows previously occupied by the default UI.

Pi starts the TUI and schedules rendering before it finishes setup and emits `session_start`. Mini installs its replacements at that event; the public extension API has no pre-first-render footer/editor configuration. Pi-mini does not intercept private startup methods to eliminate the initial frame.

## Wide characters in extremely narrow input

Emoji and other wide glyphs can fail when the input field is narrower than three columns. Pi 1.1.0's native wrapping routine recursively retries an oversized grapheme without making progress; a native editor without pi-mini reproduced `RangeError: Maximum call stack size exceeded` at input widths of one or two columns.

Mini reserves at least three input columns when the terminal permits, so prompt shortening does not create this condition on a wider terminal. A terminal too narrow to provide those columns still exposes the core defect. Use a wider terminal; the native wrapping routine is not patched.
