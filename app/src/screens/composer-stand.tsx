// The stand's build only (VITE_STAND=1): the composer drawn as the sheet has it (w3_composer: the phrase, with friends,
// 1 km, three live phrases left), for scripts/design/measure-app-w3-chat.mjs; the real send is e2e's.
import { ComposerPane } from "./Composer";

const none = () => {};
export function ComposerStand() {
  return (
    <ComposerPane
      state={{ text: "Backgammon in the yard tonight?", mode: "company", zone: 1000, limit: 128, live: { left: 3, of: 4 }, busy: false, refused: null }}
      actions={{ onText: none, onMode: none, onZone: none, onSend: none, onBack: none }}
    />
  );
}
