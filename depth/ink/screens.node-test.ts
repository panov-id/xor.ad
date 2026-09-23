// The screens, rendered and typed into. No node is needed for these: what is
// under test is what a person sees and what the arrows do, not the protocol —
// the protocol has its own live tests in depth/core.

// Not node:test: Ink swallows the runner's report (a failing assertion came
// back green, measured 2026-09-22), so the results go out through
// process._rawDebug, which writes past any patched stdout, and the exit code
// is what the shell script reads.
import assert from "node:assert/strict";

const cases: Array<[string, () => Promise<void>]> = [];
const test = (name: string, fn: () => Promise<void>) => cases.push([name, fn]);
const say_ = (line: string) => (process as unknown as { _rawDebug: (s: string) => void })._rawDebug(line);
setTimeout(async () => {
  let failed = 0;
  // A run with nothing in it is not a pass: an empty set used to print
  // "провалено 0" and exit green (operations lens, 2026-09-22).
  if (cases.length < 9) {
    say_(`тестов должно быть не меньше девяти, а собрано ${cases.length}`);
    process.exit(1);
  }
  for (const [name, fn] of cases) {
    try {
      await fn();
      say_(`ok   ${name}`);
    } catch (e) {
      failed++;
      say_(`FAIL ${name}\n     ${(e as Error).message.split("\n")[0]}`);
    }
  }
  say_(failed === 0 ? `пройдено ${cases.length}, провалено 0` : `пройдено ${cases.length - failed}, провалено ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}, 0);
import { createElement as h } from "react";
import { render } from "ink-testing-library";
import { Feed, Location, Registration } from "./screens.ts";
import { plain } from "./parts.ts";
import { Away, Blocked, Chat, Hidden, Inbox, Liked, Me, Statements, StepAway, Write } from "./rooms.ts";
import { strings } from "./strings.ts";

const say = strings("ru");
const settle = () => new Promise((done) => setTimeout(done, 50));

// A person types slower than React re-renders; without a pause between keys
// the screen would still hold the state the previous key produced, and the
// test would be measuring the test harness, not the screen.
async function type(app: { stdin: { write: (s: string) => void } }, ...keys: string[]) {
  for (const k of keys) {
    app.stdin.write(k);
    await settle();
  }
}
const DOWN = "\u001B[B", UP = "\u001B[A", RIGHT = "\u001B[C", LEFT = "\u001B[D", ENTER = "\r", BACK = "\u007F";
void [DOWN, UP, RIGHT, LEFT, ENTER, BACK];

test("registration will not go on without a name and an age", async () => {
  let got: { name: string; age: number } | null = null;
  const app = render(h(Registration, { say, onDone: (name, age) => (got = { name, age }) }));
  await settle();
  assert.match(app.lastFrame()!, /Operator\./);
  // The action is there but refuses to fire while the fields are empty.
  await type(app, "\r");
  await settle();
  assert.equal(got, null, "an empty registration went through");

  await type(app, "Аня", "\u001B[B", "27");
  assert.match(app.lastFrame()!, /Аня/);
  // Down once more: out of the fields and onto the row of actions.
  await type(app, "\u001B[B", "\r");
  await settle();
  assert.deepEqual(got, { name: "Аня", age: 27 });
  app.unmount();
});

test("an age under eighteen does not open the door", async () => {
  let got: unknown = null;
  const app = render(h(Registration, { say, onDone: (name, age) => (got = { name, age }) }));
  await settle();
  await type(app, "Аня", "\u001B[B", "15", "\u001B[B", "\r");
  await settle();
  assert.equal(got, null, "a fifteen-year-old was registered");
  app.unmount();
});

test("the location refuses a point off the globe and turns the radius with the arrows", async () => {
  let got: { lat: number; lon: number; radius: number } | null = null;
  const app = render(h(Location, { say, onDone: (place) => (got = place) }));
  await settle();
  await type(app, "199", "\u001B[B", "30.33", "\u001B[B", "\u001B[B", "\r");
  await settle();
  assert.equal(got, null, "a latitude of 199 was accepted");
  assert.match(app.lastFrame()!, /-90/, "the screen does not say what is wrong");

  // Back to the latitude, fix it, then step down to the radius and turn it.
  // Up three times: the row of actions, then the radius, then back to the
  // latitude, which is what the cursor has to reach to be fixed.
  await type(app, "\u001B[A", "\u001B[A", "\u001B[A");
  await type(app, "\u007F", "\u007F", "\u007F");
  await type(app, "59.93");
  await type(app, "\u001B[B", "\u001B[B");
  await type(app, "\u001B[C");
  assert.match(app.lastFrame()!, /3000/, "the radius did not turn");
  await type(app, "\u001B[B", "\r");
  assert.deepEqual(got, { lat: 59.93, lon: 30.33, radius: 3000 });
  app.unmount();
});

test("every language renders the first screen without holes", async () => {
  for (const lang of ["en", "ka", "tg", "el"] as const) {
    const app = render(h(Registration, { say: strings(lang), onDone: () => {} }));
    await settle();
    const frame = app.lastFrame()!;
    assert.equal(frame.includes("{"), false, `${lang}: a placeholder was left on the screen`);
    assert.ok(frame.length > 50, `${lang}: the screen came out empty`);
    app.unmount();
  }
});

test("what the node sends cannot repaint the screen", async () => {
  // A name carrying a cursor jump and a colour reset, and an OSC title change:
  // both must come out as text, not as instructions to the terminal.
  const nasty = "Марк\u001B[2J\u001B[H\u001B[31m\u001B]0;узел тут\u0007\u0000";
  const clean = plain(nasty);
  assert.equal(clean.includes("\u001B"), false, `an escape survived: ${JSON.stringify(clean)}`);
  assert.match(clean, /^Марк/, "the name itself was eaten");
  assert.equal(plain("x".repeat(900)).length, 400, "a long line is not cut to a screenful");
  assert.equal(plain(undefined), "", "an absent value must not print as undefined");
});

test("a fresh terminal will not register while the PIN is a placeholder", async () => {
  // The core's escape hatch is what the tests pass; the image must not.
  const { Client } = await import("../core/client.ts");
  const client = new Client("http://127.0.0.1:1", "k");
  await assert.rejects(() => client.register({ name: "Аня", age: 27 }), /placeholders/);
});

test("a safety code that changed drops the \"compared\" mark", async () => {
  // A stub node: the first conversation gives one code, the next another —
  // which is what a long key becoming someone else's looks like from here.
  const codes = ["1111 1111 1111 1111 1111", "1111 1111 1111 1111 1111", "2222 2222 2222 2222 2222"];
  let at = 0;
  const client = {
    openConversation: () => Promise.resolve({ safetyCode: codes[Math.min(at++, codes.length - 1)] }),
    openRoom: () => Promise.resolve({ next: () => new Promise(() => {}), close: () => {} }),
    read: () => Promise.resolve(""),
    sayInChat: () => Promise.resolve({ status: 202, body: {} }),
  };
  const app = render(
    h(Chat, {
      say,
      // deno-lint-ignore no-explicit-any
      client: client as any,
      chatId: "c",
      name: "Марк",
      age: 29,
      limit: 146,
      onBack: () => {},
      onError: () => {},
    }),
  );
  await settle(150);
  // Into the row, onto "код", and open it; then say it matched.
  await type(app, DOWN, RIGHT, ENTER);
  await settle(200);
  assert.match(app.lastFrame()!, /1111 1111/, "the code panel did not open");
  await type(app, ENTER);
  await settle(150);
  assert.match(app.lastFrame()!, /код сверен/, "the mark was not set");

  // Open it again — the cursor is still on "код" — and the node now hands
  // over another code.
  await type(app, ENTER);
  await settle(250);
  const frame = app.lastFrame()!;
  assert.match(frame, /2222 2222/, "the panel kept showing the old code");
  assert.match(frame, /код изменился/, "the change was not announced");
  assert.equal(/код сверен/.test(frame), false, "\"compared\" survived a changed code");
  app.unmount();
});

test("blocking asks twice, and says what it costs", async () => {
  let blocked = 0;
  const client = {
    openConversation: () => Promise.resolve({ safetyCode: "1111 1111 1111 1111 1111" }),
    openRoom: () => Promise.resolve({ next: () => new Promise(() => {}), close: () => {} }),
    read: () => Promise.resolve(""),
    blockByChat: () => {
      blocked++;
      return Promise.resolve({ status: 204, body: {} });
    },
  };
  let back = 0;
  const app = render(
    h(Chat, {
      say,
      // deno-lint-ignore no-explicit-any
      client: client as any,
      chatId: "c",
      name: "Марк",
      age: 29,
      limit: 128,
      onBack: () => back++,
      onError: () => {},
    }),
  );
  await settle(150);
  // Into the row, along to "заблокировать": send, код, свой срок, закончить беседу, block.
  await type(app, DOWN, RIGHT, RIGHT, RIGHT, RIGHT, ENTER);
  await settle(150);
  assert.equal(blocked, 0, "one press blocked without asking");
  assert.match(app.lastFrame()!, /точно заблокировать/, "the screen did not ask");
  assert.match(app.lastFrame()!, /беседа закроется у обоих/, "the screen did not say what it costs");
  await type(app, ENTER);
  await settle(200);
  assert.equal(blocked, 1, "the second press did not block");
  assert.equal(back, 1, "the screen stayed in a conversation that is over");
  app.unmount();
});

test("a hidden phrase can be brought back from the list", async () => {
  let rows = [{ id: "h1", kind: "feed", text: "гуляю у реки" }];
  const client = {
    hidden: () => Promise.resolve(rows),
    unhide: (handle: string) => {
      rows = rows.filter((r) => r.id !== handle);
      return Promise.resolve({ status: 204, body: {} });
    },
  };
  const app = render(
    h(Hidden, {
      say,
      // deno-lint-ignore no-explicit-any
      client: client as any,
      onBack: () => {},
      onError: () => {},
    }),
  );
  await settle(200);
  assert.match(app.lastFrame()!, /гуляю у реки/, "the hidden phrase is not on the screen");
  await type(app, ENTER);
  await settle(250);
  assert.match(app.lastFrame()!, /ничего не скрыто/, "the phrase did not leave the list");
  app.unmount();
});

// The Article 17 statement (refusal-wordings §6, frames U, V, W).
const decided = {
  id: "s1", restriction: "hidden" as const, facts: "решение по уведомлению о незаконном содержании",
  ground_kind: "legal" as const, ground_text: "ст. 5 закона о рекламе", automated_used: false,
  created_at: Date.UTC(2026, 7, 24) / 1000,
};
const threshold = {
  id: "s2", restriction: "hidden" as const, facts: "скрыто по жалобам",
  ground_kind: "contractual" as const, ground_text: "п. 4 правил", automated_used: true,
  created_at: Date.UTC(2026, 8, 1) / 1000, until: Date.UTC(2026, 9, 1) / 1000,
};

test("a statement shows all five lines §6 asks for, and 'got it' folds it", async () => {
  let done = 0;
  const app = render(h(Statements, { say, lang: "ru", items: [decided], onDone: () => done++ }));
  await settle();
  const frame = app.lastFrame()!;
  for (const line of [/Ограничений: 1/, /Что произошло/, /скрыто из ленты, 24 августа 2026/, /Почему/,
    /решение по уведомлению/, /решение принял человек/, /закон: ст\. 5 закона о рекламе/,
    /координатору цифровых услуг/]) {
    assert.match(frame, line, `missing on the screen: ${line}`);
  }
  await type(app, ENTER);
  assert.equal(done, 1, "'got it' did not fold the statement");
  app.unmount();
});

test("a threshold hiding says no person decided, and the arrows walk between statements", async () => {
  const app = render(h(Statements, { say, lang: "ru", items: [decided, threshold], onDone: () => {} }));
  await settle();
  assert.match(app.lastFrame()!, /1 \/ 2/);
  await type(app, DOWN);
  const frame = app.lastFrame()!;
  assert.match(frame, /2 \/ 2/, "the down arrow did not move to the second statement");
  assert.match(frame, /скрыто автоматически/, "a threshold hiding claimed a person decided");
  assert.doesNotMatch(frame, /решение принял человек/);
  assert.match(frame, /условия: п\. 4 правил/, "a breach of the terms was shown as a law");
  assert.match(frame, /до 1 октября 2026/, "the end of the restriction is missing");
  app.unmount();
});

test("folded statements stay on 'me' as a red count, and none means no row", async () => {
  const client = {
    profile: () => Promise.resolve({ name: "Аня", name_state: "accepted", age: 34 }),
    hidden: () => Promise.resolve([]),
    blocks: () => Promise.resolve([]),
  };
  const me = (restrictions: number) =>
    // deno-lint-ignore no-explicit-any
    render(h(Me, { say, client: client as any, restrictions, onOpen: () => {}, onBack: () => {}, onError: () => {} }));
  const with2 = me(2);
  await settle();
  await settle();
  assert.match(with2.lastFrame()!, /Ограничений: 2/, "the folded statements vanished from 'me'");
  assert.match(with2.lastFrame()!, /Аня/, "the profile is not on 'me'");
  with2.unmount();
  const none = me(0);
  await settle();
  await settle();
  assert.doesNotMatch(none.lastFrame()!, /Ограничений/, "'me' with nothing restricted shows a count");
  none.unmount();
});

// What I liked (§4.10): the only place a like is taken back from.
const card = (id: string, text: string, state: "liked" | "matched" = "liked") =>
  ({ id, text, like_count: 4, state, liked_at: 1_758_600_000 });

test("a like is taken back from the liked list, and can be undone", async () => {
  const calls: string[] = [];
  const client = {
    likes: () => Promise.resolve({ items: [card("p1", "пекарня на углу")], next: null }),
    unlike: (id: string) => { calls.push(`unlike ${id}`); return Promise.resolve({ status: 200, body: { state: "unliked" } }); },
    like: (id: string) => { calls.push(`like ${id}`); return Promise.resolve({ status: 200, body: { state: "liked" } }); },
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(Liked, { say, client: client as any, onInbox: () => {}, onBack: () => {}, onError: () => {} }));
  await settle();
  await settle();
  assert.match(app.lastFrame()!, /пекарня на углу/, "the liked phrase is not on the screen");
  await type(app, ENTER);
  await settle();
  assert.deepEqual(calls, ["unlike p1"], "'take the like back' did not reach the node");
  assert.match(app.lastFrame()!, /снято/, "the taken-back card left no trace to undo from");
  await type(app, ENTER);
  await settle();
  assert.deepEqual(calls, ["unlike p1", "like p1"], "'undo' did not like it again");
  assert.doesNotMatch(app.lastFrame()!, /снято/);
  app.unmount();
});

test("a like that became an offer to talk is not taken back: it leads to the inbox", async () => {
  let inbox = 0;
  let unliked = 0;
  const client = {
    likes: () => Promise.resolve({ items: [card("p2", "до моря утром", "matched")], next: null }),
    unlike: () => { unliked++; return Promise.resolve({ status: 200, body: { state: "spent" } }); },
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(Liked, { say, client: client as any, onInbox: () => inbox++, onBack: () => {}, onError: () => {} }));
  await settle();
  await settle();
  assert.match(app.lastFrame()!, /предложение поговорить/, "a matched like is not shown as an offer to talk");
  await type(app, ENTER);
  assert.equal(inbox, 1, "the offer did not lead to the inbox");
  assert.equal(unliked, 0, "a spent like was sent to be taken back");
  app.unmount();
});

test("the liked list takes the next page when asked, and says so when it is empty", async () => {
  const pages: Array<string | undefined> = [];
  const client = {
    likes: (after?: string) => {
      pages.push(after);
      return Promise.resolve(after
        ? { items: [card("p4", "вторая страница")], next: null }
        : { items: [card("p3", "первая страница")], next: "123_abc" });
    },
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(Liked, { say, client: client as any, onInbox: () => {}, onBack: () => {}, onError: () => {} }));
  await settle();
  await settle();
  await type(app, RIGHT, ENTER);
  await settle();
  assert.deepEqual(pages, [undefined, "123_abc"], "'show more' did not ask for the next page");
  assert.match(app.lastFrame()!, /вторая страница/);
  assert.match(app.lastFrame()!, /первая страница/, "the next page replaced the first instead of adding to it");
  app.unmount();

  const empty = { likes: () => Promise.resolve({ items: [], next: null }) };
  // deno-lint-ignore no-explicit-any
  const none = render(h(Liked, { say, client: empty as any, onInbox: () => {}, onBack: () => {}, onError: () => {} }));
  await settle();
  await settle();
  assert.match(none.lastFrame()!, /лайкнутого нет/);
  none.unmount();
});

// My blocks (§4.11, screen 10): no names, no phrases, and lifting goes back to the node.
test("a block is lifted from the list, and lifting the last one leaves the screen", async () => {
  let rows = [{ id: "b1", since: Date.UTC(2026, 8, 20) / 1000 }, { id: "b2", since: Date.UTC(2026, 8, 10) / 1000 }];
  const lifted: string[] = [];
  let back = 0;
  const client = {
    blocks: () => Promise.resolve(rows),
    unblock: (id: string) => {
      lifted.push(id);
      rows = rows.filter((r) => r.id !== id);
      return Promise.resolve({ status: 204, body: {} });
    },
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(Blocked, { say, lang: "ru", client: client as any, onBack: () => back++, onError: () => {} }));
  await settle();
  await settle();
  const frame = app.lastFrame()!;
  assert.match(frame, /Заблокировано: 2/);
  assert.match(frame, /блокировка от 20 сентября 2026/, "the block's date is not on the screen");
  await type(app, DOWN, ENTER);
  await settle();
  assert.deepEqual(lifted, ["b2"], "the arrows did not choose which block to lift");
  assert.match(app.lastFrame()!, /Заблокировано: 1/, "the list was not read again after lifting");
  await type(app, ENTER);
  await settle();
  assert.deepEqual(lifted, ["b2", "b1"]);
  assert.equal(back, 1, "an empty list stayed on the screen as 'Blocked: 0'");
  app.unmount();
});

test("'me' offers the blocked list only while there is something on it, and opens what is chosen", async () => {
  let blocks = [{ id: "b1", since: 1 }, { id: "b2", since: 2 }, { id: "b3", since: 3 }];
  const client = {
    profile: () => Promise.resolve({ name: "Аня", name_state: "accepted", age: 34 }),
    hidden: () => Promise.resolve([{ id: "h", kind: "feed", text: "x" }]),
    blocks: () => Promise.resolve(blocks),
  };
  const opened: string[] = [];
  // deno-lint-ignore no-explicit-any
  const some = render(h(Me, { say, client: client as any, restrictions: 0, onOpen: (r: string) => opened.push(r), onBack: () => {}, onError: () => {} }));
  await settle();
  await settle();
  assert.match(some.lastFrame()!, /Заблокировано: 3/, "the blocked list is not offered from 'me'");
  assert.match(some.lastFrame()!, /скрытое · 1/, "the hidden count is not on 'me'");
  await type(some, DOWN, DOWN, ENTER);
  assert.deepEqual(opened, ["blocked"], "the arrows and enter did not open the chosen row");
  some.unmount();
  blocks = [];
  // deno-lint-ignore no-explicit-any
  const none = render(h(Me, { say, client: client as any, restrictions: 0, onOpen: () => {}, onBack: () => {}, onError: () => {} }));
  await settle();
  await settle();
  assert.doesNotMatch(none.lastFrame()!, /Заблокировано/, "'Blocked: 0' was offered");
  none.unmount();
});

test("a long row of actions wraps by whole labels, never inside a word", async () => {
  const client = { feed: () => Promise.resolve({ items: [] }) };
  const app = render(h(Feed, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    place: { lat: 55.75, lon: 37.62, radius: 1000 },
    onWrite: () => {}, onInbox: () => {}, onPoint: () => {}, onMe: () => {}, onError: () => {},
  }));
  await settle();
  const frame = app.lastFrame()!;
  for (const label of ["заблокировать", "сменить точку", "написать", "входящие"]) {
    assert.ok(frame.includes(label), `the label "${label}" was broken across lines`);
  }
  app.unmount();
});

test("an offer's like is not offered to be taken back", async () => {
  let unliked = 0;
  const client = {
    likes: () => Promise.resolve({ items: [{ ...card("o1", "кофе со скидкой"), offer: { discount_value: "−10 %" } }], next: null }),
    unlike: () => { unliked++; return Promise.resolve({ status: 200, body: { state: "spent" } }); },
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(Liked, { say, client: client as any, onInbox: () => {}, onBack: () => {}, onError: () => {} }));
  await settle();
  await settle();
  assert.match(app.lastFrame()!, /кофе со скидкой/);
  await type(app, ENTER);
  assert.equal(unliked, 0, "an offer's spent like was sent to be taken back");
  app.unmount();
});

// "Not now" and taking it back (§4.6): the node stops listing a declined match,
// so the screen keeps the row as "declined · undo" until the person leaves.
test("a match is declined with 'not now' and brought back with 'undo'", async () => {
  const calls: string[] = [];
  let declinedOnNode = false;
  const match = { kind: "match", id: "m1", match_id: "m1", name: "Марк", age: 31 };
  const chat = { kind: "chat", id: "c1", match_id: "m0", name: "Аня", age: 34, chat_expires_at: 1_758_600_000 };
  const client = {
    inbox: () => Promise.resolve(declinedOnNode ? [chat] : [match, chat]),
    decline: (id: string) => { calls.push(`decline ${id}`); declinedOnNode = true; return Promise.resolve({ status: 204, body: {} }); },
    undoDecline: (id: string) => { calls.push(`undo ${id}`); declinedOnNode = false; return Promise.resolve({ status: 204, body: {} }); },
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(Inbox, { say, client: client as any, onOpen: () => {}, onBack: () => {}, onError: () => {} }));
  await settle();
  await settle();
  assert.match(app.lastFrame()!, /не сейчас/, "'not now' is not offered on a match");
  await type(app, RIGHT, ENTER);
  await settle();
  assert.deepEqual(calls, ["decline m1"], "'not now' did not reach the node");
  const after = app.lastFrame()!;
  assert.match(after, /Марк, 31\s+отклонено/, "the declined row left no trace to undo from");
  assert.match(after, /вернуть/);
  await type(app, LEFT, ENTER);
  await settle();
  assert.deepEqual(calls, ["decline m1", "undo m1"], "'undo' did not reach the node");
  assert.match(app.lastFrame()!, /Марк, 31\s+мэтч/, "the match did not come back after 'undo'");
  await type(app, DOWN);
  assert.doesNotMatch(app.lastFrame()!, /не сейчас/, "an open chat offers 'not now'");
  app.unmount();
});

// One's own span (§5, §8.6): the header says it, the last quarter counts down,
// and the one menu item steps through the four values and tells the node.
test("the chat says its own span, counts down its last quarter, and changes it", async () => {
  const spans: number[] = [];
  const client = {
    openConversation: () => Promise.resolve({ safetyCode: "0000 0000 0000 0000 0000" }),
    openRoom: () => Promise.resolve({ next: () => new Promise(() => {}), close: () => {} }),
    setChatSpan: (_id: string, span: number) => { spans.push(span); return Promise.resolve(span); },
  };
  const now = Math.floor(Date.now() / 1000);
  const chat = (endsAt: number) =>
    render(h(Chat, {
      say,
      // deno-lint-ignore no-explicit-any
      client: client as any,
      chatId: "c1", name: "Аня", age: 34, limit: 256, span: 60, endsAt,
      onBack: () => {}, onError: () => {},
    }));
  const calm = chat(now + 50 * 60);
  await settle(150);
  assert.match(calm.lastFrame()!, /гаснет после 1ч ВАШЕГО молчания/, "the header does not say one's own span");
  assert.doesNotMatch(calm.lastFrame()!, /\d+:\d\d\b(?! \d)/, "a countdown shows long before the last quarter");
  // Into the row, along to "свой срок": send, код, свой срок.
  await type(calm, DOWN, RIGHT, RIGHT, ENTER);
  await settle(150);
  assert.deepEqual(spans, [260], "the span item did not step to the next value and tell the node");
  assert.match(calm.lastFrame()!, /гаснет после 4:20 ВАШЕГО молчания/, "the header did not follow the new span");
  calm.unmount();
  const late = chat(now + 10 * 60);
  await settle(150);
  assert.match(late.lastFrame()!, /гаснет после 1ч ВАШЕГО молчания · (9:5\d|10:00)/, "the last quarter does not count down");
  late.unmount();
});

// The tombstone (chat §5, protocol §4.4): a room closed with 4003 while one's
// own clock runs is "ended"; one's own clock reaching zero is "expired". Either
// way what was on the screen goes, the keys are forgotten, and the way out is the feed.
function roomThatCloses() {
  let close: (code: number) => void = () => {};
  const closed = new Promise<number>((r) => (close = r));
  return { room: { next: () => new Promise(() => {}), close: () => {}, closed }, close: (code: number) => close(code) };
}

test("a conversation closed by the node becomes a tombstone that leads to the feed", async () => {
  const { room, close } = roomThatCloses();
  const forgotten: string[] = [];
  let toFeed = 0;
  const client = {
    openConversation: () => Promise.resolve({ safetyCode: "0000 0000 0000 0000 0000" }),
    openRoom: () => Promise.resolve(room),
    forget: (id: string) => forgotten.push(id),
    sayInChat: () => Promise.resolve(),
  };
  const app = render(h(Chat, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    chatId: "c1", name: "Аня", age: 34, limit: 256, span: 60, endsAt: Math.floor(Date.now() / 1000) + 3000,
    onBack: () => {}, onFeed: () => toFeed++, onError: () => {},
  }));
  await settle(150);
  assert.match(app.lastFrame()!, /гаснет после/);
  close(4003);
  await settle(150);
  const frame = app.lastFrame()!;
  assert.match(frame, /Беседа закончилась\./, "a closed conversation still looks open");
  assert.doesNotMatch(frame, /гаснет после|отправить/, "the tombstone still offers to write");
  assert.deepEqual(forgotten, ["c1"], "the keys of an ended conversation were kept");
  await type(app, ENTER);
  assert.equal(toFeed, 1, "the tombstone does not lead back to the feed");
  app.unmount();
});

test("one's own span running out is the other tombstone, even with the room still open", async () => {
  const { room } = roomThatCloses();
  const client = {
    openConversation: () => Promise.resolve({ safetyCode: "0000 0000 0000 0000 0000" }),
    openRoom: () => Promise.resolve(room),
    forget: () => {},
  };
  const app = render(h(Chat, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    chatId: "c2", name: "Аня", age: 34, limit: 256, span: 10, endsAt: Math.floor(Date.now() / 1000) + 1,
    onBack: () => {}, onError: () => {},
  }));
  await new Promise((r) => setTimeout(r, 2300));
  assert.match(app.lastFrame()!, /Срок вышел, переписки больше нет\./, "one's own term ran out and the chat stayed");
  app.unmount();
});

// Stepping away (screen 20): nothing preselected, the price counted on the spot
// from the node's own lists, and a way back that asks once more.
test("stepping away shows its price only once a span is chosen, and goes only then", async () => {
  const now = Math.floor(Date.now() / 1000);
  const went: string[] = [];
  let gone = 0;
  const client = {
    profile: () => Promise.resolve({ name: "Аня", name_state: "accepted", age: 34, phrases: [{ id: "p1" }, { id: "p2", expires_at: now + 3000 }] }),
    likes: (after?: string) => Promise.resolve(after ? { items: [card("l3", "c")], next: null } : { items: [card("l1", "a"), card("l2", "b")], next: "x_y" }),
    inbox: () => Promise.resolve([
      { kind: "chat", id: "c1", chat_expires_at: now + 10 * 60, state: "open" },
      { kind: "chat", id: "c2", chat_expires_at: now + 200 * 60, state: "open" },
      { kind: "match", id: "m1" },
    ]),
    stepAway: (span: string) => { went.push(span); return Promise.resolve(now + 1200); },
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(StepAway, { say, client: client as any, onGone: () => gone++, onBack: () => {}, onError: () => {} }));
  await settle(150);
  assert.match(app.lastFrame()!, /выберите срок — посчитаем, что он стоит/, "a span looks preselected");
  await type(app, ENTER);
  assert.deepEqual(went, [], "'step away' went without a chosen span");
  await type(app, DOWN);
  assert.match(app.lastFrame()!, /фраз исчезнет: 2 · лайков снимется: 3 · бесед не переживут: 1 из 2/,
    "the price is not counted from the phrases, the likes and the conversations");
  await type(app, DOWN);
  assert.match(app.lastFrame()!, /бесед не переживут: 1 из 2/);
  await type(app, DOWN);
  assert.match(app.lastFrame()!, /бесед не переживут: 2 из 2/, "a longer span did not cost more conversations");
  await type(app, ENTER);
  await settle();
  assert.deepEqual(went, ["long"], "'step away' did not go for the chosen span");
  assert.equal(gone, 1);
  app.unmount();
});

test("the away screen says until when, and coming back asks once more", async () => {
  let back = 0;
  let calls = 0;
  const until = Math.floor(Date.now() / 1000) + 41 * 60;
  const client = { comeBack: () => { calls++; return Promise.resolve(); } };
  // deno-lint-ignore no-explicit-any
  const app = render(h(Away, { say, client: client as any, until, onBack: () => back++, onError: () => {} }));
  await settle();
  const frame = app.lastFrame()!;
  assert.match(frame, /Вы отошли\. Фразы сняты, беседы ждут\./);
  assert.match(frame, /до \d\d:\d\d · осталось 4[01] мин/, "the away screen does not say until when");
  assert.doesNotMatch(frame, /signal|входящие/, "the away screen shows the product");
  await type(app, ENTER);
  assert.equal(calls, 0, "coming back did not ask first");
  assert.match(app.lastFrame()!, /вы хотели перерыв, точно возвращаемся\?/);
  await type(app, ENTER);
  await settle();
  assert.equal(calls, 1);
  assert.equal(back, 1, "coming back did not leave the away screen");
  app.unmount();
});

test("a peer who stepped away is marked over the input, until their first line", async () => {
  const frames: Array<{ type: string; seq: number; data: unknown }> = [
    { type: "sys", seq: 1, data: { kind: "peer_stepped_away" } },
  ];
  let wake: () => void = () => {};
  const client = {
    openConversation: () => Promise.resolve({ safetyCode: "0000 0000 0000 0000 0000" }),
    openRoom: () => Promise.resolve({
      next: () => frames.length > 0 ? Promise.resolve(frames.shift()!) : new Promise((r) => (wake = () => r(frames.shift()!))),
      close: () => {},
      closed: new Promise(() => {}),
    }),
    read: () => Promise.resolve("я вернулся"),
  };
  const app = render(h(Chat, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    chatId: "c3", name: "Аня", age: 34, limit: 256, span: 60, endsAt: Math.floor(Date.now() / 1000) + 3000,
    onBack: () => {}, onError: () => {},
  }));
  await settle(150);
  assert.match(app.lastFrame()!, /отошёл/, "the other side's step away is not marked");
  assert.match(app.lastFrame()!, /отправить/, "the input died while the other side is away");
  frames.push({ type: "message", seq: 2, data: { id: "x", ciphertext: "y" } });
  wake();
  await settle(150);
  assert.doesNotMatch(app.lastFrame()!, /отошёл/, "the mark stayed after the other side's own line");
  app.unmount();
});

// A refused phrase is said to be refused, with the node's own reason and time,
// and stays in the field (refusal-wordings §3–§5). Until 23.09.2026 every
// answer counted as sent.
test("a phrase the node refuses is said to be refused, and stays in the field", async () => {
  const now = Math.floor(Date.now() / 1000);
  const answers = [
    { status: 409, body: { error: { code: "refused", live: 4 } } },
    { status: 429, body: { error: { code: "rate_limited", next_slot: now + 600 } } },
    { status: 409, body: { error: { code: "refused", checking: 1 } } },
    { status: 429, body: { error: { code: "rate_limited", until: now + 900 } } },
    { status: 202, body: { id: "p9", state: "pending" } },
  ];
  const done: string[] = [];
  const client = {
    say: () => Promise.resolve(answers.shift()!),
    profile: () => Promise.resolve({ name: "Аня", name_state: "accepted", age: 34, phrases: [{ id: "a", expires_at: now + 3600 }, { id: "b", expires_at: now + 1200 }] }),
  };
  const app = render(h(Write, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    place: { lat: 55.75, lon: 37.62, radius: 1000 },
    limit: 128,
    onDone: (t: string) => done.push(t), onBack: () => {}, onError: () => {},
  }));
  await settle();
  await type(app, ..."гуляю у реки".split(""), DOWN, ENTER);
  await settle(150);
  const hhmm = (s: number) => new Date(s * 1000).toTimeString().slice(0, 5);
  assert.match(app.lastFrame()!, new RegExp(`Четыре фразы уже живут\\. Ближайшая освободится в ${hhmm(now + 1200)}\\.`),
    "four live phrases were not said with the soonest free slot");
  assert.match(app.lastFrame()!, /гуляю у реки/, "the refused text left the field");
  assert.deepEqual(done, [], "a refused phrase counted as sent");
  await type(app, ENTER);
  await settle(150);
  assert.match(app.lastFrame()!, new RegExp(`Следующую можно в ${hhmm(now + 600)}`), "the hour's ceiling was not said");
  await type(app, ENTER);
  await settle(150);
  assert.match(app.lastFrame()!, /Проверяем прошлое — новое уйдёт после вердикта\./);
  await type(app, ENTER);
  await settle(150);
  assert.match(app.lastFrame()!, new RegExp(`Пять отказов за час — пауза до ${hhmm(now + 900)}`), "the pause was not said");
  await type(app, ENTER);
  await settle(150);
  assert.deepEqual(done, ["гуляю у реки"], "an accepted phrase did not count as sent");
  app.unmount();
});
