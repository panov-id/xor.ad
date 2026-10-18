import { createRoot } from "react-dom/client";
import "../tokens/fonts.css";
import "../tokens/sosed.gen.css";
import "../tokens/motion.css";
import "../tokens/layout.css";
import "../tokens/me.css";
import "./shell/shell.css";
import "./screens/screens.css";
import "./screens/feed.css";
import "./screens/move.css";
import "./screens/me/me.css";
import "../tokens/wide.css";
import { App } from "./shell/App";

createRoot(document.getElementById("root")!).render(<App />);
