// The advertiser's cabinet in the new shell (sheets w4_cabinet-sign-in, -sent, -venues, -offers, -new-offer; sosed
// Dusk). It is its own page, as in the web (web/src/App.tsx CABINET): at adv.<storefront> on a real deployment, at
// /adv on a stand — a separate web sign-in by mail with a session cookie of its own, no identity, no tab bar. The
// only way in is the link from the letter (`/enter#<token>`, the token in the fragment so no server log has it),
// opened in the browser that asked. The calls and readings are depth/core/cabinet.ts's; one view per sheet below.
import { type ReactNode, useEffect, useState } from "react";
import { me, openSession, tokenFromLink } from "@sdk/cabinet.ts";
import { Offers, NewOffer } from "./Offers";
import { Strip } from "./parts";
import { Expired, Sent, SignIn } from "./SignIn";
import { AddVenue, Venues } from "./Venues";

type View = "loading" | "sign-in" | "sent" | "expired" | "venues" | "add-venue" | "offers" | "new-offer";

export function Cabinet() {
  const [view, setView] = useState<View>("loading");

  useEffect(() => {
    void (async () => {
      const token = tokenFromLink(location.pathname, location.hash);
      const base = location.pathname.replace(/\/enter\/?$/, "") || "/";
      if (token !== null) {
        history.replaceState(null, "", base);
        const opened = token ? await openSession(token).catch(() => ({ status: 0 })) : { status: 401 };
        return setView(opened.status === 204 ? "venues" : "expired");
      }
      const who = await me().catch(() => ({ status: 0 }));
      setView(who.status === 200 ? "venues" : "sign-in");
    })();
  }, []);

  const inside = view === "venues" || view === "add-venue" || view === "offers" || view === "new-offer";
  const strip: ReactNode = <Strip onHome={inside ? () => setView("venues") : undefined} current={view === "venues"} />;
  switch (view) {
    case "loading": return <main className="screen cb" data-screen="cabinet-loading">{strip}</main>;
    case "sign-in": return <SignIn strip={strip} onSent={() => setView("sent")} />;
    case "sent": return <Sent strip={strip} />;
    case "expired": return <Expired strip={strip} onAgain={() => setView("sign-in")} />;
    case "venues": return <Venues strip={strip} onAdd={() => setView("add-venue")} onOffers={() => setView("offers")} />;
    case "add-venue": return <AddVenue strip={strip} onDone={() => setView("venues")} />;
    case "offers": return <Offers strip={strip} onNew={() => setView("new-offer")} />;
    case "new-offer": return <NewOffer strip={strip} onList={() => setView("offers")} />;
  }
}
