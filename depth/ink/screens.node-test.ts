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
import { Feed, Location, PaperCode, PaperCodeEntry, PinSet, Registration } from "./screens.ts";
import { plain } from "./parts.ts";
import { Away, Blocked, ChangePin, Chat, EditProfile, Hidden, Inbox, Liked, Me, StartAgain, Statements, StepAway, Write } from "./rooms.ts";
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

test("the PIN goes on only when both are the same six digits, and is drawn as dots", async () => {
  let got: string | null = null;
  const app = render(h(PinSet, { say, onDone: (pin) => (got = pin) }));
  await settle();
  await type(app, "48291a3", DOWN, "482914", DOWN, ENTER);
  assert.equal(got, null, "two different PINs went through");
  assert.match(app.lastFrame()!, /не совпадают/, "the screen does not say the PINs differ");
  assert.equal(/48291/.test(app.lastFrame()!), false, "the PIN is on the screen in the clear");
  assert.match(app.lastFrame()!, /••••••/, "the PIN is not drawn as dots");
  await type(app, UP, BACK, "3", DOWN, ENTER);
  assert.equal(got, "482913", "the same PIN twice did not go on");
  app.unmount();
});

test("the paper code goes no further until its second and fourth groups come back", async () => {
  let done = false;
  const groups = ["RTQ4", "8FMK", "2PZN", "XW90"];
  const app = render(h(PaperCode, { say, groups, onDone: () => (done = true) }));
  await settle();
  assert.match(app.lastFrame()!, /RTQ4 - 8FMK - 2PZN - XW90/, "the code is not shown in four groups");
  // The first and the third: the wrong two.
  await type(app, "RTQ4", DOWN, "2PZN", DOWN, ENTER);
  assert.equal(done, false, "the wrong groups finished the registration");
  assert.match(app.lastFrame()!, /не совпадают/, "the screen does not say the groups are wrong");
  // Back up, clear both, and type the right ones the way people write: lower
  // case, and an O for the zero.
  await type(app, UP, BACK, BACK, BACK, BACK, "xw9o", UP, BACK, BACK, BACK, BACK, "8fmk", DOWN, DOWN, ENTER);
  assert.equal(done, true, "the second and the fourth groups did not finish the registration");
  app.unmount();
});

test("changing the PIN says how many attempts a wrong old PIN left", async () => {
  const answers = [
    { status: 409, body: { error: { code: "pin_mismatch", attempts_left: 9 } } },
    { status: 200, body: null },
  ];
  const calls: string[][] = [];
  const client = {
    changePin: (current: string, next: string) => {
      calls.push([current, next]);
      return Promise.resolve(answers[calls.length - 1]);
    },
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(ChangePin, { say, client: client as any, onBack: () => {}, onError: () => {} }));
  await settle();
  await type(app, "999999", DOWN, "222222", DOWN, "222222", DOWN, ENTER);
  await settle(100);
  assert.deepEqual(calls[0], ["999999", "222222"]);
  assert.match(app.lastFrame()!, /Осталось попыток: 9/, "the attempts left are not on the screen");
  await type(app, ENTER);
  await settle(100);
  assert.match(app.lastFrame()!, /ПИН сменён/, "a changed PIN is not said to be changed");
  app.unmount();
});

