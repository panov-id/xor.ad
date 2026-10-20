// The desktop's right pane (sosed Dusk desktop_1440_Write, _Feed, _Phrase, _Me: «Talks» at the right of the panel): the talks'
// list as the talks' screen draws it (TalksList), read without moving the «new» marks' moment (useInbox, mark false) — the
// person has not looked at the talks' screen. Mounted by the shell at 1440 and up only (shell/App.tsx useWide).
import type { Client } from "@sdk/client.ts";
import { label } from "../../i18n";
import { type TalksActions, TalksList, useInbox } from "./Inbox";

export function TalksPane({ client, actions }: { client: Client; actions: TalksActions }) {
  const { rows, error } = useInbox(client, false);
  return (
    <aside className="tk-pane" aria-label={label("app.talks.title")} data-testid="talks-pane">
      <h2>{label("app.talks.title")}</h2>
      <TalksList rows={rows} error={error} actions={actions} />
    </aside>
  );
}
