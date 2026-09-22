// Sends one phrase to a node the way a person does: a fresh test-only
// registration, then POST /feed. Used by scripts/seed-local-phrase.sh so the
// local stand's feed queue is filled through the front door.
import { Client } from "../core/client.ts";

const client = new Client(Deno.env.get("DEPTH_NODE_URL") ?? "http://localhost:62080", Deno.env.get("DEPTH_API_KEY")!);
await client.register({ name: Deno.env.get("SEED_NAME") ?? "Аня", age: 30 }, { testOnly: true });
await client.confirmPaperCode();
const sent = await client.say({
  text: Deno.env.get("SEED_TEXT")!, mode: "alone", lat: 60.17, lon: 24.94, radius: 1000,
});
if (sent.status !== 202) {
  console.error("not accepted:", sent.status, JSON.stringify(sent.body));
  Deno.exit(1);
}
