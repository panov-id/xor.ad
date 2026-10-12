import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon.tsx";

// The foot of a tile as icons with numbers (strict review 11.10, К5): no «·» chains. Each item is
// one icon and one number for the eye; the words (`label`, with the number in them) are
// visually-hidden for a reader. `children` follow (the like's count, a word that has no icon).
export type FootItem = { icon: IconName; n: number; label: string };

export function TileFoot({ items, id, children }: { items: FootItem[]; id?: string; children?: ReactNode }) {
  return (
    <span className="ui-tilefoot" id={id}>
      {items.map((item) => (
        <span key={item.icon}>
          <span aria-hidden="true" className="ui-tilefoot-item"><Icon name={item.icon} size={16} />{item.n}</span>
          <span className="visually-hidden">{item.label}</span>
        </span>
      ))}
      {children}
    </span>
  );
}