test("starting again counts what goes, names the code, and waits for the PIN", async () => {
  let closedWith: string | null = null;
  let closed = false;
  const client = {
    profile: () => Promise.resolve({ phrases: [{ id: "a" }, { id: "b" }] }),
    inbox: () => Promise.resolve([{ chat_id: "c" }]),
    closeIdentity: (pin: string) => {
      closedWith = pin;
      return Promise.resolve({ status: 200, body: null });
    },
  };
  const app = render(
    // deno-lint-ignore no-explicit-any
    h(StartAgain, { say, client: client as any, onClosed: () => (closed = true), onBack: () => {}, onError: () => {} }),
  );
  await settle(100);
  const frame = app.lastFrame()!;
  assert.match(frame, /исчезнет фраз: 2/, "the phrases that go are not counted");
  assert.match(frame, /бесед и предложений: 1/, "the conversations that end are not counted");
  assert.match(frame, /Бумажный код станет бесполезен/, "the paper code's death is not named");
  await type(app, DOWN, ENTER);
  assert.equal(closedWith, null, "the identity was closed without a PIN");
  await type(app, UP, "123456", DOWN, ENTER);
  await settle(100);
  assert.equal(closedWith, "123456");
  assert.equal(closed, true, "a close the node accepted did not move on");
  app.unmount();
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

// A cursor the node no longer opens — a rolled key, or one from an older
// image on a mixed pool — is answered 400 (lib/cursor.ts on the node). The
// list starts again from the first page instead of ending on an error
// (review panel 2026-09-24; loop plan A2).
test("a refused cursor starts the liked list again from the first page", async () => {
  const { CursorRefused } = await import("../core/client.ts");
  const pages: Array<string | undefined> = [];
  const errors: string[] = [];
  const client = {
    likes: (after?: string) => {
      pages.push(after);
      return after
        ? Promise.reject(new CursorRefused())
        : Promise.resolve({ items: [card("p5", "снова с начала")], next: "stale" });
    },
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(Liked, { say, client: client as any, onInbox: () => {}, onBack: () => {}, onError: (e: string) => errors.push(e) }));
  await settle();
  await settle();
  await type(app, RIGHT, ENTER);
  await settle();
  await settle();
  assert.deepEqual(errors, [], "a refused cursor ended the list on an error");
  assert.deepEqual(pages, [undefined, "stale", undefined], "the list did not start again from the first page");
  assert.equal(app.lastFrame()!.split("снова с начала").length - 1, 1, "the first page was added twice instead of replacing the list");
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
  // name, age, liked, hidden, blocked.
  await type(some, DOWN, DOWN, DOWN, DOWN, ENTER);
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

test("a table card in the feed shows its game and free seats, sits down on open, and takes no like", async () => {
  let likes = 0;
  const opened: string[] = [];
  const client = {
    feed: () => Promise.resolve({ items: [{ kind: "table", id: "t1", game: "dots", set: "4x4", seats: 2, free_seats: 1, playing: 1, watching: 0, like_count: 2, text: "" }] }),
    like: () => { likes++; return Promise.resolve({ status: 200, body: {} }); },
  };
  const app = render(h(Feed, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    place: { lat: 55.75, lon: 37.62, radius: 1000 },
    onWrite: () => {}, onInbox: () => {}, onPoint: () => {}, onMe: () => {}, onError: () => {},
    onOpenTable: (id: string) => opened.push(id),
  }));
  await settle();
  await settle();
  assert.match(app.lastFrame()!, /стол · dots 4x4/, "the table card is not drawn as a table");
  assert.match(app.lastFrame()!, /свободно 1/);
  assert.match(app.lastFrame()!, /сесть/, "the row does not offer to sit down");
  await type(app, ENTER);
  assert.deepEqual(opened, ["t1"], "open on a table did not sit down at it");
  await type(app, RIGHT, ENTER);
  assert.equal(likes, 0, "a table was liked from the feed's row");
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
    // The screen reads the inbox with what happened since the last look (§8.12,
    // P3): the match arrived and a reply waits, so the rows carry marks.
    inboxSince: () => Promise.resolve({
      items: declinedOnNode ? [chat] : [{ ...match, arrived_since: true }, { ...chat, pending_messages: 2 }],
      events: { new_matches: declinedOnNode ? 0 : 1, waiting_for_you: 0, new_chats: 0, pending_messages: 2, ending_soon: 0 },
    }),
    decline: (id: string) => { calls.push(`decline ${id}`); declinedOnNode = true; return Promise.resolve({ status: 204, body: {} }); },
    undoDecline: (id: string) => { calls.push(`undo ${id}`); declinedOnNode = false; return Promise.resolve({ status: 204, body: {} }); },
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(Inbox, { say, client: client as any, onOpen: () => {}, onBack: () => {}, onError: () => {} }));
  await settle();
  await settle();
  assert.match(app.lastFrame()!, /не сейчас/, "'not now' is not offered on a match");
  // Since the last look (§8.12, P3): the badge in the head counts one new
  // offer and two waiting replies; the match row is marked new, the chat row
  // carries its count.
  assert.match(app.lastFrame()!, /входящие\s+● 1\s+✉ 2/, "the head does not carry the inbox's counts");
  assert.match(app.lastFrame()!, /Марк, 31\s+●\s+мэтч/, "a match that arrived since the last look is not marked");
  assert.match(app.lastFrame()!, /Аня, 34\s+● 2\s+чат открыт/, "a chat with replies waiting does not show their count");
  await type(app, RIGHT, ENTER);
  await settle();
  assert.deepEqual(calls, ["decline m1"], "'not now' did not reach the node");
  const after = app.lastFrame()!;
  assert.match(after, /Марк, 31\s+отклонено/, "the declined row left no trace to undo from");
  assert.match(after, /вернуть/);
  await type(app, LEFT, ENTER);
  await settle();
  assert.deepEqual(calls, ["decline m1", "undo m1"], "'undo' did not reach the node");
  // Back with its mark: the look has not ended, so it is still new since the last one.
  assert.match(app.lastFrame()!, /Марк, 31\s+●\s+мэтч/, "the match did not come back after 'undo'");
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

// The node's restart closes every room with 1001 (protocol §4.4): the screen
// opens the room again, and a line the node hands on both openings — depth
// confirms no receipt — is drawn once (core/reconnect.ts, 2026-09-24).
test("a room the node closed for a restart is opened again, and a line handed twice is shown once", async () => {
  const frames = [{ type: "message", seq: 1, data: { id: "l1", ciphertext: "x" } }];
  const rooms: Array<ReturnType<typeof roomThatCloses>> = [];
  const roomWith = () => {
    const made = roomThatCloses();
    const queue = [...frames];
    made.room.next = () => queue.length ? Promise.resolve(queue.shift()!) : new Promise(() => {});
    rooms.push(made);
    return made.room;
  };
  let opened = 0;
  const client = {
    openConversation: () => Promise.resolve({ safetyCode: "0000 0000 0000 0000 0000" }),
    openRoom: () => { opened++; return Promise.resolve(roomWith()); },
    read: (_c: string, _ct: string, id: string) => Promise.resolve(`строка ${id}`),
    forget: () => {},
  };
  const app = render(h(Chat, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    chatId: "c3", name: "Аня", age: 34, limit: 256, span: 60, endsAt: Math.floor(Date.now() / 1000) + 3000,
    onBack: () => {}, onError: (e: string) => { throw new Error(`the screen went to an error: ${e}`); },
  }));
  await settle(150);
  assert.equal(opened, 1);
  assert.match(app.lastFrame()!, /строка l1/);
  rooms[0].close(1001);
  // settle() waits 50 ms whatever it is given; the pause before coming back is
  // half a second to a second (core/reconnect.ts).
  await new Promise((r) => setTimeout(r, 1300));
  assert.equal(opened, 2, "a room closed for the node's restart was not opened again");
  const frame = app.lastFrame()!;
  assert.equal(frame.split("строка l1").length - 1, 1, "a line handed on both openings was drawn twice");
  assert.doesNotMatch(frame, /Беседа закончилась/, "a restart was taken for the end of the conversation");
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

// Editing the profile (§4.11; the refusals approved by the owner 23.09.2026).
test("a frozen name is refused in the approved words, and a free one is saved", async () => {
  const answers = [
    { status: 409, body: { error: { code: "name_frozen" } } },
    { status: 429, body: { error: { code: "rate_limited" } }, retryAfter: 3 * 3600 - 120 },
    { status: 202, body: { name: "Аня", name_pending: "Анна" } },
  ];
  const sent: unknown[] = [];
  let done = 0;
  const client = { editProfile: (patch: unknown) => { sent.push(patch); return Promise.resolve(answers.shift()!); } };
  const app = render(h(EditProfile, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    field: "name", current: "Аня",
    onDone: () => done++, onBack: () => {}, onError: () => {},
  }));
  await settle();
  assert.match(app.lastFrame()!, /меняется на чистом счету/);
  await type(app, BACK, BACK, BACK, ..."Анна".split(""), DOWN, ENTER);
  await settle();
  assert.deepEqual(sent, [{ name: "Анна" }]);
  assert.match(app.lastFrame()!, /Имя меняется только на чистом счету: пока живёт ваша фраза или открыта беседа, оно заморожено\./);
  await type(app, ENTER);
  await settle();
  // The window slides, so "tomorrow" was a promise the node did not keep: the hours
  // left, rounded up, from Retry-After (the owner's decision of 2026-09-24).
  assert.match(app.lastFrame()!, /Правок профиля пока достаточно — снова можно через 3 ч\./);
  await type(app, ENTER);
  await settle();
  assert.equal(done, 1, "a name taken for the queue did not leave the editor");
  app.unmount();
});

test("an age crossing 20/21 upwards is asked first, and going back down is refused", async () => {
  const answers = [
    { status: 200, body: { age: 21 } },
  ];
  const sent: unknown[] = [];
  let done = 0;
  const client = { editProfile: (patch: unknown) => { sent.push(patch); return Promise.resolve(answers.shift()!); } };
  const up = render(h(EditProfile, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    field: "age", current: "20",
    onDone: () => done++, onBack: () => {}, onError: () => {},
  }));
  await settle();
  await type(up, BACK, BACK, "2", "1", DOWN, ENTER);
  assert.deepEqual(sent, [], "crossing 20/21 went without asking");
  assert.match(up.lastFrame()!, /Перейти в полосу 21\+\?/);
  await type(up, ENTER);
  await settle();
  assert.deepEqual(sent, [{ age: 21 }]);
  assert.equal(done, 1);
  up.unmount();

  const down = { editProfile: () => Promise.resolve({ status: 409, body: { error: { code: "age_step_down" } } }) };
  const back = render(h(EditProfile, {
    say,
    // deno-lint-ignore no-explicit-any
    client: down as any,
    field: "age", current: "22",
    onDone: () => {}, onBack: () => {}, onError: () => {},
  }));
  await settle();
  await type(back, BACK, BACK, "1", "9", DOWN, ENTER);
  await settle();
  assert.match(back.lastFrame()!, /Из полосы 21\+ обратно не переходят\./, "going down across 20/21 was not refused in words");
  back.unmount();
});

// 4.4.1 · the feed card draws a phrase through plain(): the node is the
// adversary, and a phrase must not repaint the screen or reorder its tail (V6).
test("the full-screen card draws a phrase's control codes as dots", async () => {
  const client = {
    feed: () => Promise.resolve({ items: [{ id: "p1", text: "фраза\u001B[2J\u001B]0;узел\u0007 и‮хвост", like_count: 0 }] }),
    like: () => Promise.resolve({ status: 200, body: { state: "liked" } }),
    hide: () => Promise.resolve("h"),
  };
  const app = render(h(Feed, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    place: { lat: 55.75, lon: 37.62, radius: 1000 },
    onWrite: () => {}, onInbox: () => {}, onPoint: () => {}, onMe: () => {}, onError: () => {},
  }));
  await settle(150);
  await type(app, ENTER);
  const frame = app.lastFrame()!;
  assert.doesNotMatch(frame, /\u001B\[2J|\u001B\]0;|‮/, "a phrase's control codes reached the screen");
  assert.match(frame, /фраза·· и·хвост/, "the phrase is not drawn with dots where its codes were");
  app.unmount();
});

// 4.4.1 · a card on the whole screen: the first arrow explains, then → likes
// and ← hides; someone else's end is a word only when the node says "soon".
test("the full-screen card explains its arrows once, then likes, hides and goes back", async () => {
  const calls: string[] = [];
  const client = {
    feed: () => Promise.resolve({ items: [
      { id: "p1", text: "первая фраза", like_count: 3, soon: true },
      { id: "p2", text: "вторая фраза", like_count: 0 },
      { id: "o1", text: "кофе со скидкой", like_count: 1, offer: { discount_value: "−10 %" } },
    ] }),
    like: (id: string) => { calls.push(`like ${id}`); return Promise.resolve({ status: 200, body: { state: "liked" } }); },
    hide: (id: string) => { calls.push(`hide ${id}`); return Promise.resolve("h"); },
  };
  const app = render(h(Feed, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    place: { lat: 55.75, lon: 37.62, radius: 1000 },
    onWrite: () => {}, onInbox: () => {}, onPoint: () => {}, onMe: () => {}, onError: () => {},
  }));
  await settle(150);
  await type(app, ENTER);
  assert.match(app.lastFrame()!, /первая фраза/);
  assert.match(app.lastFrame()!, /\+ 3 · скоро исчезнет/, "a phrase marked soon is not said to be going");
  assert.doesNotMatch(app.lastFrame()!, /вторая фраза/, "the card shows its neighbours");
  await type(app, RIGHT);
  assert.deepEqual(calls, [], "the first arrow acted instead of explaining");
  assert.match(app.lastFrame()!, /вправо — лайк, влево — скрыть/);
  await type(app, ENTER, RIGHT);
  await settle();
  assert.deepEqual(calls, ["like p1"], "→ did not like after the explanation");
  assert.match(app.lastFrame()!, /вторая фраза/, "the liked card stayed on the screen");
  assert.doesNotMatch(app.lastFrame()!, /скоро исчезнет/, "a phrase with time left was said to be going");
  await type(app, LEFT);
  await settle();
  assert.deepEqual(calls, ["like p1", "hide p2"]);
  assert.match(app.lastFrame()!, /скрыто/);
  assert.match(app.lastFrame()!, /кофе со скидкой/);
  await type(app, RIGHT);
  assert.deepEqual(calls, ["like p1", "hide p2"], "→ liked an offer, whose like cannot be taken back");
  await type(app, ENTER);
  assert.match(app.lastFrame()!, /signal/, "enter did not go back to the feed");
  app.unmount();
});

// B1 · the paper code typed in to raise the identity (§8.2).
test("the paper code goes in the way people write it, and not before it is whole", async () => {
  let got: string | null = null;
  const app = render(h(PaperCodeEntry, {
    say, title: say("restore.title"), lines: [say("restore.intro")], go: say("restore.go"), onDone: (c: string) => (got = c),
  }));
  await settle();
  assert.match(app.lastFrame()!, /Бумажный код/, "the screen does not say what it asks for");
  // Fifteen characters and a U: not a code, and the screen says so once it is long enough.
  await type(app, "rtq4-8fmk-2pzn-xw9", DOWN, ENTER);
  assert.equal(got, null, "fifteen characters went on as a code");
  await type(app, UP, "U");
  assert.match(app.lastFrame()!, /Это не бумажный код/, "a U in the code is not called out");
  assert.equal(got, null);
  // The U out, an O for the zero, lower case and dashes: read as the core reads it.
  await type(app, BACK, "o", DOWN, ENTER);
  assert.equal(got, "RTQ48FMK2PZNXW90", "the typed code did not reach the core read back");
  app.unmount();
});

test("the paper code goes in exactly as the screen showed it, spaces around the dashes", async () => {
  let got: string | null = null;
  const app = render(h(PaperCodeEntry, {
    say, title: say("restore.title"), lines: [], go: say("restore.go"), onDone: (c: string) => (got = c),
  }));
  await settle();
  // Twenty-five characters: the field used to stop at 24 and drop the last one.
  await type(app, "RTQ4 - 8FMK - 2PZN - XW9D", DOWN, ENTER);
  assert.equal(got, "RTQ48FMK2PZNXW9D", "the code as the screen shows it did not go in");
  app.unmount();
});

test("the paper code is offered on the \"me\" screen: a new one, and opening this device", async () => {
  const opened: string[] = [];
  const client = {
    profile: () => Promise.resolve({ name: "Женя", age: 30, name_state: "accepted" }),
    hidden: () => Promise.resolve([]),
    blocks: () => Promise.resolve([]),
  };
  const app = render(h(Me, {
    // deno-lint-ignore no-explicit-any
    say, client: client as any, restrictions: 0, onOpen: (row: string) => opened.push(row), onBack: () => {}, onError: () => {},
  }));
  await settle();
  const frame = app.lastFrame()!;
  assert.match(frame, /новый бумажный код/, "no way to a new paper code");
  assert.match(frame, /открыть устройство бумажным кодом/, "no way to lift the PIN lock");
  // name, age, liked, hidden, away, pin, then the two of the paper code.
  await type(app, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, ENTER);
  assert.deepEqual(opened, ["reissue"], "enter on the new-code row opened something else");
  app.unmount();
});

// ── B9 · keys that arrive together (depth.liveui.flaky) ──
// Over a slow ssh, typed fast, or sent by a test whose timer came due together
// with React's draw, a key reaches the screen before the previous key's change
// is drawn. It must still act on what the previous key left: the row the arrow
// moved to, the action it enabled, the screen it opened. It did not (probe,
// 26.09.2026: 5/5 wrong with no gap), and the live run under load opened
// "сменить точку" with the cursor drawn on "я". Every screen now takes keys
// through parts.ts useKeys; these tests send the keys in one synchronous burst,
// which is the worst case, and wait for the outcome, not for time.
import { readdirSync, readFileSync } from "node:fs";
import { useState } from "react";
import { Form, KEYS_AHEAD, Menu } from "./parts.ts";

async function until(what: () => boolean, seconds = 20): Promise<boolean> {
  for (let i = 0; i < seconds * 20 && !what(); i++) await new Promise((done) => setTimeout(done, 50));
  return what();
}
const burst = (app: { stdin: { write: (s: string) => void } }, ...keys: string[]) => keys.forEach((k) => app.stdin.write(k));

// One row per component that listens to keys: the burst, and what it must end in.
const CLASS: Array<[string, () => Promise<void>]> = [
  ["Menu: → ⏎ picks the action the arrow moved to", async () => {
    const picked: string[] = [];
    const app = render(h(Menu, {
      actions: [{ key: "a", label: "a" }, { key: "b", label: "b" }, { key: "exit", label: "выход" }],
      onPick: (k: string) => picked.push(k),
    }));
    await settle();
    burst(app, RIGHT, ENTER);
    assert.ok(await until(() => picked.length === 1), "enter was lost");
    burst(app, RIGHT, LEFT, LEFT, ENTER);
    assert.ok(await until(() => picked.length === 2), "the second enter was lost");
    assert.deepEqual(picked, ["b", "a"], "enter acted on the row the cursor was on before the arrow");
    app.unmount();
  }],
  ["Form: ↓ ⏎ from the last field presses the first action, two letters both land", async () => {
    const picked: string[] = [];
    let value = "";
    function Host() {
      const [v, setV] = useState("");
      value = v;
      return h(Form, {
        fields: [{ key: "x", label: "x", value: v }],
        onChange: (_k: string, next: string) => setV(next),
        actions: [{ key: "go", label: "go" }, { key: "exit", label: "выход" }],
        onPick: (k: string) => picked.push(k),
      });
    }
    const app = render(h(Host));
    await settle();
    burst(app, "a", "b", DOWN, ENTER);
    assert.ok(await until(() => picked.length === 1), "enter was lost between the fields and the row");
    assert.equal(value, "ab", "a letter typed in the same read was lost");
    assert.deepEqual(picked, ["go"]);
    app.unmount();
  }],
  ["Me: ↓×6 ⏎ opens the sixth row, not the one before", async () => {
    const client = {
      profile: () => Promise.resolve({ name: "Аня", name_state: "accepted", age: 34 }),
      hidden: () => Promise.resolve([]),
      blocks: () => Promise.resolve([]),
    };
    const opened: string[] = [];
    // deno-lint-ignore no-explicit-any
    const app = render(h(Me, { say, client: client as any, restrictions: 0, onOpen: (r: string) => opened.push(r), onBack: () => {}, onError: () => {} }));
    await until(() => /Аня/.test(app.lastFrame() ?? ""));
    // name, age, liked, hidden, away, pin, then the new paper code.
    burst(app, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, ENTER);
    assert.ok(await until(() => opened.length === 1), "enter was lost");
    assert.deepEqual(opened, ["reissue"]);
    app.unmount();
  }],
  ["Blocked: ↓ ⏎ lifts the block the arrow moved to", async () => {
    const lifted: string[] = [];
    const client = {
      blocks: () => Promise.resolve([{ id: "b1", since: 1 }, { id: "b2", since: 2 }]),
      unblock: (id: string) => { lifted.push(id); return Promise.resolve(); },
    };
    // deno-lint-ignore no-explicit-any
    const app = render(h(Blocked, { say, lang: "ru", client: client as any, onBack: () => {}, onError: () => {} }));
    await until(() => /›/.test(app.lastFrame() ?? ""));
    burst(app, DOWN, ENTER);
    assert.ok(await until(() => lifted.length === 1), "enter was lost");
    assert.deepEqual(lifted, ["b2"], "the block lifted is not the one under the cursor");
    app.unmount();
  }],
  ["StepAway: ↓ ⏎ goes away for the span the arrow chose, not into a greyed button", async () => {
    const went: string[] = [];
    const client = {
      profile: () => Promise.resolve({ phrases: [] }),
      likes: () => Promise.resolve({ items: [], next: null }),
      inbox: () => Promise.resolve([]),
      stepAway: (span: string) => { went.push(span); return Promise.resolve(0); },
    };
    // deno-lint-ignore no-explicit-any
    const app = render(h(StepAway, { say, client: client as any, onGone: () => {}, onBack: () => {}, onError: () => {} }));
    await until(() => /выберите срок/.test(app.lastFrame() ?? ""));
    burst(app, DOWN, ENTER);
    assert.ok(await until(() => went.length === 1), "enter met the button greyed before the span was chosen");
    assert.deepEqual(went, ["short"]);
    app.unmount();
  }],
  ["Feed: →×3 ⏎ asks about blocking, and does not hide", async () => {
    const calls: string[] = [];
    const client = {
      feed: () => Promise.resolve({ items: [{ id: "p1", text: "первая", name: "Ира", age: 30 }] }),
      like: () => { calls.push("like"); return Promise.resolve({ status: 200, body: {} }); },
      hide: () => { calls.push("hide"); return Promise.resolve(); },
      blockByPhrase: () => { calls.push("block"); return Promise.resolve(); },
    };
    const app = render(h(Feed, {
      say,
      // deno-lint-ignore no-explicit-any
      client: client as any,
      place: { lat: 55.75, lon: 37.62, radius: 1000 },
      onWrite: () => {}, onInbox: () => {}, onPoint: () => {}, onMe: () => {}, onError: () => {},
    }));
    await until(() => /первая/.test(app.lastFrame() ?? ""));
    // open, like, hide, block.
    burst(app, RIGHT, RIGHT, RIGHT, ENTER);
    assert.ok(await until(() => /точно заблокировать\?/.test(app.lastFrame() ?? "")), "the burst did not reach block and its question");
    await settle();
    assert.deepEqual(calls, [], "a burst meant for block acted on another action");
    app.unmount();
  }],
];
for (const [name, fn] of CLASS) test(`keys in one read · ${name}`, fn);

test("a key that comes while the screen changes goes to the new screen", async () => {
  const picked: string[] = [];
  function Two() {
    const [second, setSecond] = useState(false);
    return second
      ? h(Menu, { actions: [{ key: "x", label: "x" }, { key: "y", label: "y" }], onPick: (k: string) => picked.push(`second:${k}`) })
      : h(Menu, { actions: [{ key: "go", label: "go" }, { key: "exit", label: "выход" }], onPick: (k: string) => { picked.push(`first:${k}`); setSecond(true); } });
  }
  const app = render(h(Two));
  await settle();
  burst(app, ENTER, RIGHT, ENTER);
  assert.ok(await until(() => picked.length === 2), `a key was lost in the change of screens: ${JSON.stringify(picked)}`);
  assert.deepEqual(picked, ["first:go", "second:y"], "the keys after the change went to the old screen");
  app.unmount();
});

test(`keys ahead of the screen are cut at ${KEYS_AHEAD}, not queued without end`, async () => {
  const picked: string[] = [];
  const actions = Array.from({ length: 60 }, (_, i) => ({ key: String(i), label: String(i) }));
  const app = render(h(Menu, { actions, onPick: (k: string) => picked.push(k) }));
  await settle();
  // One goes at once, KEYS_AHEAD wait; the rest of the burst, enter included, is cut.
  burst(app, ...Array(KEYS_AHEAD + 8).fill(RIGHT), ENTER);
  await until(() => new RegExp(`\\[ ${KEYS_AHEAD + 1} \\]`).test(app.lastFrame() ?? ""), 10);
  await settle();
  assert.deepEqual(picked, [], "an enter past the limit was kept");
  assert.match(app.lastFrame()!, new RegExp(`\\[ ${KEYS_AHEAD + 1} \\]`), "the cursor is not where the kept arrows put it");
  burst(app, ENTER);
  assert.ok(await until(() => picked.length === 1), "the queue did not take keys again once drained");
  assert.deepEqual(picked, [String(KEYS_AHEAD + 1)]);
  app.unmount();
});

test("no screen listens to keys past useKeys", async () => {
  const here = new URL(".", import.meta.url).pathname;
  const offenders = readdirSync(here)
    .filter((f) => f.endsWith(".ts") && !f.includes("test") && f !== "parts.ts")
    .filter((f) => /\buseInput\b/.test(readFileSync(here + f, "utf8")));
  assert.deepEqual(offenders, [], "useInput outside parts.ts meets keys with the last render's handler");
});
// ── the move (§8.2, screen 13; depth/ink/move.ts) ──
// A fake node that answers the five transfer routes as relay/node/src/routes/
// transfer.ts does; the envelopes are the real ones, sealed with the code the
// screen shows, because the check characters come out of them.
import { MoveConfirm, MoveIn, MoveOut } from "./move.ts";
import { checkCharacters, deriveTransferCode, HeldKey, sealClaim } from "../core/transfer.ts";

// Waits for what the screen should come to, not for a number of
// milliseconds: under a loaded machine Argon2id alone takes seconds, and fixed
// pauses turned four green tests red at a load average of 20 (26.09.2026).
// A wait that runs out says so: it used to return quietly, and the assertion
// after it then blamed the screen for what was only a slow machine (d1,
// 26.09.2026).
async function waitFor(what: () => boolean, seconds = 20): Promise<void> {
  if (!(await until(what, seconds))) throw new Error(`waited ${seconds} s and it never came: ${what}`);
}
const shows = (app: { lastFrame: () => string | undefined }, re: RegExp) => () => re.test(app.lastFrame() ?? "");
// What a screen reported through onError: asserted empty at the end of a test,
// because an assert thrown from inside a promise killed the whole runner
// before its summary line (verifier, 26.09.2026).
const errors: string[] = [];
const collect = (m: string) => void errors.push(m);
const noErrors = () => assert.deepEqual(errors.splice(0), [], "a screen reported an error");
const spkiOf = async (key: CryptoKey) => Buffer.from(await crypto.subtle.exportKey("spki", key)).toString("base64url");

async function aDevice(label: string) {
  const sign = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]) as CryptoKeyPair;
  const wrap = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as CryptoKeyPair;
  return { sign_pub: await spkiOf(sign.publicKey), wrap_pub: await spkiOf(wrap.publicKey), label };
}

