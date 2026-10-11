import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type KeybindingsManager,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type EditorTheme,
  sliceByColumn,
  stripTerminalSequences,
  truncateToWidth,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  visibleWidth,
} from "@earendil-works/pi-tui";

function plainLabel(text: string): string {
  return stripTerminalSequences(text).replace(/[\x00-\x1f\x7f]/g, " ");
}

export function formatPrompt(
  theme: Theme,
  model: Pick<NonNullable<ExtensionContext["model"]>, "name" | "provider"> | undefined,
  thinkingLevel: ReturnType<ExtensionAPI["getThinkingLevel"]>,
): string {
  return (
    theme.fg("mdHeading", plainLabel(model?.name ?? "no-model")) +
    theme.fg("muted", "/") +
    theme.fg("dim", plainLabel(model?.provider ?? "no-provider")) +
    theme.fg("muted", ":") +
    theme.getThinkingBorderColor(thinkingLevel)(thinkingLevel) +
    theme.fg("muted", ">") + " "
  );
}

function fitPrompt(prompt: string, width: number): string {
  if (width <= 0) return "";
  const fullWidth = visibleWidth(prompt);
  if (fullWidth <= width) return prompt;

  const ending = truncateToWidth(
    sliceByColumn(prompt, fullWidth - 2, 2), Math.min(2, width), "",
  );
  return truncateToWidth(prompt, Math.max(0, width - 2), "…") + ending;
}

export class MiniEditor extends CustomEditor {
  private readonly getPrompt: () => string;
  private prefixWidth = 0;
  private inputRows = 0;
  private inputWidth = 0;

  constructor(tui: TUI, editorTheme: EditorTheme, keybindings: KeybindingsManager, getPrompt: () => string) {
    super(tui, editorTheme, keybindings, { paddingX: 0 });
    this.getPrompt = getPrompt;
  }

  override setPaddingX(_padding: number): void {
    // Pi copies padding from the default editor when installing a replacement.
    super.setPaddingX(0);
  }

  protected override renderTopBorder(_width: number, _hiddenLineCount: number): string {
    return "";
  }

  protected override renderBottomBorder(_width: number, _hiddenLineCount: number): string {
    return "";
  }

  override render(width: number): string[] {
    if (width <= 0) return [];
    const editingSpace = Math.min(10, Math.max(3, Math.floor(width / 2)));
    const prefix = fitPrompt(this.getPrompt(), Math.max(0, width - editingSpace));
    this.prefixWidth = visibleWidth(prefix);
    this.inputWidth = Math.max(1, width - this.prefixWidth);

    const lines = super.render(this.inputWidth);
    // The overridden hooks produce empty border rows; input and menu rows are padded.
    const bottomBorder = lines.indexOf("", 1);
    this.inputRows = bottomBorder - 1;
    const content = [...lines.slice(1, bottomBorder), ...lines.slice(bottomBorder + 1)];
    const indent = " ".repeat(this.prefixWidth);
    return content.map((line, index) =>
      truncateToWidth((index === 0 ? prefix : indent) + line, width, ""),
    );
  }

  override handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    return super.handleMouse({
      ...event,
      x: event.x - this.prefixWidth,
      y: event.y + (event.y < this.inputRows ? 1 : 2),
      width: this.inputWidth,
      height: event.height + 2,
    });
  }
}
