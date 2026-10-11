import { InteractiveMode } from "@earendil-works/pi-coding-agent";

export function suppressThinkingStatus(): () => void {
  // Pi 1.1.0 exposes this TypeScript-private method at runtime, not as a UI API.
  const prototype = InteractiveMode.prototype as unknown as {
    showStatus(message: string): void;
  };
  const original = prototype.showStatus;
  if (typeof original !== "function") {
    throw new Error("pi-mini: InteractiveMode.showStatus is unavailable; review pi-mini compatibility with Pi core");
  }

  let active = true;
  function filtered(this: unknown, message: string): void {
    if (active && (message.startsWith("Thinking level: ") || message.startsWith("Default thinking level: "))) {
      return;
    }
    return original.call(this, message);
  }
  prototype.showStatus = filtered;

  return () => {
    active = false;
    // Do not overwrite a wrapper another extension installed after ours.
    if (prototype.showStatus === filtered) prototype.showStatus = original;
  };
}
