import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  createAgentSession,
  DefaultResourceLoader,
  initTheme,
  InteractiveMode,
  SessionManager,
  SettingsManager,
  type CreateAgentSessionOptions,
} from "@earendil-works/pi-coding-agent";
import { Container, stripTerminalSequences, type TUI } from "@earendil-works/pi-tui";
import { KeybindingsManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import { getEditorTheme, getThemeByName } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { formatPrompt, MiniEditor } from "../src/editor.ts";
import { suppressThinkingStatus } from "../src/thinking-status.ts";

const prototype = InteractiveMode.prototype as unknown as {
  showStatus(message: string): void;
  cycleThinkingLevel(): void;
  selectThinkingLevel(level: "high", persist: boolean): void;
  handleThinkingCommand(searchTerm: string): void;
};

initTheme("dark");

test("Only the two thinking-level status prefixes are suppressed", (t) => {
  const calls: Array<{ receiver: unknown; message: string }> = [];
  const result = Symbol("original result");
  t.mock.method(prototype, "showStatus", function (this: unknown, message: string) {
    calls.push({ receiver: this, message });
    return result;
  });
  const restore = suppressThinkingStatus();
  t.after(restore);
  const receiver = Object.create(prototype) as typeof prototype;
  for (const level of ["off", "minimal", "low", "medium", "high", "xhigh", "max"]) {
    receiver.showStatus(`Thinking level: ${level}`);
    receiver.showStatus(`Default thinking level: ${level}`);
  }
  assert.deepEqual(calls, []);
  for (const message of [
    "Model: test-model", "Thinking blocks: hidden", "Tool output: expanded",
    "Current model does not support thinking", "Thinking level", "Default thinking level",
    "Other text: Thinking level: high",
  ]) {
    assert.equal(receiver.showStatus(message), result);
    assert.deepEqual(calls.at(-1), { receiver, message });
  }
  assert.equal(calls.length, 7);
});

test("Unrelated status errors propagate unchanged", (t) => {
  const error = new Error("native status failure");
  t.mock.method(prototype, "showStatus", () => { throw error; });
  t.after(suppressThinkingStatus());
  assert.throws(() => prototype.showStatus("ordinary status"), (actual) => actual === error);
});

test("Cleanup restores the original method and is idempotent", (t) => {
  const original = t.mock.method(prototype, "showStatus", () => {});
  const restore = suppressThinkingStatus();
  t.after(restore);
  assert.notEqual(prototype.showStatus, original);
  prototype.showStatus("Thinking level: high");
  assert.equal(original.mock.callCount(), 0);
  restore();
  restore();
  assert.equal(prototype.showStatus, original);
  prototype.showStatus("Thinking level: high");
  assert.equal(original.mock.callCount(), 1);
});

test("Cleanup preserves a later wrapper and disables our retained filter", (t) => {
  const original = t.mock.method(prototype, "showStatus", () => {});
  const restore = suppressThinkingStatus();
  t.after(restore);
  const filtered = prototype.showStatus;
  const later = function (this: unknown, message: string) { return filtered.call(this, message); };
  prototype.showStatus = later;
  restore();
  assert.equal(prototype.showStatus, later);
  prototype.showStatus("Default thinking level: high");
  assert.equal(original.mock.callCount(), 1);
});

test("A missing private core method requires a compatibility review", (t) => {
  const original = prototype.showStatus;
  t.after(() => { prototype.showStatus = original; });
  prototype.showStatus = undefined as unknown as typeof original;
  assert.throws(suppressThinkingStatus, /showStatus is unavailable; review pi-mini compatibility/);
  assert.equal(prototype.showStatus, undefined);
});

async function createNativeFixture(t: TestContext, reasoning = true) {
  const sandbox = await mkdtemp(join(tmpdir(), "pi-mini-thinking-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const settings = SettingsManager.inMemory({ defaultThinkingLevel: "medium" });
  const loader = new DefaultResourceLoader({
    cwd: sandbox, agentDir: join(sandbox, "agent"), settingsManager: settings,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await loader.reload();
  const model: NonNullable<CreateAgentSessionOptions["model"]> = {
    id: "test-model", name: "Test Model", provider: "test-provider", api: "openai-responses",
    baseUrl: "https://example.invalid", reasoning, input: ["text"], contextWindow: 4096, maxTokens: 1024,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, thinkingLevelMap: { low: null },
  };
  const { session } = await createAgentSession({
    cwd: sandbox, agentDir: join(sandbox, "agent"), settingsManager: settings,
    sessionManager: SessionManager.inMemory(sandbox), resourceLoader: loader,
    model, thinkingLevel: "off", noTools: "all",
  });
  t.after(() => session.dispose());
  const redraw = t.mock.fn();
  const tui = { terminal: { rows: 24 }, requestRender: redraw } as unknown as TUI;
  const editor = new MiniEditor(tui, getEditorTheme(), new KeybindingsManager(), () =>
    formatPrompt(getThemeByName("dark")!, session.model, session.thinkingLevel));
  const chat = new Container();
  const footerInvalidated = t.mock.fn();
  const mode = Object.assign(Object.create(prototype), {
    ui: tui, editor, chatContainer: chat, footer: { invalidate: footerInvalidated },
  }) as typeof prototype;
  Object.defineProperty(mode, "session", { value: session });
  editor.onAction("app.thinking.cycle", () => mode.cycleThinkingLevel());
  return { session, settings, editor, mode, chat, redraw, footerInvalidated };
}

test("Native thinking shortcut, command and persistent selection stay functional without status rows", async (t) => {
  const { session, settings, editor, mode, chat, redraw, footerInvalidated } = await createNativeFixture(t);
  const events: string[] = [];
  session.subscribe((event) => { if (event.type === "thinking_level_changed") events.push(event.level); });
  t.after(suppressThinkingStatus());
  const levels = session.getAvailableThinkingLevels();
  assert.ok(!levels.includes("low"), "Use native model capabilities rather than a fixed cycle");
  for (let index = 1; index <= levels.length; index++) {
    editor.handleInput("\x1b[Z");
    const expected = levels[index % levels.length];
    assert.equal(session.thinkingLevel, expected);
    assert.ok(stripTerminalSequences(editor.render(100)[0]!).includes(`:${expected}> `));
  }
  mode.handleThinkingCommand("HIGH");
  assert.equal(session.thinkingLevel, "high");
  assert.equal(settings.getDefaultThinkingLevel(), "medium", "A nonpersistent selection must not change defaults");
  mode.selectThinkingLevel("high", true);
  assert.equal(settings.getDefaultThinkingLevel(), "high");
  assert.deepEqual(events, [...levels.slice(1), levels[0], "high"]);
  assert.equal(footerInvalidated.mock.callCount(), levels.length + 2);
  assert.equal(redraw.mock.callCount(), levels.length + 2, "Native border updates still request rendering");
  assert.equal(chat.children.length, 0, "Suppress before native showStatus adds a spacer and text");
  const changes = session.sessionManager.getBranch().filter((entry) => entry.type === "thinking_level_change");
  assert.equal(changes.length, events.length + 1, "Native transcript retains every actual level change");
});

test("Native unsupported-model status and invalid-level errors remain visible", async (t) => {
  const { mode, chat, session } = await createNativeFixture(t, false);
  t.after(suppressThinkingStatus());
  mode.cycleThinkingLevel();
  assert.equal(session.thinkingLevel, "off");
  assert.match(stripTerminalSequences(chat.render(100).join("\n")), /Current model does not support thinking/);
  mode.handleThinkingCommand("invalid");
  assert.match(stripTerminalSequences(chat.render(100).join("\n")), /Unknown thinking level/);
});

test("Native thinking status returns after cleanup", async (t) => {
  const { mode, chat, session } = await createNativeFixture(t);
  const restore = suppressThinkingStatus();
  t.after(restore);
  mode.cycleThinkingLevel();
  assert.equal(chat.children.length, 0);
  restore();
  mode.cycleThinkingLevel();
  assert.match(stripTerminalSequences(chat.render(100).join("\n")), new RegExp(`Thinking level: ${session.thinkingLevel}`));
});
