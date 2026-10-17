import { useState } from "react";

const TABS = ["Feed", "Chats", "Tables", "Me"] as const;

export function TabBar() {
  const [active, setActive] = useState<(typeof TABS)[number]>("Feed");
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <button key={t} className="tab" aria-current={t === active ? "page" : undefined} onClick={() => setActive(t)}>
          {t}
        </button>
      ))}
    </nav>
  );
}
