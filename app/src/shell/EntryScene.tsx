// The left scene of the entry frame from the desktop width (desktop-1440/1-entry and 2-intro sheets): a card with a round mark and
// the screen's icon in its middle, the brand's chip bottom-left, the title and the text under the card. Hidden below the desktop width.
// `portal` is for a screen built by SubPage (its main is not ours to open): the scene is put into the screen's own <main>.
import { useContext, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { brand } from "@brand";
import { InPane } from "../screens/me/parts";
import { NdIcon } from "./NdIcon";
import { Logo } from "./Scene";
import { useMinWidth } from "./useMinWidth";

export function EntryScene({ icon, title, text, portal }: { icon?: string; title: string; text?: string; portal?: boolean }) {
  const desk = useMinWidth("--bp-desktop");
  const pane = useContext(InPane);
  const mark = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { if (portal && desk && !pane) setHost(mark.current?.closest("main") ?? null); }, [portal, desk, pane]);
  if (!desk || pane) return null;
  const scene = (
    <aside className="k-entry-scene" data-testid="entry-scene">
      <div className="k-entry-card">
        <span className="k-split-mark" aria-hidden="true">{icon ? <NdIcon name={icon} /> : <Logo size={56} />}</span>
        <div className="k-glass"><Logo size={46} /><div className="k-stack"><b>{brand.name}</b><span className="k-sub">{brand.host}</span></div></div>
      </div>
      <div className="k-entry-words"><p className="k-title k-title-big">{title}</p>{text && <p className="k-sub">{text}</p>}</div>
    </aside>
  );
  if (!portal) return scene;
  return <>{<span ref={mark} hidden />}{host && createPortal(scene, host)}</>;
}
