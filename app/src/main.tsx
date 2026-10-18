import { createRoot } from "react-dom/client";
import { isCabinet } from "@sdk/cabinet.ts";
import "../tokens/fonts.css";
import "../tokens/sosed.gen.css";
import "../tokens/motion.css";
import "../tokens/layout.css";
import "../tokens/me.css";
import "../tokens/cabinet.css";
import "./shell/shell.css";
import "./screens/screens.css";
import "./screens/feed.css";
import "./screens/move.css";
import "./screens/me/me.css";
import "./screens/cabinet/cabinet.css";
import { Cabinet } from "./screens/cabinet/Cabinet";
import { App } from "./shell/App";

// The advertiser's cabinet is its own page (web/src/App.tsx CABINET): adv.<storefront>, or /adv on a stand.
createRoot(document.getElementById("root")!).render(isCabinet(location.hostname, location.pathname) ? <Cabinet /> : <App />);
