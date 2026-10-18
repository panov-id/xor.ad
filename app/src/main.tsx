import { createRoot } from "react-dom/client";
import { isCabinet } from "@sdk/cabinet.ts";
import "../tokens/fonts.css";
import "../tokens/sosed.gen.css";
import "../tokens/motion.css";
import "../tokens/layout.css";
import "../tokens/me.css";
import "../tokens/talks.css";
import "../tokens/tables.css";
import "../tokens/cabinet.css";
import "../tokens/chat.css";
import "./shell/shell.css";
import "./screens/screens.css";
import "./screens/feed.css";
import "./screens/move.css";
import "./screens/me/me.css";
import "./screens/talks/talks.css";
import "../tokens/wide.css";
import "./screens/tables/tables.css";
import "./screens/cabinet/cabinet.css";
import { Cabinet } from "./screens/cabinet/Cabinet";
import "./screens/chat.css";
import { App } from "./shell/App";
import { ChatStand } from "./screens/chat-stand";

// The advertiser's cabinet is its own page (web/src/App.tsx CABINET): adv.<storefront>, or /adv on a stand.
// The stand's build draws a few panes from views of their own for the measure (screens/chat-stand.tsx); a real
// build has no such path.
const stand = import.meta.env.VITE_STAND === "1" ? location.pathname.match(/^\/stand\/(chat|chat-over|chat-more|chat-game)$/)?.[1] as "chat" | "chat-over" | "chat-more" | "chat-game" | undefined : undefined;
createRoot(document.getElementById("root")!).render(stand ? <ChatStand pane={stand} /> : isCabinet(location.hostname, location.pathname) ? <Cabinet /> : <App />);
