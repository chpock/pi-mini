# Using pi-mini

pi-mini changes Pi's terminal interface, not its model or agent behavior. For a short introduction and the everyday alias, see the [README](../README.md).

## Install

Install and configure [Pi](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/quickstart.md), then install the extension:

```sh
pi install npm:pi-mini
```

Pi records the package for automatic loading. No other extension is required. Loading pi-mini alone does not enable mini mode; activation requires `--tui-mini`.

Compatibility is verified with Pi 1.1.0. Pi's provider configuration and authentication still apply: use `/login` where supported, and `/model` to choose a model. Mini mode does not supply a model or credentials.

## Launch options

With pi-mini installed, run:

```sh
pi --offline --tui-mini --tui-mode regular --no-session
```

These options have separate responsibilities:

| Option | Purpose |
| --- | --- |
| `--tui-mini` | Enable pi-mini's terminal UI changes. |
| `--tui-mode regular` | Use the terminal's normal scrollback rather than Pi's fullscreen layout. |
| `--no-session` | Keep the conversation in memory without automatically saving a Pi session file. |
| `--offline` | Skip Pi's automatic network activity, such as update checks, model-catalog refreshes, and fetching missing packages. |

Use `--tui-mini` **without a value**. A boolean extension flag is enabled by its presence; `--tui-mini false` does not turn it off. Omit the flag for ordinary Pi behavior.

The extension also works with `--tui-mode fullscreen`, but that mode does not use ordinary terminal scrollback in the same way. RPC, JSON, and print modes are unchanged even if `--tui-mini` is passed.

`--offline` does not prohibit network access. Model requests and tools can still access the internet, and extensions can perform their own startup work. It uses the already available model catalog and packages; it is not a sandbox or a privacy guarantee.

## Input and model controls

The prompt contains the model's display name, provider, and current thinking level:

```text
Claude Sonnet 4.5/anthropic:off> Explain DNS caching in two paragraphs.
```

Replies, tool output, and errors use Pi's normal transcript. The standard footer and input borders are removed; other Pi UI components and messages are not replaced.

Default controls include:

| Action | Control |
| --- | --- |
| Send input | Enter |
| Add a line | Shift+Enter |
| Recall earlier input in this run | Up/Down |
| Select a model | `/model` or Ctrl+L |
| Select a thinking level | `/thinking` |
| Cycle supported thinking levels | Shift+Tab |
| Abort the current task | Escape |
| Exit with an empty input | Ctrl+D |

Custom Pi keybindings still apply. Autocomplete, paste handling, history, multiline editing, and other native shortcuts are retained. On narrow terminals, the prompt is shortened while preserving room for input and the final `>`; some model/provider/level text may be hidden.

The prompt updates when you change models, thinking levels, or themes. Thinking-level status rows are suppressed because the prompt already shows the current level; errors and other status messages remain visible.

You can also pass Pi's usual model options at launch, including through the alias:

```sh
pi-mini --provider anthropic --model claude-sonnet-4-5 --thinking off
```

This is an example, not a required provider or model. Choose one available to your account. A faster model or lower thinking level may shorten the wait for a reply; pi-mini itself does not accelerate model inference.

## Choosing extensions

The basic launch uses Pi's normal automatic loading. Other extensions you have configured continue to load; pi-mini neither requires nor disables them. Install and configure any additional capabilities you want through Pi, such as your preferred web-access extension. Internet access is not built into pi-mini.

For a run with **only explicitly selected extensions**, use `--no-extensions` and local paths to the installed packages. With Pi 1.1.0's default global installation layout:

```sh
pi --offline --tui-mini --tui-mode regular --no-session --no-extensions \
  -e "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/npm/node_modules/pi-mini"
```

Add more `-e /path/to/extension` arguments for the extensions you want. Adjust paths if you use project-local packages or a different installation layout. This does not change your automatic loading configuration for other Pi invocations.

**Why a local path here?** In Pi 1.1.0, `pi install npm:pi-mini` installs into the configured package area, while `-e npm:pi-mini` resolves through a separate temporary-package cache. With `--offline`, Pi will not populate that cache if the package is missing. Thus `--offline --no-extensions -e npm:pi-mini` can fail with `Unknown option: --tui-mini` even after standard installation: the extension never loaded to register the flag. Automatic loading or an explicit installed path uses the existing installation instead.

`--no-extensions` controls extensions, not every resource or capability. Skills, prompt templates, themes, project instructions, and built-in tools have their own Pi settings/options. See [Pi's CLI reference](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md) and [package documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).

## History, files, and privacy

With the launch above:

- Follow-up questions use the conversation kept in memory for the current process, subject to Pi's normal context management.
- No session file is automatically saved, so exiting does not leave a conversation that this run can resume later.
- Regular mode leaves rendered output in the terminal's scrollback. How much remains depends on the terminal's buffer and whether it is cleared.

This is not a guarantee that no data is written anywhere. Pi still maintains configuration, credentials, and package caches; tools and other extensions can write files. Explicit export/debug/share commands have their normal effects. Remote model and search providers have their own data-handling policies.

Pi's built-in file and shell tools remain available. A minimal UI does not make the agent read-only or isolate it from the current working directory. Review Pi's [security guidance](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md) when working with sensitive data or untrusted tasks.

## Troubleshooting

- **`Unknown option: --tui-mini`:** confirm pi-mini is installed and loaded. Do not combine offline npm `-e` resolution with a missing temporary-package cache; see [choosing extensions](#choosing-extensions).
- **No session to resume after exit:** expected with `--no-session`. Omit that option if you want Pi's normal saved-session behavior.
- **Brief standard UI or a paste marker instead of text:** see [known issues](known-issues.md). Wait for the mini prompt before pasting large input, and inspect the draft before submitting.
- **Compatibility error after a Pi update:** see [implementation and compatibility](implementation.md#compatibility). Quiet thinking switching depends on a private Pi method, so updates need validation.
