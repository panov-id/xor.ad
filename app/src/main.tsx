import { createRoot } from "react-dom/client";
import { isCabinet } from "@sdk/cabinet.ts";
import "../tokens/fonts.css";
import "../tokens/sosed.gen.css";
import "../tokens/motion.css";
import "../tokens/layout.css";
import "../tokens/me.css";
import "../tokens/themes.css";
import "../tokens/legacy-bridge.css";
import "../tokens/kit.css";
import "../tokens/nd-icons.css";
import "./shell/shell.css";
import { applyTheme, followDevice } from "./brands/sosed/theme";

// The theme before the first paint; «auto» turns white/black on the hour (owner 2026-10-26).
applyTheme();
followDevice();
import "./screens/screens.css";
import "./screens/me/me.css";
import "../tokens/wide.css";
import { Cabinet } from "./screens/cabinet/Cabinet";
import { App } from "./shell/App";
import { ChatStand } from "./screens/chat-stand";
import { ComposerStand } from "./screens/composer-stand";

// The advertiser's cabinet is its own page (web/src/App.tsx CABINET): adv.<storefront>, or /adv on a stand.
// The stand's build draws a few panes from views of their own for the measure (screens/chat-stand.tsx); a real
// build has no such path.
const stand = import.meta.env.VITE_STAND === "1" ? location.pathname.match(/^\/stand\/(chat|chat-over|chat-more|chat-game|composer)$/)?.[1] : undefined;
createRoot(document.getElementById("root")!).render(stand === "composer" ? <ComposerStand />
  : stand ? <ChatStand pane={stand as "chat" | "chat-over" | "chat-more" | "chat-game"} />
  : isCabinet(location.hostname, location.pathname) ? <Cabinet /> : <App />);