async function leavingNode(pinOk = true) {
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const node = { state: "waiting", claim: "", asks: 0, approveLost: false, slowMs: 0, inFlight: 0, maxInFlight: 0 };
  const client = {
    identityId: "id-1",
    held: await HeldKey.hold(long.privateKey),
    longSpki: await spkiOf(long.publicKey),
    pinProof: () => Promise.resolve(new Uint8Array(32)),
    seat: () => {},
    firstPin: () => Promise.resolve({ status: 204, body: null }),
    request: (method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body });
      if (path === "/sessions/invite") {
        return Promise.resolve(pinOk
          ? { status: 200, body: { expires_in: 120 } }
          : { status: 409, body: { error: { code: "pin_mismatch", attempts_left: 7 } } });
      }
      if (method === "GET" && node.slowMs > 0) {
        // A slow node: counts how many asks are out at once.
        node.inFlight++;
        node.maxInFlight = Math.max(node.maxInFlight, node.inFlight);
        return new Promise((done) => setTimeout(() => {
          node.inFlight--;
          done({ status: 200, body: { state: node.state } });
        }, node.slowMs));
      }
      if (method === "GET") {
        // The first ask meets the address's allowance: "later", not an end —
        // and a short later, since the screen now keeps quiet for as long as
        // the node says (B27).
        if (++node.asks === 1) return Promise.resolve({ status: 429, body: null, retryAfter: 0.05 });
        return Promise.resolve({ status: 200, body: { state: node.state, ...(node.state === "claimed" ? { claim_envelope: node.claim } : {}) } });
      }
      if (path.endsWith("/approve")) {
        if (node.approveLost) {
          node.state = "approved";
          return Promise.reject(new TypeError("fetch failed"));
        }
        return Promise.resolve({ status: 200, body: { state: "approved", session_id: "s-2" } });
      }
      return Promise.resolve({ status: 204, body: null });
    },
  };
  return { client, calls, node };
}

