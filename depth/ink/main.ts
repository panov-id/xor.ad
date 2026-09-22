// The command itself: `depth`. It reads where the node is and which language
// the terminal speaks, and hands both to the screens.
//
// Nothing here touches the disk. The identity's key lives in the core, the
// point and the conversation in memory, and quitting forgets all three.

import { createElement as h } from "react";
import { render } from "ink";
import { Client } from "../core/client.ts";
import { App } from "./app.ts";
import { languageOf, strings } from "./strings.ts";

const node = process.env.DEPTH_NODE_URL;
const apiKey = process.env.DEPTH_API_KEY;
if (!node || !apiKey) {
  console.error("DEPTH_NODE_URL and DEPTH_API_KEY must be set: the terminal talks to a node, not to itself.");
  process.exit(2);
}

const say = strings(languageOf(process.env));
render(h(App, { say, client: new Client(node, apiKey) }));
