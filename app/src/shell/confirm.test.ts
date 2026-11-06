// The confirmation screens (archive 8, 56, 92, 93, 123) are one generated body; the three app files draw it with their own handlers.
// Source reading, as the app's other shell tests. The count: 5 archive screens in 3 app files (Unlock, Table, chat-menu).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const gen = read("../nd4/screens/confirm.gen.tsx");

test("confirm: generated from the five archive screens, both looks, every handle a slot, no sample words", () => {
  assert.match(gen, /^\/\/ generated from .*screens 8, 56, 92, 93, 123 /);
  assert.ok(gen.includes("export function ConfirmDanger(") && gen.includes("export function ConfirmPlain("), "a look is gone");
  for (const slot of ["{p.mark}", "{p.title}", "{p.lead}", "{p.price}", "{p.cancelText}", "{p.okText}", "{p.okMark}", "data-testid={p.cancelId}", "data-testid={p.okId}", "onClick={p.onCancel}"])
    assert.ok(gen.includes(slot), `no ${slot}`);
  for (const sample of ["Forget", "Pass this move", "Nikos", "Eleni", "paper code", "End talk"]) assert.ok(!gen.includes(sample), `sample left: ${sample}`);
});

// the callers: file -> [the component, the testids that the crowd and the other tests press]
const callers: Record<string, [string, string[]]> = {
  "../screens/Unlock.tsx": ["ConfirmDanger", ["forget-cancel", "forget-sure"]],
  "../screens/tables/Table.tsx": ["ConfirmPlain", ["sure-cancel", "sure-ok"]],
  "../screens/chat-menu.tsx": ["ConfirmDanger", ["menu-cancel", "-confirm"]],
};
test("confirm: Unlock (8), Table (92, 93) and the chat menu (56, 123) draw it and keep their testids", () => {
  let n = 0;
  for (const [file, [comp, ids]] of Object.entries(callers)) {
    const src = read(file);
    assert.ok(src.includes(`<${comp} `), `${file} lost ${comp}`);
    assert.ok(src.includes('nd4/screens/confirm.gen"'), `${file} does not import the generated body`);
    for (const id of ids) assert.ok(src.includes(id), `${file} lost ${id}`);
    n++;
  }
  assert.equal(n, 3);
  assert.ok(read("../screens/tables/Table.tsx").includes("<ConfirmDanger "), "give up (93) is the danger look");
});
