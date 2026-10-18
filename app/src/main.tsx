import { createRoot } from "react-dom/client";
import "../tokens/fonts.css";
import "../tokens/sosed.gen.css";
import "../tokens/motion.css";
import "../tokens/layout.css";
import "../tokens/me.css";
import "../tokens/chat.css";
import "../tokens/compose.css";
import "./shell/shell.css";
import "./screens/screens.css";
import "./screens/feed.css";
import "./screens/move.css";
import "./screens/me/me.css";
import "./screens/chat.css";
import "./screens/composer.css";
import { App } from "./shell/App";
import { ChatStand } from "./screens/chat-stand";
import { ComposerStand } from "./screens/composer-stand";

// The stand's build draws a few panes from views of their own for the measure (screens/chat-stand.tsx); a real
// build has no such path.
const stand = import.meta.env.VITE_STAND === "1" ? location.pathname.match(/^\/stand\/(chat|chat-over|chat-more|chat-game|composer)$/)?.[1] : undefined;
createRoot(document.getElementById("root")!).render(stand === "composer" ? <ComposerStand /> : stand ? <ChatStand pane={stand as "chat" | "chat-over" | "chat-more" | "chat-game"} /> : <App />);
