// docs/newdesign4 screen 37 `my-phrase`: the archive's markup as is (nd4/screens/my-phrase*.gen.tsx, made by
// scripts/design/nd4-extract.py); this file gives the data. The node has no count of talks per phrase and extends only a lost,
// so those two parts stay off (brief 02.11). Testids: back, text, takedown, takedown-refused, my-phrase-*.
import { useEffect, useState } from "react";
import { say } from "../i18n";
import { useDrawing } from "../nd4/drawing";
import { FEED_TILE_FS } from "../nd4/screens/feed-tile.gen";
import { MyPhraseScreen } from "../nd4/screens/my-phrase.gen";
import { MyPhraseScreenLaptop } from "../nd4/screens/my-phrase-laptop.gen";
import { MyPhraseScreenTablet } from "../nd4/screens/my-phrase-tablet.gen";
import { PhraseFadedScreen } from "../nd4/screens/phrase-faded.gen";
import { adFor } from "../shell/ads";
import { PhraseFadedScreenLaptop } from "../nd4/screens/phrase-faded-laptop.gen";
import { PhraseFadedScreenTablet } from "../nd4/screens/phrase-faded-tablet.gen";
import { PhraseRejectedScreen } from "../nd4/screens/phrase-rejected.gen";
import { PhraseRejectedScreenLaptop } from "../nd4/screens/phrase-rejected-laptop.gen";
import { PhraseRejectedScreenTablet } from "../nd4/screens/phrase-rejected-tablet.gen";
import { Rail, RailTablet } from "../shell/TabBar";
import { langOf, ownFade, ownFaded, ownLeft, textSize } from "./feed-logic";

/** A short phrase keeps the archive's own size (screen 37); a longer one takes the feed tile's smaller sizes so it fits the frame. */
const sizeOf = (text: string): string | undefined => { const s = textSize(text); return s === "l" ? undefined : FEED_TILE_FS[s]; };

/** docs/newdesign4 screen 38 `phrase-rejected`: the moderator's refusal, over the composer; the phrase is not kept by the node, the words are still the composer's. */
export function PhraseRejected({ text, why, onBack, onDelete, onEdit }: { text: string; why: string; onBack: () => void; onDelete: () => void; onEdit: () => void }) {
  const wide = useDrawing();
  const Screen = wide === "laptop" ? PhraseRejectedScreenLaptop : wide === "tablet" ? PhraseRejectedScreenTablet : PhraseRejectedScreen;
  return (
    <main className="k-screen nd-screen" data-screen="phrase-rejected" data-width={wide}>
      {wide === "laptop" && <Rail active="feed" />}
      {wide === "tablet" && <RailTablet active="feed" />}
      <Screen backLabel={say("common.back")} backId="back" onBack={onBack} title={say("app.my.title")} text={text} fs={sizeOf(text)} head={say("app.rejected.head")} why={why}
        rulesText={say("app.legal.guidelines")} deleteText={say("app.rejected.delete")} onDelete={onDelete} editText={say("app.rejected.edit")} onEdit={onEdit} />
    </main>
  );
}

/** docs/newdesign4 screen 39 `phrase-faded`: one's own phrase past its end. The node gives the likes it had; talks and «say it again» wait (brief 02.11). */
function PhraseFaded({ likes, onBack, onNew }: { likes: number; onBack: () => void; onNew: () => void }) {
  const wide = useDrawing();
  const Screen = wide === "laptop" ? PhraseFadedScreenLaptop : wide === "tablet" ? PhraseFadedScreenTablet : PhraseFadedScreen;
  return (
    <main className="k-screen nd-screen" data-screen="phrase-faded" data-width={wide}>
      {wide === "laptop" && <Rail active="feed" />}
      {wide === "tablet" && <RailTablet active="feed" />}
      <Screen backLabel={say("common.back")} backId="back" onBack={onBack} title={say("app.faded.title")} line={say("app.faded.line", { n: likes })}
        againLabel={say("app.faded.again")} newText={say("app.faded.new")} onNew={onNew} ad={adFor("phrase-faded")} />
    </main>
  );
}

export function MyPhrase({ text, lang, checking, expiresAt, likes, refusedStatus, onBack, onDelete, onNew }: {
  text: string; lang?: string; checking: boolean; expiresAt?: number; likes: number; refusedStatus: number | null; onBack: () => void; onDelete?: () => void; onNew?: () => void;
}) {
  const wide = useDrawing();
  // the screen turns to «faded» at the phrase's end, even when it is left open
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === undefined || ownFaded(expiresAt, Date.now())) return;
    const timer = setTimeout(() => setNow(Date.now()), expiresAt * 1000 - Date.now() + 50);
    return () => clearTimeout(timer);
  }, [expiresAt, now]);
  if (onNew && ownFaded(expiresAt, now)) return <PhraseFaded likes={likes} onBack={onBack} onNew={onNew} />;
  const Screen = wide === "laptop" ? MyPhraseScreenLaptop : wide === "tablet" ? MyPhraseScreenTablet : MyPhraseScreen;
  const left = ownLeft(expiresAt, Date.now());
  const refused = refusedStatus !== null;
  return (
    <main className="k-screen nd-screen" data-screen="my-phrase" data-state={checking ? "checking" : "published"} data-width={wide}>
      {wide === "laptop" && <Rail active="feed" />}
      {wide === "tablet" && <RailTablet active="feed" />}
      <Screen backLabel={say("common.back")} onBack={onBack} title={say("app.my.title")} tag={say(checking ? "app.my.checking" : "app.my.tag")}
        text={text} fs={sizeOf(text)} lang={langOf(lang)}
        fadeShown={left !== null} fade={left ? ownFade(left.left) : "0%"} fadeText={left ? (left.h ? say("app.my.left_hm", { h: left.h, m: left.m }) : say("app.my.left_m", { m: left.m })) : ""}
        likes={likes} likesText={say("app.my.liked")} talksShown={false} talks={0} talksText={say("app.my.talks")}
        note={refused ? say("feed.takedownRefused", { status: refusedStatus }) : say("app.my.note")} refused={refused}
        deleteLabel={say("app.my.delete")} onDelete={onDelete} keepText={say("app.my.keep")} />
    </main>
  );
}
