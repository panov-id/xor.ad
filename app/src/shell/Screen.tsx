import { useEffect, useRef, type ReactNode } from "react";
import { brand } from "@brand";

// The frame of a screen (web/src/ui/Screen.tsx): one <main data-screen=…>, the h1 takes the focus
// when the screen changes (what a screen reader hears first), and document.title names the screen.
export function Screen({ name, title, className, children, ...rest }:
  { name: string; title: string; className?: string; children: ReactNode } & { [data: `data-${string}`]: string | undefined }) {
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const before = document.title;
    document.title = `${title} · ${brand.name}`;
    return () => { document.title = before; };
  }, [title]);
  useEffect(() => {
    const h1 = main.current?.querySelector("h1");
    if (!h1) return;
    h1.tabIndex = -1;
    h1.focus({ preventScroll: true });
  }, [name]);
  return (
    <main {...rest} ref={main} className={className ? `screen ${className}` : "screen"} data-screen={name}>
      {children}
    </main>
  );
}
