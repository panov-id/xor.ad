// The components one by one, as the kit sheet shows them (panel/design/app-kit.svg),
// for a snapshot next to the sheet: served by the dev server at
// /dev/gallery.html, never part of the built page. ?light wears k-light.
import { createRoot } from "react-dom/client";
import "../../panel/design/kit/tokens.css";
import "../../panel/design/kit/schemes.css";
import "../src/styles.css";
import { Button } from "../src/ui/Button.tsx";
import { Card } from "../src/ui/Card.tsx";
import { Chip } from "../src/ui/Chip.tsx";
import { Composer } from "../src/ui/Composer.tsx";
import { HeaderFeed, HeaderScreen } from "../src/ui/Header.tsx";
import { InboxRow } from "../src/ui/InboxRow.tsx";

if (location.search.includes("light")) document.documentElement.classList.replace("k-dark", "k-light");
const noop = () => {};

function Gallery() {
  return (
    <main className="screen">
      <section id="headers"><HeaderFeed place="Колонаки" step="рядом десятки" /><HeaderScreen title="Настройки" onBack={noop} backLabel="назад" action="готово" /></section>
      <section id="buttons" className="rows">
        <Button kind="primary">Дальше</Button>
        <Button kind="primary" disabled reason="нужно согласие">Дальше</Button>
        <Button kind="secondary">Отмена</Button>
        <Button kind="danger">Удалить</Button>
        <Button kind="pill">сохранить</Button>
        <Button kind="text">вернуть</Button>
      </section>
      <section id="chips" className="actions"><Chip label="компания" /><Chip label="стол" tone="teal" /><Chip label="помощь" tone="violet" /><Chip label="оффер" tone="accent" outline /></section>
      <section id="cards" className="cards">
        <Card><h2>Кто-нибудь идёт на набережную вечером? Возьму термос.</h2><Chip label="компания" /></Card>
        <Card kind="nested"><strong>Аня, 31</strong><span>Кто идёт на набережную?</span></Card>
        <Card kind="own">Ищу компанию на пробежку</Card>
      </section>
      <section id="inbox" className="rows">
        <InboxRow name="Аня, 24" line="и это тоже моё было" time="52 мин" onOpen={noop} />
        <InboxRow name="Борис, 30" line="у фонтана" time="2 ч" wait="ждёт вашего ответа" dot selected onOpen={noop} />
      </section>
      <section id="composer"><Composer placeholder="сказать соседям…" label="фраза" sendLabel="отправить" onSend={noop} /></section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Gallery />);
