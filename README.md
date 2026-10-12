# pi-mini

Ask a question, read the answer, get back to your terminal.

pi-mini turns [Pi](https://pi.dev) into a low-clutter terminal chat for quick questions and follow-ups. It replaces the bordered input with a shell-style prompt, hides the footer, and removes redundant thinking-level announcements. With the launch command below, conversations stay in memory instead of becoming saved Pi sessions.

```text
Claude Sonnet 4.5/anthropic:off> What's the difference between TCP and UDP?
```

The prompt shows your model, provider, and thinking level. Replies appear below it; your conversation stays in the terminal's normal scrollback after you exit, subject to the terminal's scrollback limits.

## Get started

You need **Pi with a configured model/provider** and Node.js **22.19 or newer**. Follow [Pi's setup guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/quickstart.md) if you have not installed it or authenticated yet. Compatibility has been verified with **Pi 1.1.0**; other versions have not been validated.

Install the extension through Pi's package manager:

```sh
pi install npm:pi-mini
```

Run a minimal chat with only pi-mini:

```sh
pi --offline --tui-mini --tui-mode regular --no-session --no-extensions -e ~/.pi/agent/npm/node_modules/pi-mini
```

- Type a question and press **Enter**. Follow-up questions use the current conversation.
- Use **Shift+Enter** for multiline input.
- Press **Ctrl+D** with an empty input to exit. There is no saved session to resume.

`--no-extensions` disables automatic extension loading; `-e` selects the installed pi-mini package. The path assumes Pi's default global installation layout. Use an installed path rather than `-e npm:…` with `--offline`; see [launch options](https://github.com/chpock/pi-mini/blob/main/docs/usage.md#choosing-extensions) for custom directories and details.

**`--offline` is not a network block:** model requests and web tools can still use the internet. It disables Pi's automatic activity such as update checks and model-catalog refreshes. Response speed still depends on the model, provider, and thinking level—not on the UI extension.

## Additional extensions

You can include other installed extensions by adding more `-e /path/to/extension` arguments. They are your choice, not dependencies of pi-mini.

For example, to give the agent dedicated tools for fetching content over HTTP and searching the internet, include [pi-web-access](https://www.npmjs.com/package/pi-web-access). If both extensions are already installed, a Bash/Zsh alias can look like this:

```sh
alias pi-mini='pi --offline --tui-mini --tui-mode regular --no-session --no-extensions \
  -e ~/.pi/agent/npm/node_modules/pi-mini \
  -e ~/.pi/agent/npm/node_modules/pi-web-access'
```

Add it to your shell configuration, open a new shell or reload the configuration, then run `pi-mini`. This loads only those two extensions. Follow pi-web-access's setup instructions for its search-provider configuration; omit or replace its `-e` argument if you want different capabilities.

## What stays the same

Pi's native editing, history within the current run, autocomplete, model selection, and shortcuts remain available. The prompt follows model, thinking-level, and theme changes. pi-mini does not restrict Pi's built-in tools or project instructions; it is not a read-only mode or a sandbox.

Mini mode is opt-in: it runs **only with `--tui-mini` in terminal UI mode**. Loading the package without the flag, or using RPC, JSON, or print mode, leaves Pi's behavior unchanged. The flag itself does not disable saved sessions or choose regular rendering; the launch examples do that explicitly.

## Before using it

- **Wait for the mini prompt before pasting large input.** Pi 1.1.0 can lose a large paste entered before the editor is replaced at startup.
- The standard editor/footer can briefly flash during startup, sometimes leaving blank space. Other Pi messages and errors are not hidden.
- Compatibility with future Pi versions needs verification, particularly for quiet thinking-level switching.

See [known issues](https://github.com/chpock/pi-mini/blob/main/docs/known-issues.md) for conditions and limitations.

## More information

- [Usage](https://github.com/chpock/pi-mini/blob/main/docs/usage.md) — launch options, model selection, additional extensions, and conversation history.
- [Implementation](https://github.com/chpock/pi-mini/blob/main/docs/implementation.md) — UI behavior, theme colors, and compatibility details.
- [Development](https://github.com/chpock/pi-mini/blob/main/docs/development.md) — working on the extension; release instructions are linked there.

## License

[MIT](LICENSE).
