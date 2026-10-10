// The command itself: `depth`. It reads where the node is and which language
// the terminal speaks, and hands both to the screens.
//
// Nothing here touches the disk. The identity's key lives in the core, the
// point and the conversation in memory, and quitting forgets all three.

import { createElement as h } from "react";
import { render } from "ink";
import { Client } from "../core/client.ts";
import { App } from "./app.ts";
import { isPlain } from "./kit.ts";
import { languageOf, strings } from "./strings.ts";

const node = process.env.DEPTH_NODE_URL;
const apiKey = process.env.DEPTH_API_KEY;
if (!node || !apiKey) {
  console.error("DEPTH_NODE_URL and DEPTH_API_KEY must be set: the terminal talks to a node, not to itself.");
  process.exit(2);
}

const say = strings(languageOf(process.env));
// `depth restore` — the paper code instead of a new identity (§8.2).
// `depth move` — an identity brought here from another device by its code.
const start = process.argv[2] === "restore" ? "restore" as const
  : process.argv[2] === "move" ? "moveIn" as const
  : undefined;
// DEPTH_PLAIN=1 (kit_RU.md §4): a stream of lines for a reader that is not an
// eye — a screen reader, a pipe, a log. Ink's `debug` writes each new frame
// after the previous one instead of erasing and redrawing in place; the kit
// itself drops the frames and the block cursor (kit.ts). The alternate screen
// buffer is not used in either mode.
render(
  h(App, { say, client: new Client(node, apiKey), fresh: () => new Client(node, apiKey), start }),
  isPlain() ? { debug: true } : undefined,
);
