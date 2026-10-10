import { useEffect, useRef, type ReactNode } from "react";
import { BRAND } from "../config.ts";
import { say } from "../locales/say.ts";

// Screen (kit_RU.md §3.3): the frame of every screen. `main` holds the header
// (a Header of the kit, with the screen's h1), then the content; `nav` (a
// TabBar) stands after it. When the screen changes, the focus goes to its h1
// (tabindex=-1) — that is what a screen reader hears first — and the first
// thing Tab finds is «к содержимому», which skips the header. The second
// channel is document.title: «экран · бренд», so a tab and a history entry
// have a name.
export function Screen({ name, title, header, nav, children }:
  { name: string; title: string; header?: ReactNode; nav?: ReactNode; children: ReactNode }) {
  const main = useRef<HTMLElement>(null);
  // The title goes back when the screen leaves: a screen that is not (yet) on
  // Screen would otherwise keep wearing the last one's name (К4 text walk).
  useEffect(() => {
    const before = document.title;
    document.title = `${title} · ${BRAND}`;
    return () => { document.title = before; };
  }, [title]);
  useEffect(() => {
    const h1 = main.current?.querySelector("h1");
    if (!h1) return;
    h1.tabIndex = -1;
    h1.focus({ preventScroll: true });
  }, [name]);
  return (
    <>
      <a className="ui-skip" href="#ui-content" onClick={(event) => {
        event.preventDefault();
        document.getElementById("ui-content")?.focus();
      }}>{say("web.ui.skip")}</a>
      <main ref={main} className="screen" data-screen={name}>
        {header}
        <span id="ui-content" tabIndex={-1} className="ui-content-anchor" />
        {children}
      </main>
      {nav}
    </>
  );
}
