import { say } from "../locales/say.ts";

// Stat (kit_RU.md §3.3, К6): a label and a number. A bad one (complaints) is
// told in words, «много», not only by the --err colour, which is the second
// channel here and not the first.
export function Stat({ label, value, bad = false, ...rest }: { label: string; value: number; bad?: boolean; [data: `data-${string}`]: string | undefined }) {
  return (
    <p {...rest} className="ui-stat">
      <span className="ui-stat-label">{label}</span>
      <span className={bad ? "ui-stat-n ui-stat-bad" : "ui-stat-n"}>
        {value}
        {bad ? <span> · {say("web.ui.many")}</span> : null}
      </span>
    </p>
  );
}
