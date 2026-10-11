import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createAgentSessionServices,
  type ExtensionUIContext,
  InteractiveMode,
  parseArgs,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

async function loadExtension(t: TestContext, args: string[] = []) {
  const sandbox = await mkdtemp(join(tmpdir(), "pi-mini-test-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const parsed = parseArgs(args);
  assert.deepEqual(parsed.diagnostics, []);

  const services = await createAgentSessionServices({
    cwd: sandbox,
    agentDir: join(sandbox, "agent"),
    settingsManager: SettingsManager.inMemory(),
    extensionFlagValues: parsed.unknownFlags,
    resourceLoaderOptions: {
      additionalExtensionPaths: [packageRoot],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    },
  });
  assert.deepEqual(services.diagnostics, []);

  const result = services.resourceLoader.getExtensions();
  const { extensions, errors, warnings } = result;

  assert.deepEqual(errors, []);
  assert.deepEqual(warnings ?? [], []);
  assert.equal(extensions.length, 1);
  const extension = extensions[0];
  assert.ok(extension);
  assert.equal(extension.resolvedPath, join(packageRoot, "src", "index.ts"));

  return { extension, runtime: result.runtime };
}

test("Pi loads the package entry point without errors or installing a status hook", async (t) => {
  const prototype = InteractiveMode.prototype as unknown as { showStatus(message: string): void };
  const original = prototype.showStatus;
  await loadExtension(t, ["--tui-mini"]);
  assert.equal(prototype.showStatus, original, "Factory loading must not activate mini mode");
});

for (const mode of ["tui", "rpc", "json", "print"] as const) {
  for (const { name, args, enabled } of [
    { name: "disabled by default", args: [], enabled: false },
    { name: "enabled by --tui-mini", args: ["--tui-mini"], enabled: true },
  ]) {
    test(`Mini mode is ${name} in ${mode}`, async (t) => {
      const { extension, runtime } = await loadExtension(t, args);
      assert.deepEqual([...extension.flags.keys()], ["tui-mini"]);
      const flag = extension.flags.get("tui-mini");
      assert.equal(flag?.type, "boolean");
      assert.equal(flag?.default, false);
      assert.equal(runtime.flagValues.get("tui-mini"), enabled);

      assert.equal(extension.tools.size, 0);
      assert.equal(extension.commands.size, 0);
      assert.equal(extension.shortcuts.size, 0);
      assert.deepEqual([...extension.handlers.keys()], ["session_start", "session_shutdown"]);

      const handlers = extension.handlers.get("session_start");
      assert.equal(handlers?.length, 1);
      const handler = handlers?.[0];
      assert.ok(handler);

      const prototype = InteractiveMode.prototype as unknown as { showStatus(message: string): void };
      const originalShowStatus = prototype.showStatus;
      t.after(() => { prototype.showStatus = originalShowStatus; });
      const reads = t.mock.method(runtime.flagValues, "get");
      const setFooter = t.mock.fn(
        (factory: Parameters<ExtensionUIContext["setFooter"]>[0]) => {
          assert.ok(factory, "undefined would restore the default footer");
          const footer = factory(
            {} as Parameters<typeof factory>[0],
            {} as Parameters<typeof factory>[1],
            {} as Parameters<typeof factory>[2],
          );
          for (const width of [1, 20, 80, 240]) {
            assert.deepEqual(footer.render(width), []);
          }
          footer.invalidate();
          assert.deepEqual(footer.render(80), []);
        },
      );
      const setEditorComponent = t.mock.fn(
        (factory: Parameters<ExtensionUIContext["setEditorComponent"]>[0]) => {
          assert.equal(typeof factory, "function");
        },
      );
      const context = new Proxy(
        { mode, ui: { setFooter, setEditorComponent } },
        {
          get(target, property, receiver) {
            assert.ok(enabled, "Disabled mini mode must not access context");
            assert.ok(
              property === "mode" || (mode === "tui" && property === "ui"),
              `Unexpected context.${String(property)} access in ${mode}`,
            );
            return Reflect.get(target, property, receiver);
          },
        },
      );
      await handler({ type: "session_start" }, context);
      assert.equal(
        prototype.showStatus !== originalShowStatus,
        enabled && mode === "tui",
        "Only opted-in TUI mode may intercept native status output",
      );
      assert.equal(reads.mock.callCount(), 1);
      assert.deepEqual(reads.mock.calls[0]?.arguments, ["tui-mini"]);
      assert.equal(reads.mock.calls[0]?.result, enabled);
      assert.equal(setFooter.mock.callCount(), enabled && mode === "tui" ? 1 : 0);
      assert.equal(
        setEditorComponent.mock.callCount(),
        enabled && mode === "tui" ? 1 : 0,
      );
      const shutdown = extension.handlers.get("session_shutdown")?.[0];
      assert.ok(shutdown);
      const unusedContext = new Proxy({}, { get() { assert.fail("Shutdown must not access session context"); } });
      for (let i = 0; i < 2; i++) {
        await shutdown({ type: "session_shutdown", reason: "reload" }, unusedContext);
        assert.equal(prototype.showStatus, originalShowStatus, "Shutdown restores the native method idempotently");
      }
    });
  }
}

test("Repeated starts replace the hook, and leaving mini mode removes it", async (t) => {
  const { extension, runtime } = await loadExtension(t, ["--tui-mini"]);
  const prototype = InteractiveMode.prototype as unknown as { showStatus(message: string): void };
  const original = prototype.showStatus;
  t.after(() => { prototype.showStatus = original; });
  const start = extension.handlers.get("session_start")?.[0];
  const shutdown = extension.handlers.get("session_shutdown")?.[0];
  assert.ok(start);
  assert.ok(shutdown);
  const context = { mode: "tui", ui: { setFooter() {}, setEditorComponent() {} } };
  const event = { type: "session_start", reason: "reload" };
  await start(event, context);
  const first = prototype.showStatus;
  await start(event, context);
  assert.notEqual(prototype.showStatus, first, "A repeated start must not retain the previous wrapper");
  await shutdown({ type: "session_shutdown", reason: "reload" }, {});
  assert.equal(prototype.showStatus, original, "Repeated starts must not stack active wrappers");
  await start(event, context);
  runtime.flagValues.set("tui-mini", false);
  await start(event, context);
  assert.equal(prototype.showStatus, original);
  runtime.flagValues.set("tui-mini", true);
  await start(event, context);
  await start(event, { mode: "rpc" });
  assert.equal(prototype.showStatus, original);
});

test("Pi CLI help advertises --tui-mini with and without the flag", async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), "pi-mini-cli-test-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const cli = fileURLToPath(
    new URL("./cli.js", import.meta.resolve("@earendil-works/pi-coding-agent")),
  );

  for (const flags of [[], ["--tui-mini"]]) {
    const output = execFileSync(
      process.execPath,
      [
        cli,
        "--offline",
        "--no-session",
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--no-context-files",
        "--no-approve",
        "--extension",
        packageRoot,
        ...flags,
        "--help",
      ],
      {
        cwd: sandbox,
        env: { ...process.env, PI_CODING_AGENT_DIR: join(sandbox, "agent") },
        encoding: "utf8",
        timeout: 15_000,
      },
    );
    assert.match(output, /--tui-mini\b/);
  }
});
