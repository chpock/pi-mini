import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatPrompt, MiniEditor } from "./editor.ts";
import { suppressThinkingStatus } from "./thinking-status.ts";

export default function piMini(pi: ExtensionAPI): void {
  pi.registerFlag("tui-mini", {
    description: "Enable the minimal terminal chat interface (in development)",
    type: "boolean",
    default: false,
  });

  let restoreThinkingStatus: (() => void) | undefined;
  pi.on("session_start", (_event, ctx) => {
    restoreThinkingStatus?.();
    restoreThinkingStatus = undefined;
    if (pi.getFlag("tui-mini") !== true) return;
    if (ctx.mode !== "tui") return;

    restoreThinkingStatus = suppressThinkingStatus();
    ctx.ui.setFooter(() => ({
      render: () => [],
      invalidate() {},
    }));
    ctx.ui.setEditorComponent((tui, editorTheme, keybindings) =>
      new MiniEditor(tui, editorTheme, keybindings, () =>
        formatPrompt(ctx.ui.theme, ctx.model, pi.getThinkingLevel()),
      ),
    );
  });

  pi.on("session_shutdown", () => {
    restoreThinkingStatus?.();
    restoreThinkingStatus = undefined;
  });
}