const shownCode = (frame: string) => frame.match(/([0-9A-Z]{3}) - ([0-9A-Z]{3}) - ([0-9A-Z]{3})/)!.slice(1).join("");

test("the move shows its price before the PIN, then the code, and the confirmation says who, when and the check", async () => {
  const { client, calls, node } = await leavingNode();
  let moved = false;
  const app = render(h(MoveOut, { say, client, onMoved: () => (moved = true), onBack: () => {}, onError: collect, pollMs: 40 }));
  await settle();
  assert.match(app.lastFrame()!, /замрёт/, "the price is not said before the PIN");
  await type(app, ..."123456".split(""), DOWN, ENTER);
  await waitFor(shows(app, /живёт ещё/));
  assert.match(app.lastFrame()!, /живёт ещё \d+ с/, "the code's two minutes are not shown");
  assert.match(app.lastFrame()!, /Никто из поддержки/);
  const keys = await deriveTransferCode(shownCode(app.lastFrame()!));
  assert.equal((calls[0].body as { lookup_id: string }).lookup_id, keys.lookupId, "the shown code is not the one invited");
  const claimant = await aDevice("Chrome, Android");
  node.claim = await sealClaim(keys, claimant);
  node.state = "claimed";
  await waitFor(shows(app, /Устройство просит/));
  const frame = app.lastFrame()!;
  assert.match(frame, /Устройство просит перенести личность/, "the confirmation did not come up");
  assert.match(frame, /назвалось\s+Chrome, Android/);
  assert.match(frame, /когда\s+только что/);
  assert.match(frame, new RegExp(`сверка\\s+${await checkCharacters(claimant)} — совпадает с экраном нового устройства\\?`), "the check is not the claimant's");
  assert.match(frame, /Уедет всё/, "what leaves is not said");
  assert.match(frame, /замрёт/, "what becomes of this device is not said on the confirmation");
  assert.match(frame, /Никто из поддержки/, "the confirmation does not warn about support");
  assert.match(frame, /\[ это я \]/);
  await type(app, ENTER);
  await waitFor(() => moved);
  const approve = calls.find((c) => c.path.endsWith("/approve"));
  assert.ok(approve, "\"it is me\" did not approve");
  assert.equal((approve.body as { sign_pub: string }).sign_pub, claimant.sign_pub, "the node was handed keys other than the claimant's");
  assert.ok(moved, "the screen did not go on to the frozen end");
  app.unmount();
  noErrors();
});

