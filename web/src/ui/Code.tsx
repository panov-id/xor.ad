import { useId, useState } from "react";
import { say } from "../locales/say.ts";
import { Button } from "./Button.tsx";

// Code (kit_RU.md §3.3): «код» and its value in monospace, with «скопировать»
// (a Button text of 44). A copy that the browser refuses selects the code for
// the person to copy by hand and says nothing false: «скопировано» appears
// only once the clipboard took it, in a role=status that is in the page before.
export function Code({ value, ...rest }: { value: string; [data: `data-${string}`]: string | undefined }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  async function copy(button: HTMLButtonElement) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
      const code = button.parentElement?.querySelector("code");
      if (code) window.getSelection()?.selectAllChildren(code);
    }
  }
  return (
    <div {...rest} className="ui-code" role="group" aria-labelledby={`${id}-n`}>
      <span id={`${id}-n`} className="ui-code-name">{say("web.ui.code")}</span>
      <code className="ui-code-value">{value}</code>
      <Button type="button" kind="text" onClick={(event) => void copy(event.currentTarget)}>{say("web.ui.copy")}</Button>
      <span role="status" className="ui-code-done">{copied ? say("web.ui.copied") : ""}</span>
    </div>
  );
}
