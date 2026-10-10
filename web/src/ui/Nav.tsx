import { Button } from "./Button.tsx";

// Nav (kit_RU.md §3.3, К6): the strip of a separate web page that has no tab
// bar — the cabinet. The place in mono on the left, the sections as words on
// the right; `nav` named by `label`, the current one has aria-current=page and
// the underline as its second channel. It is the screen's first child (a
// header), so the screen starts at y 0 like every sheet.
export type NavItem = { label: string; current: boolean; onSelect: () => void; testid?: string };

export function Nav({ where, label, items }: { where: string; label: string; items?: readonly NavItem[] }) {
  return (
    <header className="ui-nav-bar">
      <span className="ui-nav-where">{where}</span>
      {items && items.length > 0 ? (
        <nav className="ui-nav" aria-label={label}>
          {items.map((item) => (
            <Button key={item.label} type="button" kind="text" aria-current={item.current ? "page" : undefined} onClick={item.onSelect} data-testid={item.testid}>{item.label}</Button>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
