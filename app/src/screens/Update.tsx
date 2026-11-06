// docs/newdesign4 screen 15 `update`: the archive's markup as is (nd4/screens/update*.gen.tsx, made by
// scripts/design/nd4-extract.py from kypros-{phone,tablet,laptop}.html screen 15): over everything, × at the top (as
// «Later»), the refresh mark, «A new sosed is ready», the version and «takes a second, nothing is lost», «Later» and
// «Update». Testids: update, update-close, update-later, update-go.
import { brand } from "@brand";
import { say } from "../i18n";
import { useDrawing } from "../nd4/drawing";
import { UpdateScreen } from "../nd4/screens/update.gen";
import { UpdateScreenLaptop } from "../nd4/screens/update-laptop.gen";
import { UpdateScreenTablet } from "../nd4/screens/update-tablet.gen";

export function Update({ version, onLater }: { version: string; onLater: () => void }) {
  const wide = useDrawing();
  const Screen = wide === "laptop" ? UpdateScreenLaptop : wide === "tablet" ? UpdateScreenTablet : UpdateScreen;
  return (
    <main className="k-screen nd-screen" data-screen="update" data-width={wide} data-bare="" role="dialog" aria-modal="true" aria-labelledby="update-title" data-testid="update">
      <Screen closeLabel={say("app.update.later")} onLater={onLater} title={say("app.update.title", { name: brand.name })}
        line={`${say("app.update.version", { v: version })}\n${say("app.update.safe")}`}
        laterText={say("app.update.later")} goText={say("app.update.go")} onGo={() => location.reload()} />
    </main>
  );
}
