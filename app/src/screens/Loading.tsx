// docs/newdesign4 screen 14 `loading`: the archive's markup as is (nd4/screens/loading*.gen.tsx, made by
// scripts/design/nd4-extract.py from kypros-{phone,tablet,laptop}.html screen 14): the name, a running stripe and
// «Finding your street…». No nav: the person is not in yet; the frame is the window (data-bare). Testid: loading.
import { brand } from "@brand";
import { say } from "../i18n";
import { useDrawing } from "../nd4/drawing";
import { LoadingScreen } from "../nd4/screens/loading.gen";
import { LoadingScreenLaptop } from "../nd4/screens/loading-laptop.gen";
import { LoadingScreenTablet } from "../nd4/screens/loading-tablet.gen";

export function Loading() {
  const wide = useDrawing();
  const Screen = wide === "laptop" ? LoadingScreenLaptop : wide === "tablet" ? LoadingScreenTablet : LoadingScreen;
  return (
    <main className="k-screen nd-screen" data-screen="loading" data-width={wide} data-bare="">
      <Screen brand={brand.name} text={say("app.loading.street")} />
    </main>
  );
}
