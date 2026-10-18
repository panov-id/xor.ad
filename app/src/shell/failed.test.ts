// failedLine: the person reads one line of their language, the console gets the error; words a screen said stay.
import assert from "node:assert/strict";
import { test } from "node:test";
import { makeFailedLine, Said } from "./failed.ts";

const words: Record<string, string> = { "app.failed": "Не получилось. Попробуйте ещё раз." };
const say = (key: string) => words[key] ?? key;

test("failedLine: a raw error shows the app.failed line, never its own text, and goes to the console", () => {
  const logged: unknown[] = [];
  const line = makeFailedLine(say, (e) => logged.push(e));
  const raw = new Error('the first PIN was refused: 409 {"error":{"code":"pin_set"}}');
  assert.equal(line(raw), "Не получилось. Попробуйте ещё раз.");
  assert.deepEqual(logged, [raw]);
});

test("failedLine: a thrown non-Error (a string, undefined) is the same line", () => {
  const logged: unknown[] = [];
  const line = makeFailedLine(say, (e) => logged.push(e));
  assert.equal(line("boom"), "Не получилось. Попробуйте ещё раз.");
  assert.equal(line(undefined), "Не получилось. Попробуйте ещё раз.");
  assert.equal(logged.length, 2);
});

test("failedLine: words a screen threw (Said) are shown as they are and not logged", () => {
  const logged: unknown[] = [];
  const line = makeFailedLine(say, (e) => logged.push(e));
  assert.equal(line(new Said("Жалобу не приняли (500).")), "Жалобу не приняли (500).");
  assert.equal(logged.length, 0);
});
