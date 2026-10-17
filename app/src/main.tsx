import { createRoot } from "react-dom/client";
import "../tokens/fonts.css";
import "../tokens/sosed.gen.css";
import "../tokens/motion.css";
import "../tokens/layout.css";
import "./shell/shell.css";
import "./screens/screens.css";
import "./screens/feed.css";
import { App } from "./shell/App";

createRoot(document.getElementById("root")!).render(<App />);
