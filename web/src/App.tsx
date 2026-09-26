// The web face's first three screens, on the sheets in panel/design/sheets:
// 01 the splash, 02 the two steps of registration, 03 the feed. No composer,
// no likes, no chat — W1 is the skeleton the rest is hung on.

import { useState } from "react";
import type { Client } from "../../depth/core/client.ts";
import { Feed } from "./screens/Feed.tsx";
import { Register } from "./screens/Register.tsx";
import { Splash } from "./screens/Splash.tsx";

type Screen = { at: "splash" } | { at: "register" } | { at: "feed"; client: Client; sealed: "ok" | "failed" };

export function App() {
  const [screen, setScreen] = useState<Screen>({ at: "splash" });
  switch (screen.at) {
    case "splash":
      return <Splash onStart={() => setScreen({ at: "register" })} />;
    case "register":
      return <Register onDone={(client, sealed) => setScreen({ at: "feed", client, sealed })} />;
    case "feed":
      return <Feed client={screen.client} sealed={screen.sealed} />;
  }
}