test("\"it does not match\" refuses, and a wrong PIN says how many attempts are left", async () => {
  const { calls } = await leavingNode();
  const confirm = render(h(MoveConfirm, {
    say, label: "\u001B[31mподдержка", check: "7KQ2", seenAt: Date.now() - 42_000,
    // The node has not answered "no" yet; "yes" is answered with a 503.
    onYes: () => { calls.push({ method: "yes", path: "" }); return Promise.reject(new Error("503")); },
    onNo: () => { calls.push({ method: "no", path: "" }); return new Promise(() => {}); },
  }));
  await settle();
  assert.match(confirm.lastFrame()!, /42 с назад/);
  assert.doesNotMatch(confirm.lastFrame()!, /\u001B\[31m/, "the other side's label repainted the screen");
  await type(confirm, RIGHT, ENTER, LEFT, ENTER);
  assert.deepEqual(calls.map((c) => c.method), ["no"], "\"it does not match\" did not refuse, or a second press went through");
  confirm.unmount();
  // A "yes" the node refused gives the buttons back: the person can try again.
  calls.length = 0;
  const again = render(h(MoveConfirm, {
    say, label: "x", check: "7KQ2", seenAt: Date.now(),
    onYes: () => { calls.push({ method: "yes", path: "" }); return Promise.reject(new Error("503")); },
    onNo: () => {},
  }));
  await settle();
  await type(again, ENTER);
  await waitFor(shows(again, /\[ это я \]/));
  await type(again, ENTER);
  await waitFor(() => calls.length === 2, 5);
  assert.deepEqual(calls.map((c) => c.method), ["yes", "yes"], "a refused \"it is me\" left the buttons dead");
  again.unmount();

  const wrong = await leavingNode(false);
  const app = render(h(MoveOut, { say, client: wrong.client, onMoved: () => {}, onBack: () => {}, onError: collect, pollMs: 40 }));
  await settle();
  await type(app, ..."000000".split(""), DOWN, ENTER);
  await waitFor(shows(app, /ПИН не подходит/));
  assert.match(app.lastFrame()!, /ПИН не подходит\. Осталось попыток: 7/);
  assert.doesNotMatch(app.lastFrame()!, / - [0-9A-Z]{3} - /, "a code was shown after a wrong PIN");
  app.unmount();
  noErrors();
});

test("the new device takes the code, shows its own check, and says when the old one refused", async () => {
  let state = "claimed";
  let asks = 0;
  const claims: unknown[] = [];
  const client = {
    identityId: "", held: null, longSpki: "",
    seat: () => {}, firstPin: () => Promise.resolve({ status: 204, body: null }),
    request: (_method: string, path: string, body?: unknown) => {
      if (path === "/sessions/claim") {
        claims.push(body);
        return Promise.resolve(claims.length === 1 ? { status: 404, body: null } : { status: 200, body: { state: "claimed" } });
      }
      // The first ask meets the address's allowance: "later", not an end.
      if (++asks === 1) return Promise.resolve({ status: 429, body: null, retryAfter: 0.05 });
      return Promise.resolve({ status: 200, body: { state } });
    },
  };
  const app = render(h(MoveIn, { say, client, label: "depth, linux", onArrived: () => {}, onBack: () => {}, onError: collect, pollMs: 40 }));
  await settle();
  await type(app, ..."k7q-m3f-2x9".split(""), DOWN, ENTER);
  await waitFor(shows(app, /Код не подошёл/));
  assert.match(app.lastFrame()!, /Код не подошёл или истёк/, "a 404 was not said in the one wording");
  await type(app, ENTER);
  await waitFor(shows(app, /сверка\s+[0-9A-Z]{4}/));
  assert.match(app.lastFrame()!, /сверка\s+[0-9A-HJKMNP-TV-Z]{4}/, "the new device shows no check characters");
  assert.match(app.lastFrame()!, /«это я»/);
  state = "rejected";
  await waitFor(shows(app, /Перенос отменён/));
  assert.match(app.lastFrame()!, /Перенос отменён/, "the refusal was not said on the new device");
  app.unmount();
  noErrors();
});

test("'me' offers the move", async () => {
  const client = {
    profile: () => Promise.resolve({ name: "Аня", name_state: "accepted", age: 34 }),
    hidden: () => Promise.resolve([]),
    blocks: () => Promise.resolve([]),
  };
  const opened: string[] = [];
  // deno-lint-ignore no-explicit-any
  const app = render(h(Me, { say, client: client as any, restrictions: 0, onOpen: (r: string) => opened.push(r), onBack: () => {}, onError: () => {} }));
  await settle();
  await settle();
  // name, age, liked, hidden, away, pin, the two of the paper code, move.
  await type(app, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, ENTER);
  assert.deepEqual(opened, ["move"], "'me' does not open the move");
  app.unmount();
});

// ── B27 · the ends the network can blur (review panel 2026-09-26, F1 F2) ──
test("the old device whose \"it is me\" lost its answer still ends at \"moved\", as the node says", async () => {
  const { client, node } = await leavingNode();
  node.approveLost = true;
  let moved = false;
  const app = render(h(MoveOut, { say, client, onMoved: () => (moved = true), onBack: () => {}, onError: collect, pollMs: 40 }));
  await settle();
  await type(app, ..."123456".split(""), DOWN, ENTER);
  await waitFor(shows(app, /живёт ещё/));
  const keys = await deriveTransferCode(shownCode(app.lastFrame()!));
  node.claim = await sealClaim(keys, await aDevice("Chrome, Android"));
  node.state = "claimed";
  await waitFor(shows(app, /Устройство просит/));
  await type(app, ENTER);
  await waitFor(() => moved);
  assert.ok(moved, "a lost answer to \"it is me\" left the device on the code's screen");
  app.unmount();
  noErrors();
});

test("a slow node is asked one question at a time", async () => {
  const { client, node } = await leavingNode();
  node.asks = 1; // past the first 429
  node.slowMs = 300;
  const app = render(h(MoveOut, { say, client, onMoved: () => {}, onBack: () => {}, onError: collect, pollMs: 20 }));
  await settle();
  await type(app, ..."123456".split(""), DOWN, ENTER);
  await waitFor(shows(app, /живёт ещё/));
  await waitFor(() => node.maxInFlight > 0);
  await new Promise((done) => setTimeout(done, 1000));
  assert.equal(node.maxInFlight, 1, `${node.maxInFlight} asks were out at once`);
  app.unmount();
  noErrors();
});

// ── B28 · an error's words are drawn as anything else from outside is ──
// A screen's error goes up to App's fail, and its words can carry what the
// node or the other device sent (a JSON parser quotes its input, escapes
// included). Drawn raw, an OSC or CSI in them repaints the terminal — the
// very screen that asks the person to trust it (review panel 2026-09-26, F3).
import { App } from "./app.ts";

test("an error carrying escape sequences reaches the screen without them", async () => {
  const client = {
    identityId: "", held: null, longSpki: "", registered: false,
    seat: () => {}, firstPin: () => Promise.resolve({ status: 204, body: null }),
    request: () => Promise.reject(new Error("\u001b]0;pwn\u0007\u001b[2Jboom")),
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(App, { say, client: client as any, start: "moveIn" }));
  await settle();
  await type(app, ..."k7q-m3f-2x9".split(""), DOWN, ENTER);
  await waitFor(shows(app, /Что-то пошло не так/));
  const frame = app.lastFrame()!;
  // plain puts a dot where each sequence was; the test frame strips some
  // escapes by itself, so their absence alone would prove nothing.
  assert.match(frame, /··boom/, "the error was not drawn through plain");
  assert.doesNotMatch(frame, /\u001b\]0;pwn/, "an OSC from an error reached the terminal");
  assert.doesNotMatch(frame, /\u001b\[2J/, "a CSI from an error reached the terminal");
  assert.doesNotMatch(frame, /\u0007/, "a BEL from an error reached the terminal");
  app.unmount();
});

// ── B31 · the PIN leaves the screen once its proof is made (F23) ──
test("the PIN is gone from the move's screen once its proof is made", async () => {
  const wrong = await leavingNode(false);
  const app = render(h(MoveOut, { say, client: wrong.client, onMoved: () => {}, onBack: () => {}, onError: collect, pollMs: 40 }));
  await settle();
  await type(app, ..."000000".split(""), DOWN, ENTER);
  await waitFor(shows(app, /ПИН не подходит/));
  // The refusal asks for the PIN again, with an empty field: the one typed
  // was dropped when its proof went out, not kept for the screen's lifetime.
  assert.doesNotMatch(app.lastFrame()!, /••••••/, "the PIN stayed in the screen after its proof went out");
  app.unmount();
  noErrors();
});

// ── P4 · the lock after five idle minutes, and the closes that end the session ──
import { Lock } from "./screens/lock.ts";
import { Closed } from "./screens/closed.ts";

// A core that is locked and opens on one PIN, counting the other.
function lockedCore(right = "123456") {
  const core = {
    registered: true, canLock: true, locked: true, identityId: "id", held: null, longSpki: "",
    attempts: 10, unlocked: 0, lockCalls: 0,
    lock: () => { core.locked = true; core.lockCalls++; return Promise.resolve({ sealed: true }); },
    unlock: (pin: string) => {
      if (pin === right) { core.locked = false; core.unlocked++; return Promise.resolve({ ok: true }); }
      core.attempts--;
      return Promise.resolve({ ok: false, answer: { status: 409, body: { error: { code: "pin_mismatch", attempts_left: core.attempts } } } });
    },
  };
  return core;
}

test("the lock is one line, a wrong PIN says what is left, the right one opens it", async () => {
  const core = lockedCore();
  let opened = 0;
  // deno-lint-ignore no-explicit-any
  const app = render(h(Lock, { say, client: core as any, onUnlocked: () => opened++, onError: collect }));
  await settle();
  const frame = app.lastFrame()!;
  assert.equal(frame.trim().split("\n").length, 1, `the locked screen is more than one line:\n${frame}`);
  assert.match(frame, /^ПИН › _$/m, "the locked screen is not `ПИН ›`");
  assert.doesNotMatch(frame, /Operator|беседа|новое/i, "the locked screen shows what it must hide");
  await type(app, ..."000000".split(""));
  assert.match(app.lastFrame()!, /••••••/, "typed digits are not shown as dots");
  await type(app, ENTER);
  await waitFor(shows(app, /ПИН не подходит\. Осталось попыток: 9/));
  assert.equal(opened, 0, "a wrong PIN opened the lock");
  assert.doesNotMatch(app.lastFrame()!, /••••••/, "the wrong PIN stayed on the screen");
  await type(app, ..."123456".split(""), ENTER);
  await waitFor(() => opened === 1);
  app.unmount();
  noErrors();
});

test("five idle minutes lock the app to one line, and the PIN brings the screen back", async () => {
  const core = lockedCore();
  core.locked = false;
  // deno-lint-ignore no-explicit-any
  const app = render(h(App, { say, client: core as any, idleMs: 200 }));
  await settle();
  assert.match(app.lastFrame()!, /Operator\./, "the registration screen did not open");
  // A key inside the span holds the lock off; the next 200 ms without one lock.
  await type(app, "А");
  await new Promise((r) => setTimeout(r, 120));
  assert.doesNotMatch(app.lastFrame()!, /ПИН ›/, "locked before the idle span was up");
  await waitFor(shows(app, /^ПИН › _$/m), 3);
  assert.equal(core.lockCalls, 1, "the core was not locked when the screen was");
  assert.doesNotMatch(app.lastFrame()!, /Operator\./, "the screen behind the lock is still drawn");
  await type(app, ..."123456".split(""), ENTER);
  await waitFor(shows(app, /Operator\./), 3);
  assert.equal(core.unlocked, 1);
  app.unmount();
  noErrors();
});

test("4002 and 4004 have their own screens, and neither offers a way back in", async () => {
  let exits = 0;
  const moved = render(h(Closed, { say, code: 4002, onExit: () => exits++ }));
  await settle();
  assert.match(moved.lastFrame()!, /Личность уехала/);
  assert.match(moved.lastFrame()!, /перенесена на другое устройство/);
  assert.match(moved.lastFrame()!, /выход/);
  assert.doesNotMatch(moved.lastFrame()!, /назад|в ленту/, "a session that moved away offers a way back");
  await type(moved, ENTER);
  assert.equal(exits, 1, "exit did not fire");
  moved.unmount();
  const update = render(h(Closed, { say, code: 4004, onExit: () => exits++ }));
  await settle();
  assert.match(update.lastFrame()!, /Нужно обновить depth/);
  assert.match(update.lastFrame()!, /другой версии протокола/);
  update.unmount();
});

test("a room the node closed with 4002 or 4004 hands the code up instead of staying silent", async () => {
  for (const code of [4002, 4004]) {
    const stub = roomThatCloses();
    let handed: number | null = null;
    const client = {
      openConversation: () => Promise.resolve({ safetyCode: "1111 2222" }),
      openRoom: () => Promise.resolve(stub.room),
      read: () => Promise.resolve(""),
      sayInChat: () => Promise.resolve({ status: 202, body: {} }),
    };
    const app = render(h(Chat, {
      // deno-lint-ignore no-explicit-any
      say, client: client as any, chatId: "c1", name: "Аня", age: 27, limit: 128,
      onBack: () => {}, onError: collect, onClosed: (c: number) => (handed = c),
    }));
    await settle();
    stub.close(code);
    await waitFor(() => handed === code, 3);
    assert.doesNotMatch(app.lastFrame()!, /Беседа закончилась/, `${code} was drawn as a tombstone`);
    app.unmount();
  }
  noErrors();
});

// ── P4 return · the lock arms only where a PIN can open it, and arms without a key ──
test("opened and left alone, the app locks after the idle span without any key pressed", async () => {
  const core = lockedCore();
  core.locked = false;
  // deno-lint-ignore no-explicit-any
  const app = render(h(App, { say, client: core as any, idleMs: 200 }));
  await settle();
  assert.match(app.lastFrame()!, /Operator\./);
  await waitFor(shows(app, /^ПИН › _$/m), 3);
  assert.equal(core.lockCalls, 1, "the untouched app did not lock the core");
  app.unmount();
  noErrors();
});

test("raised by the paper code and not yet given a PIN, the device does not lock: there would be nothing to open it with", async () => {
  // A clean device after `depth restore`: a session (registered) and no device
  // salt (canLock false) until the first PIN is set. The screen asks for that
  // PIN, and must keep asking.
  const core = {
    registered: true, canLock: false, locked: false, identityId: "id", held: null, longSpki: "",
    lockCalls: 0,
    lock: () => { core.lockCalls++; return Promise.resolve({ sealed: false }); },
    unlock: () => Promise.reject(new Error("locked without a device salt: there is no PIN to prove")),
    request: () => Promise.resolve({ status: 500, body: null }),
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(App, { say, client: core as any, start: "restore", idleMs: 150 }));
  await settle();
  assert.match(app.lastFrame()!, /Бумажный код/, "the restore screen did not open");
  await new Promise((r) => setTimeout(r, 500));
  assert.doesNotMatch(app.lastFrame()!, /ПИН › _/, "a device with no PIN yet was locked — and could never be opened");
  assert.equal(core.lockCalls, 0, "the core was locked with nothing to open it");
  assert.match(app.lastFrame()!, /Бумажный код/, "the restore screen went away");
  app.unmount();
  noErrors();
});

// ── P6 · the paper code used on this very device: keep the PIN, or a new one under the grant ──
import { RaisedHere } from "./screens/restore.ts";
import { derivePaperCode, newPaperCode, wrapLongKey } from "../core/paper.ts";

// A device that already holds a session, and a node whose claim answers with
// the long key under the code typed: raise() opens it and reports sameDevice.
async function raisedDevice(code: string) {
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const { wrapKey } = await derivePaperCode(code);
  const { wrapped } = await wrapLongKey(long.privateKey, wrapKey);
  const pins: string[] = [];
  const client = {
    registered: true, identityId: "id", held: null, longSpki: "", wrappedLongKey: null,
    request: (_m: string, path: string) =>
      path === "/recovery/claim"
        ? Promise.resolve({ status: 200, body: { identity_id: "id", session_id: "s", recovery_wrapped_key: Buffer.from(wrapped).toString("base64url") } })
        : Promise.resolve({ status: 500, body: null }),
    holdWrappedLongKey: () => {},
    firstPin: (pin: string) => { pins.push(pin); return Promise.resolve({ status: 204, body: null }); },
    limits: () => Promise.resolve({ phrase_length: 128, chat_ciphertext_chars: 2048 }),
  };
  return { client, pins };
}

test("the choice screen offers to keep the PIN or set a new one, and nothing else", async () => {
  let kept = 0, fresh = 0;
  const app = render(h(RaisedHere, { say, onKeep: () => kept++, onNewPin: () => fresh++ }));
  await settle();
  const frame = app.lastFrame()!;
  assert.match(frame, /Устройство открыто/);
  assert.match(frame, /Прежний ПИН действует/);
  assert.match(frame, /ПИН помню — дальше/);
  assert.match(frame, /не помню ПИН — задать новый/);
  await type(app, RIGHT, ENTER);
  assert.deepEqual([kept, fresh], [0, 1], "\"I do not remember\" did not offer a new PIN");
  await type(app, LEFT, ENTER);
  assert.deepEqual([kept, fresh], [1, 1], "\"I remember\" did not go on");
  app.unmount();
});

test("the code used on this device leads to the choice, and a forgotten PIN goes to /vault/init before the new code", async () => {
  const code = newPaperCode();
  const { client, pins } = await raisedDevice(code);
  // deno-lint-ignore no-explicit-any
  const app = render(h(App, { say, client: client as any, start: "restore" }));
  await settle();
  assert.match(app.lastFrame()!, /ПИН останется прежним/, "the intro still promises a new PIN on this device");
  await type(app, code, DOWN, ENTER);
  await waitFor(shows(app, /Устройство открыто/), 10);
  assert.doesNotMatch(app.lastFrame()!, /[0-9A-Z]{4} - [0-9A-Z]{4}/, "the new code was shown before the PIN was asked about");
  await type(app, RIGHT, ENTER);
  await waitFor(shows(app, /Прежний ПИН перестанет работать/));
  assert.equal(pins.length, 0, "a PIN went to the node before one was typed");
  await type(app, ..."424242".split(""), DOWN, ..."424242".split(""), DOWN, ENTER);
  await waitFor(() => pins.length === 1, 5);
  assert.deepEqual(pins, ["424242"], "the new PIN did not reach /vault/init");
  await waitFor(shows(app, /[0-9A-Z]{4} - [0-9A-Z]{4}/), 5);
  app.unmount();
});

test("the PIN kept, the device goes straight on to the new code and asks the node for nothing", async () => {
  const code = newPaperCode();
  const { client, pins } = await raisedDevice(code);
  // deno-lint-ignore no-explicit-any
  const app = render(h(App, { say, client: client as any, start: "restore" }));
  await settle();
  await type(app, code, DOWN, ENTER);
  await waitFor(shows(app, /Устройство открыто/), 10);
  await type(app, ENTER);
  await waitFor(shows(app, /[0-9A-Z]{4} - [0-9A-Z]{4}/), 5);
  assert.equal(pins.length, 0, "keeping the PIN still sent one to the node");
  app.unmount();
});

// ── P6 return · a refusal of the new PIN stays on its screen ──
test("a refused new PIN does not follow the person back to the choice or on to the code", async () => {
  const code = newPaperCode();
  const { client } = await raisedDevice(code);
  client.firstPin = () => Promise.resolve({ status: 409, body: { error: { code: "no_first_pin_grant" } } });
  // deno-lint-ignore no-explicit-any
  const app = render(h(App, { say, client: client as any, start: "restore" }));
  await settle();
  await type(app, code, DOWN, ENTER);
  await waitFor(shows(app, /Устройство открыто/), 10);
  await type(app, RIGHT, ENTER);
  await waitFor(shows(app, /Прежний ПИН перестанет работать/));
  await type(app, ..."424242".split(""), DOWN, ..."424242".split(""), DOWN, ENTER);
  await waitFor(shows(app, /Узел не принял \(409\)/), 5);
  // Back to the choice: the refusal stays behind.
  await type(app, RIGHT, ENTER);
  await waitFor(shows(app, /Устройство открыто/), 5);
  assert.doesNotMatch(app.lastFrame()!, /Узел не принял/, "the refusal followed the person back to the choice");
  // And "I remember the PIN" goes on to the code with nothing about the PIN on it.
  await type(app, ENTER);
  await waitFor(shows(app, /[0-9A-Z]{4} - [0-9A-Z]{4}/), 5);
  assert.doesNotMatch(app.lastFrame()!, /Узел не принял/, "the refusal followed the person on to the new code");
  app.unmount();
});

// ── P9 · the conversation that waits for the second (§8.5): the queue on this device ──
import { Waiting } from "./screens/pending.ts";

// A core whose queue is the real one (depth/core/pending.ts), and whose inbox
// the test moves by hand: first the offer, then either a chat born of it or nothing.
async function waitingCore() {
  const { PendingQueue } = await import("../core/pending.ts");
  const q = new PendingQueue();
  const said: string[] = [];
  const core = {
    rows: [{ kind: "match", id: "m1", match_id: undefined, name: "Аня", age: 27 }] as Array<Record<string, unknown>>,
    dropped: [] as string[],
    queueLine: (m: string, t: string) => q.push(m, t),
    queued: (m: string) => q.peek(m),
    dropQueued: (m: string) => { q.drop(m); core.dropped.push(m); },
    sayInChat: (_c: string, t: string) => { said.push(t); return Promise.resolve({ status: 202, body: {} }); },
    inbox: () => Promise.resolve(core.rows),
    said,
  };
  return core;
}

test("what is typed while the second has not agreed waits on the device, marked, and never reaches the node", async () => {
  const core = await waitingCore();
  // deno-lint-ignore no-explicit-any
  const app = render(h(Waiting, { say, client: core as any, matchId: "m1", name: "Аня", age: 27, limit: 128, onOpened: () => {}, onBack: () => {}, onFeed: () => {}, onError: collect, pollMs: 100_000 }));
  await settle();
  assert.match(app.lastFrame()!, /Аня, 27/);
  assert.match(app.lastFrame()!, /ждём ответа/, "the head does not say the conversation waits");
  assert.match(app.lastFrame()!, /без ✓/, "the screen does not say the lines wait without a tick");
  await type(app, "привет", DOWN, ENTER);
  await settle();
  assert.match(app.lastFrame()!, /привет\s+· ждёт/, "the queued line is not shown as waiting");
  // The line about losing the queue stands under the queue (§8.5 :2133), and says the spec's words.
  const frame = app.lastFrame()!;
  assert.match(frame, /уходят второму в момент его «поговорить»/, "the hint does not carry the spec's words");
  assert.ok(frame.indexOf("привет") < frame.indexOf("без ✓"), "the hint about the queue stands above the queue, not under it");
  assert.deepEqual(core.queued("m1"), ["привет"], "the line did not reach the device's queue");
  assert.deepEqual(core.said, [], "a line went to the node before the second agreed");
  app.unmount();
  noErrors();
});

test("past the ceiling the oldest waiting line goes without a word, and the screen shows what the core holds", async () => {
  const core = await waitingCore();
  const { PENDING_MAX } = await import("../core/pending.ts");
  for (let i = 0; i < PENDING_MAX; i++) core.queueLine("m1", `строка ${i}`);
  // deno-lint-ignore no-explicit-any
  const app = render(h(Waiting, { say, client: core as any, matchId: "m1", name: "Аня", age: 27, limit: 128, onOpened: () => {}, onBack: () => {}, onFeed: () => {}, onError: collect, pollMs: 100_000 }));
  await settle();
  await type(app, "последняя", DOWN, ENTER);
  await settle();
  assert.equal(core.queued("m1").length, PENDING_MAX, "the queue grew past chat.pending.max");
  assert.equal(core.queued("m1")[0], "строка 1", "the oldest line did not leave first");
  // The frame is clipped to the terminal's rows, so "строка 0 is not there"
  // proves nothing by itself: the first waiting line drawn must be the first
  // the core holds — the screen draws the queue, it does not keep one.
  const first = /^\s+(.+?)\s+· ждёт/m.exec(app.lastFrame()!)?.[1];
  assert.equal(first, core.queued("m1")[0], "the screen shows a queue other than the core's");
  assert.notEqual(first, "строка 0", "the evicted line is still on the screen");
  assert.doesNotMatch(app.lastFrame()!, /переполн|too many|full/i, "the ceiling announced itself");
  app.unmount();
  noErrors();
});

test("the second agreed: the waiting screen hands the chat on; the offer gone: a tombstone and the queue dies", async () => {
  const core = await waitingCore();
  core.queueLine("m1", "привет");
  let opened: string | null = null;
  // deno-lint-ignore no-explicit-any
  const app = render(h(Waiting, { say, client: core as any, matchId: "m1", name: "Аня", age: 27, limit: 128, onOpened: (chatId: string) => (opened = chatId), onBack: () => {}, onFeed: () => {}, onError: collect, pollMs: 60 }));
  await settle();
  core.rows = [{ kind: "chat", id: "c9", match_id: "m1", name: "Аня", age: 27 }];
  await waitFor(() => opened === "c9", 3);
  assert.deepEqual(core.queued("m1"), ["привет"], "the queue was dropped before the chat could send it");
  app.unmount();

  const gone = await waitingCore();
  gone.queueLine("m1", "привет");
  let toFeed = 0;
  // deno-lint-ignore no-explicit-any
  const app2 = render(h(Waiting, { say, client: gone as any, matchId: "m1", name: "Аня", age: 27, limit: 128, onOpened: () => {}, onBack: () => {}, onFeed: () => toFeed++, onError: collect, pollMs: 60 }));
  await settle();
  gone.rows = [];
  await waitFor(shows(app2, /предложение ушло/), 3);
  assert.deepEqual(gone.dropped, ["m1"], "the queue did not die with the offer");
  assert.deepEqual(gone.queued("m1"), [], "a line of the dead offer is still held");
  assert.doesNotMatch(app2.lastFrame()!, /привет/, "a line of the dead offer is still on the screen");
  await type(app2, ENTER);
  assert.equal(toFeed, 1, "the tombstone did not lead to the feed");
  app2.unmount();
  noErrors();
});

test("after a restart the node's my_consent keeps the wait: no second consent, straight into waiting", async () => {
  let waited: string | null = null;
  let consents = 0;
  const client = {
    inboxSince: () => Promise.resolve({
      items: [{ kind: "match", id: "m1", name: "Аня", age: 27, phrase: { text: "гуляю", mode: "alone" }, waiting_for_you: false, state: "pending", my_consent: "waiting" }],
      events: { new_matches: 0, waiting_for_you: 0, new_chats: 0, pending_messages: 0, ending_soon: 0 },
    }),
    consent: () => { consents++; return Promise.resolve({ status: 200, body: { state: "waiting" } }); },
  };
  // A fresh process: its own memory knows no consent at all.
  // deno-lint-ignore no-explicit-any
  const app = render(h(Inbox, { say, client: client as any, onOpen: () => {}, onWait: (m: string) => (waited = m), consented: () => false, onBack: () => {}, onError: collect }));
  await settle();
  await settle();
  assert.match(app.lastFrame()!, /мэтч — ждём ответа/, "after a restart the inbox asks for the consent again");
  assert.doesNotMatch(app.lastFrame()!, /не сейчас/, "\"not now\" is offered after one's own consent");
  await type(app, ENTER);
  await waitFor(() => waited === "m1", 3);
  assert.equal(consents, 0, "the consent was sent a second time");
  app.unmount();
  noErrors();
});

test("one's own consent answered \"waiting\" opens the waiting conversation, and the inbox remembers it", async () => {
  let waited: string | null = null;
  const consented = new Set<string>();
  const client = {
    inboxSince: () => Promise.resolve({
      items: [{ kind: "match", id: "m1", name: "Аня", age: 27, phrase: { text: "гуляю", mode: "alone" }, waiting_for_you: false, state: "pending" }],
      events: { new_matches: 0, waiting_for_you: 0, new_chats: 0, pending_messages: 0, ending_soon: 0 },
    }),
    consent: () => Promise.resolve({ status: 200, body: { state: "waiting" } }),
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(Inbox, { say, client: client as any, onOpen: () => {}, onWait: (m: string) => { waited = m; consented.add(m); }, consented: (m: string) => consented.has(m), onBack: () => {}, onError: collect }));
  await settle();
  await settle();
  assert.match(app.lastFrame()!, /мэтч — ждёт твоего согласия/);
  await type(app, ENTER);
  await waitFor(() => waited === "m1", 3);
  // Back in the inbox: the row says we wait, offers "open", and "not now" is gone — one has agreed.
  const again = render(h(Inbox, { say, client: client as any, onOpen: () => {}, onWait: (m: string) => (waited = `again ${m}`), consented: (m: string) => consented.has(m), onBack: () => {}, onError: collect }));
  await settle();
  await settle();
  assert.match(again.lastFrame()!, /мэтч — ждём ответа/, "the inbox forgot the consent given");
  assert.match(again.lastFrame()!, /открыть/);
  assert.doesNotMatch(again.lastFrame()!, /не сейчас/, "\"not now\" is offered after one's own consent");
  await type(again, ENTER);
  await waitFor(() => waited === "again m1", 3);
  app.unmount();
  again.unmount();
  noErrors();
});

test("a chat opened over a queue sends what waited first and shows it as one's own", async () => {
  const flushed: string[] = [];
  const held = ["привет", "ты где?"];
  const client = {
    openConversation: () => Promise.resolve({ safetyCode: "1111 2222" }),
    openRoom: () => Promise.resolve({ next: () => new Promise(() => {}), close: () => {}, closed: new Promise(() => {}) }),
    queued: () => held,
    flushQueued: (c: string, m: string) => { flushed.push(`${c}/${m}`); held.length = 0; return Promise.resolve(null); },
    read: () => Promise.resolve(""),
  };
  const app = render(h(Chat, {
    // deno-lint-ignore no-explicit-any
    say, client: client as any, chatId: "c9", matchId: "m1", name: "Аня", age: 27, limit: 128,
    onBack: () => {}, onError: collect,
  }));
  await waitFor(shows(app, /ты где\?/), 3);
  assert.deepEqual(flushed, ["c9/m1"], "the queue did not go out when the chat opened");
  assert.match(app.lastFrame()!, /привет[\s\S]*ты где\?/, "the waited lines are not on the screen in their order");
  app.unmount();
  noErrors();
});

test("interest in my offer is shown as the spec words it, with my offer as the reason (§8.5)", async () => {
  const client = {
    inboxSince: () => Promise.resolve({
      items: [
        {
          kind: "offer_interest", id: "m7", name: "Борис", age: 31, phrase: { text: "отдам две табуретки", mode: "company" },
          offer: { id: "o1", text: "отдам две табуретки", mode: "company", discount_value: "100%" },
          waiting_for_you: false, state: "pending",
        },
        { kind: "match", id: "m8", name: "Аня", age: 27, phrase: { text: "гуляю", mode: "alone" }, waiting_for_you: false, state: "pending" },
      ],
      events: { new_matches: 0, waiting_for_you: 0, new_chats: 0, pending_messages: 0, ending_soon: 0 },
    }),
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(Inbox, { say, client: client as any, onOpen: () => {}, onWait: () => {}, consented: () => false, onBack: () => {}, onError: collect }));
  await settle();
  await settle();
  const frame = app.lastFrame()!;
  assert.match(frame, /Борис, 31[^\n]*интересуется вашим предложением[^\n]*«отдам две табуретки»/, "the author's row does not say the interest and the offer");
  assert.doesNotMatch(frame, /Борис, 31[^\n]*мэтч — ждёт твоего согласия/, "the offer's interest is worded as an ordinary match");
  assert.match(frame, /Аня, 27[^\n]*мэтч — ждёт твоего согласия/, "an ordinary match lost its wording");
  app.unmount();
  noErrors();
});

test("a like on an offer while one's own name waits shows the §3 line, and the like still counts", async () => {
  const calls: string[] = [];
  const said: string[] = [];
  const client = {
    feed: () => Promise.resolve({ items: [
      { id: "o1", text: "кофе со скидкой", like_count: 1, offer: { discount_value: "−10 %" } },
    ] }),
    like: (id: string) => { calls.push(`like ${id}`); return Promise.resolve({ status: 200, body: { state: "liked", name_pending: true } }); },
  };
  const app = render(h(Feed, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    place: { lat: 55.75, lon: 37.62, radius: 1000 },
    onWrite: () => {}, onInbox: () => {}, onPoint: () => {}, onMe: () => {}, onError: (m: string) => said.push(m),
  }));
  await settle(150);
  // The list's menu: open, like, … — an offer is liked from the list, not by the
  // card's arrow (an offer's like cannot be taken back).
  await type(app, RIGHT, ENTER);
  await settle();
  assert.deepEqual(calls, ["like o1"], "the offer was not liked");
  assert.deepEqual(said, ["Имя не прошло проверку — предложение не отправлено.\nПоправьте имя, и оно уйдёт само, пока оффер жив."], "the §3 wording was not shown for a like that waits on the name");
  app.unmount();
});

