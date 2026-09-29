// W10-MX · a mixed table: Борис sets a dots table from the terminal's feed
// (depth/ink/mixed_table.node-test.ts), Аня finds its card in her feed, sits,
// applies; he starts the game; each makes a move the other sees — the
// terminal's edge taken on the page's board, the page's in the terminal's list.
// Run by MIXED_SPEC=mixed-table scripts/run-web-depth-mixed.sh.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "../fixtures/address.ts";
import { register, sitFromFeed, writePhrase } from "./helpers.ts";

const sync = process.env.MIXED_SYNC ?? "/app/results/mixed-sync";
const run = process.env.MIXED_RUN ?? "";

function signal(step: string, body = ""): void {
  writeFileSync(`${sync}/${step}`, body);
  console.log(`[sync] web → ${step}`);
}

async function waitFor(step: string, seconds = 120): Promise<string> {
  for (let i = 0; i < seconds * 10; i++) {
    if (existsSync(`${sync}/${step}`)) return readFileSync(`${sync}/${step}`, "utf8");
    if (existsSync(`${sync}/depth-failed`)) {
      throw new Error(`the terminal's side failed before "${step}": ${readFileSync(`${sync}/depth-failed`, "utf8")}`);
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`the terminal's side never reached "${step}"`);
}

async function move(page: Page): Promise<string> {
  await expect(page.getByTestId("turn"), "the page never got its turn").toContainText("ваш ход", { timeout: 30000 });
  const edge = page.getByRole("button", { name: /^ребро [hv]:\d+:\d+$/ }).first();
  const label = (await edge.getAttribute("aria-label"))!.replace(/^ребро /, "");
  await edge.click();
  return label;
}

test("a table between the faces: the terminal sets it, the browser sits, and a move each shows on the other", async ({ page }) => {
  test.skip(run === "", "the terminal's side runs only under scripts/run-web-depth-mixed.sh");
  test.setTimeout(420_000);
  try {
    await register(page, { name: "Аня", age: "28" });
    // A table stands in the feed after every third phrase.
    for (const text of ["кто на пляж?", "ищу компанию на ужин", "есть кто в парке?"]) {
      await writePhrase(page, `${text} ${run}`);
    }

    const name = await waitFor("depth-table", 240);
    await page.getByTestId("nav-inbox").click();
    await page.getByTestId("nav-feed").click();
    await expect(page.getByTestId("table-card").filter({ hasText: name })).toContainText("свободно мест: 1", { timeout: 30000 });
    await sitFromFeed(page, name);
    await expect(page.getByTestId("table")).toContainText("Борис");
    await page.getByTestId("line-input").fill("сыграю");
    await page.getByTestId("apply").click();
    signal("web-applied");

    const first = await waitFor("depth-started", 60);
    await expect(page.getByTestId("turn")).not.toContainText("партия ещё не началась", { timeout: 15000 });
    const taken = page.locator("[data-taken]");
    const theirs = async (count: number) => {
      const edge = await waitFor("depth-moved", 90);
      await expect(taken, `the terminal's move ${edge} did not show on the page`).toHaveCount(count, { timeout: 30000 });
    };
    const mine = async (count: number) => {
      const edge = await move(page);
      await expect(taken).toHaveCount(count, { timeout: 15000 });
      signal("web-moved", edge);
      await waitFor("depth-saw-move", 60);
    };
    if (first === "depth") {
      await theirs(1);
      await mine(2);
    } else {
      await mine(1);
      await theirs(2);
    }
    signal("web-done");
  } catch (e) {
    signal("web-failed", (e as Error).message);
    throw e;
  }
});
