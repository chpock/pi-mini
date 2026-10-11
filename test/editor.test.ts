import assert from "node:assert/strict";
import test from "node:test";
import { CustomEditor, initTheme, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
// Use the pinned Pi implementation for test fixtures, not extension runtime imports.
import { KeybindingsManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import { InteractiveMode } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js";
import {
  getEditorTheme,
  getThemeByName,
} from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import {
  CURSOR_MARKER,
  setKeybindings,
  stripTerminalSequences,
  type TUI,
  type TuiMouseEvent,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { formatPrompt, MiniEditor } from "../src/editor.ts";

initTheme("dark");
const dark = getThemeByName("dark")!;
const light = getThemeByName("light")!;
const model = { name: "Test Model", id: "test-model-id", provider: "test-provider" };
const prompt = formatPrompt(dark, model, "high");

function plain(text: string): string {
  return stripTerminalSequences(text.replaceAll(CURSOR_MARKER, ""));
}

function createEditor(getPrompt = () => prompt) {
  const tui = { terminal: { rows: 24 }, requestRender() {} } as unknown as TUI;
  const keybindings = new KeybindingsManager();
  setKeybindings(keybindings);
  const editor = new MiniEditor(tui, getEditorTheme(), keybindings, getPrompt);
  editor.focused = true;
  return editor;
}

function expectKnownPasteTransferFailure(
  actual: { expanded: string; submitted: string | undefined },
  paste: string,
  marker: string,
): void {
  const expected = { expanded: paste, submitted: paste };
  assert.throws(
    () => assert.deepEqual(actual, expected, "Installation must preserve pasted text and submission"),
    {
      name: "AssertionError",
      code: "ERR_ASSERTION",
      operator: "deepStrictEqual",
      actual: { expanded: marker, submitted: marker },
      expected,
    },
    "Known Pi core paste-transfer failure changed or no longer occurs; review pi-mini compatibility before updating the expectation",
  );
}

function click(x: number, y: number, width: number, height: number): TuiMouseEvent {
  return {
    type: "click", button: "left", x, y, screenX: x, screenY: y,
    width, height, shift: false, alt: false, ctrl: false,
  };
}

for (const [level, token] of [
  ["off", "thinkingOff"],
  ["minimal", "thinkingMinimal"],
  ["low", "thinkingLow"],
  ["medium", "thinkingMedium"],
  ["high", "thinkingHigh"],
  ["xhigh", "thinkingXhigh"],
  ["max", "thinkingMax"],
] as const) {
  test(`Prompt uses Pi's theme colors for ${level}`, () => {
    assert.equal(
      formatPrompt(dark, model, level),
      dark.fg("mdHeading", model.name) + dark.fg("muted", "/") +
        dark.fg("dim", model.provider) + dark.fg("muted", ":") +
        dark.fg(token, level) + dark.fg("muted", ">") + " ",
    );
  });
}

test("Prompt uses the display name and handles an unselected model", () => {
  assert.equal(plain(prompt), "Test Model/test-provider:high> ");
  assert.equal(plain(formatPrompt(dark, undefined, "off")), "no-model/no-provider:off> ");
});

test("Custom model labels cannot inject terminal commands or extra rows", () => {
  const text = formatPrompt(dark, {
    name: "Test\n\x1b[31mModel\x1b[0m",
    provider: "test\tprovider\x1b]0;bad title\x07",
  }, "off");
  assert.equal(plain(text), "Test Model/test provider:off> ");
  assert.ok(!text.includes("bad title"));
});

test("Mini editor renders one prompt row without borders or copied padding", () => {
  const editor = createEditor();
  editor.setPaddingX(4);
  assert.equal(editor.getPaddingX(), 0);
  const lines = editor.render(100);
  assert.equal(lines.length, 1);
  assert.equal(plain(lines[0]!).trimEnd(), "Test Model/test-provider:high>");
  const beforeCursor = lines[0]!.split(CURSOR_MARKER)[0]!;
  assert.equal(visibleWidth(beforeCursor), visibleWidth(prompt));
});

test("Native editing and submission exclude the prompt", () => {
  const editor = createEditor();
  let submitted: string | undefined;
  editor.onSubmit = (text) => { submitted = text; };
  editor.handleInput("h");
  editor.handleInput("i");
  editor.handleInput("\x1b[D");
  editor.handleInput("!");
  assert.equal(editor.getText(), "h!i");
  assert.ok(plain(editor.render(100)[0]!).startsWith(plain(prompt) + "h!i"));
  editor.handleInput("\r");
  assert.equal(submitted, "h!i");
  assert.equal(editor.getText(), "");
});

test("Native multiline input and history still work", () => {
  const editor = createEditor();
  editor.handleInput("a");
  editor.handleInput("\n");
  editor.handleInput("b");
  const lines = editor.render(100);
  assert.equal(editor.getText(), "a\nb");
  assert.equal(lines.length, 2);
  assert.ok(plain(lines[0]!).startsWith(plain(prompt) + "a"));
  assert.ok(plain(lines[1]!).startsWith(" ".repeat(visibleWidth(prompt)) + "b"));
  editor.addToHistory("previous input");
  editor.setText("");
  editor.handleInput("\x1b[A");
  assert.equal(editor.getText(), "previous input");
  editor.handleInput("\x1b[B");
  assert.equal(editor.getText(), "");
});

test("Native app controls and extension shortcuts still work", () => {
  const editor = createEditor();
  const actions: string[] = [];
  editor.onEscape = () => { actions.push("interrupt"); };
  editor.onCtrlD = () => { actions.push("exit"); };
  editor.onAction("app.model.cycleForward", () => { actions.push("model"); });
  editor.onAction("app.thinking.cycle", () => { actions.push("thinking"); });
  editor.onExtensionShortcut = (data) => {
    if (data !== "x") return false;
    actions.push("extension");
    return true;
  };
  editor.handleInput("\x1b");
  editor.handleInput("\x04");
  editor.handleInput("\x10");
  editor.handleInput("\x1b[Z");
  editor.handleInput("x");
  assert.deepEqual(actions, ["interrupt", "exit", "model", "thinking", "extension"]);
  assert.equal(editor.getText(), "");
});

test("Prompt follows model, thinking, and theme changes without changing input", () => {
  let currentModel = model;
  let currentLevel: "high" | "low" = "high";
  let currentTheme = dark;
  const editor = createEditor(() => formatPrompt(currentTheme, currentModel, currentLevel));
  editor.setText("draft");
  editor.render(120);
  currentModel = { name: "Other Model", id: "other-id", provider: "other-provider" };
  currentLevel = "low";
  currentTheme = light;
  editor.invalidate();
  const line = editor.render(120)[0]!;
  assert.ok(plain(line).startsWith("Other Model/other-provider:low> draft"));
  assert.ok(line.includes(light.fg("mdHeading", currentModel.name)));
  assert.ok(line.includes(light.fg("thinkingLow", "low")));
  assert.equal(editor.getText(), "draft");
  assert.deepEqual(editor.getCursor(), { line: 0, col: 5 });
});

test("Narrow widths shorten the prompt but retain its muted > and editing space", () => {
  const editor = createEditor();
  editor.setText("abcdef");
  for (const width of [20, 40]) {
    const lines = editor.render(width);
    assert.ok(plain(lines[0]!).includes("…> abcdef"));
    assert.ok(lines[0]!.includes(dark.fg("muted", ">")));
    assert.equal(lines.length, 1);
    assert.equal(visibleWidth(lines[0]!.split(CURSOR_MARKER)[0]!), width - 10 + 6);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
  }
});

test("Wrapping, scrolling, and resizing preserve Unicode text and a single cursor", () => {
  const editor = createEditor(() => formatPrompt(dark, {
    name: "模型✨", provider: "provider",
  }, "max"));
  const text = "🙂e\u0301中文 long text ".repeat(30);
  editor.setText(text);
  for (const width of [20, 40, 80, 120, 20]) {
    const lines = editor.render(width);
    assert.ok(lines.every((line) => visibleWidth(line) <= width));
    assert.equal(lines.join("").split(CURSOR_MARKER).length - 1, 1);
    assert.ok(lines.length <= 7);
    assert.equal(editor.getText(), text);
  }
});

test("Narrow widths fit ASCII and leave room for wide glyphs when possible", () => {
  const editor = createEditor();
  for (const text of ["", "ab"]) {
    editor.setText(text);
    for (const width of [0, 1, 2, 3, 4]) {
      assert.ok(editor.render(width).every((line) => visibleWidth(line) <= width));
    }
  }
  // Below three columns Pi's native editor cannot lay out a wide glyph and cursor.
  editor.setText("🙂");
  for (const width of [3, 4, 5]) {
    assert.ok(editor.render(width).every((line) => visibleWidth(line) <= width));
  }
});

test("Fullscreen mouse clicks use input coordinates after prefix and border removal", () => {
  const editor = createEditor();
  editor.setText("abc\ndef");
  const lines = editor.render(100);
  const x = visibleWidth(prompt) + 1;
  assert.deepEqual(editor.handleMouse(click(x, 0, 100, lines.length)), { handled: true, focus: true });
  assert.deepEqual(editor.getCursor(), { line: 0, col: 1 });
  editor.handleMouse(click(x, 1, 100, lines.length));
  assert.deepEqual(editor.getCursor(), { line: 1, col: 1 });
  assert.equal(editor.handleMouse({ ...click(x, 0, 100, lines.length), type: "drag" }), undefined);
});

test("Autocomplete rows and mouse selection survive removal of both editor borders", async () => {
  const editor = createEditor();
  editor.setAutocompleteProvider({
    async getSuggestions() {
      return {
        prefix: "/",
        items: [
          { value: "/first", label: "first" },
          { value: "/second", label: "second" },
        ],
      };
    },
    applyCompletion(_lines, _cursorLine, _cursorCol, item) {
      return { lines: [item.value], cursorLine: 0, cursorCol: item.value.length };
    },
  });
  editor.setText("/");
  editor.handleInput("\t");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(editor.isShowingAutocomplete(), true);
  const lines = editor.render(100);
  assert.ok(lines.some((line) => plain(line).includes("first")));
  assert.ok(lines.some((line) => plain(line).includes("second")));
  const row = lines.findIndex((line) => plain(line).includes("second"));
  editor.handleMouse(click(visibleWidth(prompt) + 3, row, 100, lines.length));
  assert.equal(editor.getText(), "/second");
  assert.equal(editor.isShowingAutocomplete(), false);
});

test("A one-column prompt suffix resets styling before native input", () => {
  const editor = createEditor();
  editor.setText("ab");
  const line = editor.render(4)[0]!;
  const beforeInput = line.slice(0, line.indexOf("ab"));
  assert.ok(beforeInput.endsWith("\x1b[0m"), "Muted prompt color must not leak into input");
});

test("Known paste-transfer expectation accepts only the original marker loss", () => {
  const paste = "a".repeat(1200);
  const marker = "[paste #1 1200 chars]";
  expectKnownPasteTransferFailure({ expanded: marker, submitted: marker }, paste, marker);
});

test("Known paste-transfer expectation fails on unexpected preservation with a review instruction", () => {
  const paste = "a".repeat(1200);
  assert.throws(
    () => expectKnownPasteTransferFailure({ expanded: paste, submitted: paste }, paste, "[paste #1 1200 chars]"),
    { code: "ERR_ASSERTION", message: /review pi-mini compatibility/ },
  );
});

test("Known paste-transfer expectation rejects changed failures", () => {
  const paste = "a".repeat(1200);
  const marker = "[paste #1 1200 chars]";
  for (const actual of [
    { expanded: marker, submitted: undefined },
    { expanded: paste, submitted: marker },
    { expanded: marker, submitted: paste },
    { expanded: "[paste #9 1200 chars]", submitted: "[paste #9 1200 chars]" },
  ]) {
    assert.throws(() => expectKnownPasteTransferFailure(actual, paste, marker), { code: "ERR_ASSERTION" });
  }
});

test("Native editor installation expects the known large-paste loss until compatibility review", () => {
  const tui = { terminal: { rows: 24 }, requestRender() {}, setFocus() {} } as unknown as TUI;
  const keybindings = new KeybindingsManager();
  const original = new CustomEditor(tui, getEditorTheme(), keybindings);
  const paste = "a".repeat(1200);
  let submitted: string | undefined;
  original.onSubmit = (text) => { submitted = text; };
  original.handleInput(`\x1b[200~${paste}\x1b[201~`);
  const marker = original.getText();
  assert.notEqual(marker, paste, "Pi core no longer creates the large-paste marker; review pi-mini compatibility");
  assert.equal(original.getExpandedText(), paste);

  const host = {
    editor: original,
    defaultEditor: original,
    editorContainer: { clear() {}, addChild() {} },
    disposeActiveSelector() {},
    ui: tui,
    keybindings,
  };
  // Run Pi's real installer; a factory-only mock cannot detect lost paste storage.
  const install = (InteractiveMode.prototype as unknown as {
    setCustomEditorComponent(factory: Parameters<ExtensionUIContext["setEditorComponent"]>[0]): void;
  }).setCustomEditorComponent;
  install.call(host, (ui, theme, keys) => new MiniEditor(ui, theme, keys, () => "model/provider:off> "));

  const expanded = host.editor.getExpandedText();
  host.editor.handleInput("\r");
  expectKnownPasteTransferFailure({ expanded, submitted }, paste, marker);
});