import { Complaint } from "./screens/complaint.ts";

test("a complaint about an offer goes only with an e-mail, and says \"sent\" once the node takes it", async () => {
  const sent: Array<[string, string, string | undefined]> = [];
  const client = {
    complain: (offer: string, email: string, text?: string) => {
      sent.push([offer, email, text]);
      return Promise.resolve({ status: 202, body: { id: "c1", counts_towards_autohide: true } });
    },
  };
  // deno-lint-ignore no-explicit-any
  const app = render(h(Complaint, { say, client: client as any, offerId: "o1", onBack: () => {} }));
  await settle();
  assert.match(app.lastFrame()!, /жалоба: скидку не дали/);
  // Without an e-mail "send" stays greyed: down past both fields, enter.
  await type(app, DOWN, DOWN, ENTER);
  await settle();
  assert.equal(sent.length, 0, "a complaint went out without an e-mail");
  await type(app, UP, UP, "ann@example.org", DOWN, "не дали скидку", DOWN, ENTER);
  await waitFor(shows(app, /отправлено/), 3);
  assert.deepEqual(sent, [["o1", "ann@example.org", "не дали скидку"]]);
  app.unmount();
});

// V8 · the complaint is reached from the feed: "complain" on an offer card
// hands its id on; on a neighbour's phrase the action stays greyed.
test("an offer card in the feed leads to the complaint by its id, a phrase does not", async () => {
  const complained: string[] = [];
  const client = {
    feed: () => Promise.resolve({ items: [
      { id: "p1", text: "кто на пробежку", name: "Аня", age: 30, distance_m: 100, minutes_ago: 2 },
      { kind: "offer", id: "o1", text: "кофе за полцены", offer: { discount_value: "-50%" } },
    ] }),
  };
  const app = render(h(Feed, {
    say,
    // deno-lint-ignore no-explicit-any
    client: client as any,
    place: { lat: 55.75, lon: 37.62, radius: 1000 },
    onWrite: () => {}, onInbox: () => {}, onPoint: () => {}, onMe: () => {}, onError: () => {},
    onComplain: (id: string) => complained.push(id),
  }));
  await settle();
  await settle();
  assert.match(app.lastFrame()!, /пожаловаться/, "the row does not offer a complaint");
  // Open, like, hide, block, complain: four to the right.
  await type(app, RIGHT, RIGHT, RIGHT, RIGHT, ENTER);
  assert.deepEqual(complained, [], "a neighbour's phrase was complained about as an offer");
  await type(app, DOWN, ENTER);
  assert.deepEqual(complained, ["o1"], "the offer card did not lead to its complaint");
  app.unmount();
});
