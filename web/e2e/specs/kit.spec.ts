import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

// The kit on the stand's /kit page (web/src/ui/KitPreview.tsx). Every element
// of docs/design/kit_RU.md §3.1–3.2 marked К2а is held to the six fields of §2
// (name, role, keys, focus, target, second channel) and to the common rules:
// aria-invalid + aria-errormessage on an error, aria-disabled (never `disabled`)
// with the reason tied by aria-describedby, aria-busy while pending. The words
// are the Russian dictionary's (the stand's locale is ru-RU).

const REASON = /редакция только что сменилась/;
const TARGET = 44; // --control-h, in px at the default text size

const section = (page: Page, id: string) => page.getByTestId(id);

async function describedText(page: Page, control: Locator): Promise<string> {
  const ids = ((await control.getAttribute("aria-describedby")) ?? "").split(" ").filter(Boolean);
  const texts = await Promise.all(ids.map((id) => page.locator(`[id="${id}"]`).textContent()));
  return texts.join(" ");
}

async function expectDisabledWithReason(page: Page, control: Locator, what: string): Promise<void> {
  await expect(control, `${what}: aria-disabled`).toHaveAttribute("aria-disabled", "true");
  expect(await control.evaluate((el) => el.hasAttribute("disabled")), `${what}: must not carry the disabled attribute`).toBe(false);
  await control.focus();
  await expect(control, `${what}: an unavailable control still takes focus`).toBeFocused();
  expect(await describedText(page, control), `${what}: the reason is tied by aria-describedby`).toMatch(REASON);
}

async function expectError(page: Page, control: Locator, what: string): Promise<void> {
  await expect(control, `${what}: aria-invalid`).toHaveAttribute("aria-invalid", "true");
  const id = await control.getAttribute("aria-errormessage");
  expect(id, `${what}: aria-errormessage names the message`).toBeTruthy();
  const message = page.locator(`[id="${id}"]`);
  await expect(message, `${what}: the error starts with the word`).toHaveText(/^ошибка:/);
  await expect(message, `${what}: the error is announced once`).toHaveAttribute("role", "alert");
}

async function expectTarget(control: Locator, what: string, min = TARGET): Promise<void> {
  const box = await control.boundingBox();
  expect(box, `${what}: has a box`).not.toBeNull();
  expect(box!.height, `${what}: target height ${box!.height} < ${min}`).toBeGreaterThanOrEqual(min - 0.5);
}

const pasteInto = (control: Locator, text: string) =>
  control.evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData("text", value);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);

test("the info balloon opens, takes focus, closes on Esc and on a press outside, and gives focus back", async ({ page }) => {
  await page.goto("/kit");
  const button = page.getByRole("button", { name: "пояснение" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  const balloon = page.getByRole("dialog", { name: "пояснение" });
  await expect(balloon, "the balloon opens on a press").toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(balloon, "focus moves into the balloon").toBeFocused();
  await page.keyboard.press("Escape");
  await expect(balloon, "Esc closes the balloon").toBeHidden();
  await expect(button, "focus is back on the info button after Esc").toBeFocused();
  await button.click();
  await expect(balloon).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(balloon, "a press outside closes the balloon").toBeHidden();
  await expect(button, "focus is back on the info button after a press outside").toBeFocused();
});

test("every icon button is named, and the like bursts on a press", async ({ page }) => {
  await page.goto("/kit");
  const icons = page.getByTestId("icons").getByRole("button");
  await expect(icons).toHaveCount(42);
  for (const b of await icons.all()) await expect(b).toHaveAttribute("aria-label", /\w/);
  await expect(page.getByTestId("icons").locator('[data-icon="chevron"]')).toHaveCount(1);
  await page.getByRole("button", { name: "♥ нравится" }).click();
  await expect(page.getByTestId("kit-burst")).toHaveClass(/ui-burst-on/);
  await expect(page.getByTestId("kit-burst")).toContainText("4");
});

test("LinkButton and Link: role link, Enter follows, underline is the second channel, an external one says so", async ({ page }) => {
  await page.goto("/kit");
  const links = section(page, "kit-links");
  const button = links.getByRole("link", { name: "пояснение" });
  await expect(button, "LinkButton is a link named by its words").toHaveCount(1);
  await expectTarget(button, "LinkButton");
  await button.focus();
  await expect(button, "LinkButton takes focus").toBeFocused();
  await page.keyboard.press("Enter");
  expect(page.url(), "Enter on a link follows it").toContain("#kit-link-target");

  const inline = links.getByTestId("kit-link");
  await expect(inline, "Link has the name of its text").toHaveAccessibleName("пользовательское соглашение");
  expect(await inline.evaluate((el) => getComputedStyle(el).textDecorationLine), "Link is underlined, not only coloured").toContain("underline");

  const external = links.getByTestId("kit-link-external");
  await expect(external, "an external Link names the new tab").toHaveAccessibleName(/пользовательское соглашение \(новая вкладка\)/);
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", /noopener/);
  await expectTarget(external, "a block Link");
});

test("Actions: a group without a name, the primary last, the row wraps", async ({ page }) => {
  await page.goto("/kit");
  const row = section(page, "kit-actions").getByTestId("kit-actions-row");
  await expect(row).toHaveAttribute("role", "group");
  expect(await row.evaluate((el) => el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")), "Actions carries no name").toBe(false);
  const buttons = row.getByRole("button");
  await expect(buttons).toHaveCount(3);
  await expect(buttons.last(), "the primary is the last one").toHaveClass(/ui-primary/);
  await buttons.first().focus();
  await page.keyboard.press("Tab");
  await expect(buttons.nth(1), "Tab walks the row in order").toBeFocused();
});

for (const [kind, expected] of Object.entries({
  text: { type: "text", autocomplete: "nickname", inputmode: null, sample: "Anya" },
  number: { type: "text", autocomplete: "off", inputmode: "numeric", sample: "31" },
  email: { type: "email", autocomplete: "email", inputmode: "email", sample: "a@b.example" },
  decimal: { type: "text", autocomplete: "off", inputmode: "decimal", sample: "55.75" },
  datetime: { type: "datetime-local", autocomplete: "off", inputmode: null, sample: "2026-10-10T10:00" },
  url: { type: "url", autocomplete: "url", inputmode: "url", sample: "https://example.org/" },
})) {
  test(`Field kind ${kind}: named by its label, the kind's keyboard and autocomplete token`, async ({ page }) => {
    await page.goto("/kit");
    const input = section(page, `kit-field-${kind}`).getByLabel("название", { exact: true });
    await expect(input, "the label is the name").toHaveCount(1);
    await expect(input).toHaveAttribute("type", expected.type);
    await expect(input, "autocomplete token (WCAG 1.3.5)").toHaveAttribute("autocomplete", expected.autocomplete);
    if (expected.inputmode) await expect(input).toHaveAttribute("inputmode", expected.inputmode);
    if (kind !== "datetime") await expect(section(page, `kit-field-${kind}`).getByRole("textbox", { name: "название" })).toHaveCount(1);
    await expectTarget(input, `Field ${kind}`);
    await input.fill(expected.sample);
    await expect(input).toHaveValue(expected.sample);
  });
}

test("Field states: hint and counter by describedby, error with the word, disabled with a reason, busy", async ({ page }) => {
  await page.goto("/kit");
  const filled = section(page, "kit-field-filled").getByLabel("название", { exact: true });
  await expect(filled).toHaveValue("Anya");
  expect(await describedText(page, filled), "the hint is the field's description").toMatch(/пусто — значит без ограничений/);

  await expectError(page, section(page, "kit-field-error").getByLabel("название", { exact: true }), "Field error");
  const ring = (field: Locator) => field.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(await ring(section(page, "kit-field-error").getByLabel("название", { exact: true })), "an error rim is thicker than the plain one").not.toBe("none");
  expect(await ring(filled), "a plain field has no extra ring").toBe("none");

  const disabled = section(page, "kit-field-disabled").getByLabel("название", { exact: true });
  await expectDisabledWithReason(page, disabled, "Field disabled");
  await page.keyboard.type("x");
  await expect(disabled, "an unavailable field takes no input").toHaveValue("");

  await expect(section(page, "kit-field-busy").getByLabel("название", { exact: true })).toHaveAttribute("aria-busy", "true");
});

test("FieldGroup: a group named by its legend, Tab enters at the first field", async ({ page }) => {
  await page.goto("/kit");
  const group = section(page, "kit-fieldgroup").getByRole("group", { name: "условия" });
  await expect(group).toHaveCount(1);
  await section(page, "kit-field-busy").getByLabel("название", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(group.getByRole("textbox").first(), "Tab goes to the first field of the group").toBeFocused();
});

test("PinField: one hidden input of six digits, a paste is read whole, Enter sends, the pair shows a mismatch", async ({ page }) => {
  await page.goto("/kit");
  const pin = section(page, "kit-pin");
  const input = pin.getByLabel("ПИН, 6 цифр", { exact: true });
  await expect(input, "the name is the PIN and its length").toHaveCount(1);
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toHaveAttribute("maxlength", "6");
  await expect(input).toHaveAttribute("inputmode", "numeric");
  await expect(input).toHaveAttribute("autocomplete", "one-time-code");
  await expectTarget(input, "PinField");
  await input.pressSequentially("12ab3456789");
  await expect(input, "only digits, at most six").toHaveValue("123456");
  await pasteInto(input, "654 321 99");
  await expect(input, "a paste with separators is read whole (WCAG 3.3.8)").toHaveValue("654321");
  const show = pin.getByRole("button", { name: "показать" }).first();
  await show.click();
  await expect(input, "«показать» reveals the digits").toHaveAttribute("type", "text");
  await expect(pin.getByRole("button", { name: "скрыть" }).first(), "the button turns into «скрыть»").toBeVisible();
  await input.focus();
  await page.keyboard.press("Enter");
  await expect(pin.getByTestId("kit-pin-sent"), "Enter sends the form").toHaveText("654321");
  await expect(input, "after Enter the focus stays in the field").toBeFocused();
  await expectError(page, pin.getByLabel("новый ещё раз", { exact: true }), "PIN pair mismatch");
  await expectDisabledWithReason(page, section(page, "kit-pin-disabled").getByLabel("ПИН, 6 цифр", { exact: true }), "PinField disabled");
});

test("CodeField: a group of boxes named «группа N из M», normalised inside, a paste is laid out, Backspace goes back", async ({ page }) => {
  await page.goto("/kit");
  const code = section(page, "kit-code");
  await expect(code.getByRole("group", { name: "бумажный код" })).toHaveCount(1);
  const boxes = code.getByRole("textbox");
  await expect(boxes).toHaveCount(4);
  for (const n of [1, 2, 3, 4]) await expect(code.getByRole("textbox", { name: `группа ${n} из 4`, exact: true }), `group ${n} is named`).toHaveCount(1);
  await expectTarget(boxes.first(), "CodeField box");
  await boxes.nth(0).pressSequentially("ao1");
  await expect(boxes.nth(0), "case and look-alikes are read inside: o is 0").toHaveValue("A01");
  await boxes.nth(0).pressSequentially("x");
  await expect(boxes.nth(0)).toHaveValue("A01X");
  await expect(boxes.nth(1), "the fourth character moves to the next group").toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(boxes.nth(0), "Backspace in an empty group goes back").toBeFocused();
  await boxes.nth(1).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(boxes.nth(0), "Shift+Tab goes back").toBeFocused();
  await pasteInto(boxes.nth(2), "abcd-efgh jkmn pqrs");
  await expect(boxes.nth(0)).toHaveValue("ABCD");
  await expect(boxes.nth(1)).toHaveValue("EFGH");
  await expect(boxes.nth(2)).toHaveValue("JKMN");
  await expect(boxes.nth(3), "a whole code pasted anywhere is laid over all groups").toHaveValue("PQRS");

  const pair = section(page, "kit-code-pair");
  const shown = pair.getByRole("textbox");
  await expect(shown, "groups=[2,4] shows only the asked groups").toHaveCount(2);
  await expect(pair.getByRole("textbox", { name: "группа 2 из 4", exact: true })).toHaveCount(1);
  await expect(pair.getByRole("textbox", { name: "группа 4 из 4", exact: true })).toHaveCount(1);
  await pasteInto(shown.nth(0), "abcd-efgh-jkmn-pqrs");
  await expect(shown.nth(0), "a whole code pasted into [2,4] puts group 2 here").toHaveValue("EFGH");
  await expect(shown.nth(1), "and group 4 there").toHaveValue("PQRS");

  for (const box of await section(page, "kit-code-error").getByRole("textbox").all()) await expectError(page, box, "CodeField error");
  for (const box of await section(page, "kit-code-disabled").getByRole("textbox").all()) await expectDisabledWithReason(page, box, "CodeField disabled");
});

test("Select: named by its label, arrows choose, options keep their own lang, unavailable keeps focus and value", async ({ page }) => {
  await page.goto("/kit");
  const select = section(page, "kit-select").getByRole("combobox", { name: "тема", exact: true });
  await expect(select).toHaveCount(1);
  await expectTarget(select, "Select");
  const langs = await select.locator("option").evaluateAll((options) => options.map((o) => o.getAttribute("lang")));
  expect(langs.every((lang) => lang && lang.length === 2), `every option has its own lang: ${langs}`).toBe(true);
  await select.focus();
  const before = await select.inputValue();
  await page.keyboard.press("ArrowDown");
  expect(await select.inputValue(), "ArrowDown chooses the next option").not.toBe(before);
  await expectError(page, section(page, "kit-select-error").getByRole("combobox"), "Select error");
  const disabled = section(page, "kit-select-disabled").getByRole("combobox");
  await expectDisabledWithReason(page, disabled, "Select disabled");
  const kept = await disabled.inputValue();
  await page.keyboard.press("ArrowDown");
  expect(await disabled.inputValue(), "an unavailable select keeps its value").toBe(kept);
});

test("Segments: a radiogroup, Tab once, arrows move the choice, the chosen is filled and thicker", async ({ page }) => {
  await page.goto("/kit");
  const seg = section(page, "kit-segments");
  const group = seg.getByRole("radiogroup", { name: "режим", exact: true });
  await expect(group).toHaveCount(1);
  const phrase = group.getByRole("radio", { name: "фраза" });
  const zone = group.getByRole("radio", { name: "зона" });
  await expect(phrase).toHaveAttribute("aria-checked", "true");
  await expect(zone).toHaveAttribute("aria-checked", "false");
  await expectTarget(phrase, "Segments radio");
  await expect(zone, "the others are out of the Tab order").toHaveAttribute("tabindex", "-1");
  const look = (radio: Locator) => radio.evaluate((el) => { const s = getComputedStyle(el); return { fill: s.backgroundColor, rim: s.boxShadow }; });
  const [on, off] = [await look(phrase), await look(zone)];
  expect(on.fill, "the chosen is filled, the other is not").not.toBe(off.fill);
  expect(on.rim, "the chosen rim is thicker (an inset ring on the 1 px border)").not.toBe(off.rim);
  await phrase.focus();
  await page.keyboard.press("Tab");
  expect(await seg.evaluate((el) => el.contains(document.activeElement)), "Tab leaves the group at once").toBe(false);
  await phrase.focus();
  await page.keyboard.press("ArrowRight");
  await expect(zone, "ArrowRight chooses the next").toHaveAttribute("aria-checked", "true");
  await expect(zone, "and moves the focus there").toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(phrase, "the arrows wrap round").toHaveAttribute("aria-checked", "true");

  const disabled = section(page, "kit-segments-disabled").getByRole("radiogroup");
  await expect(disabled, "Segments disabled: aria-disabled on the group").toHaveAttribute("aria-disabled", "true");
  expect(await disabled.evaluate((el) => el.hasAttribute("disabled")), "Segments disabled: no disabled attribute").toBe(false);
  expect(await describedText(page, disabled), "Segments disabled: the reason is tied by aria-describedby").toMatch(REASON);
  await section(page, "kit-segments-disabled").getByRole("radio", { name: "фраза" }).focus();
  await expect(section(page, "kit-segments-disabled").getByRole("radio", { name: "фраза" }), "an unavailable radio still takes focus").toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(section(page, "kit-segments-disabled").getByRole("radio", { name: "фраза" }), "an unavailable group keeps its choice").toHaveAttribute("aria-checked", "true");
});

test("Choice: a radiogroup with ✓ on the chosen, a sample beside the word, its own lang per option", async ({ page }) => {
  await page.goto("/kit");
  const group = section(page, "kit-choice").getByRole("radiogroup", { name: "тема", exact: true });
  const radios = group.getByRole("radio");
  await expect(radios).toHaveCount(4);
  const checked = group.locator('[role="radio"][aria-checked="true"]');
  await expect(checked).toHaveCount(1);
  await expect(checked.locator('[data-icon="check"]'), "✓ marks the chosen").toHaveCount(1);
  await expect(group.locator('[data-icon="check"]'), "and only the chosen").toHaveCount(1);
  await expect(checked.locator(".ui-sample"), "a sample stands beside the word").toHaveCount(1);
  expect(await checked.getAttribute("lang"), "the option carries its own lang").toMatch(/^[a-z]{2}$/);
  await expectTarget(checked, "Choice radio");
  const before = await checked.getAttribute("lang");
  await checked.focus();
  await page.keyboard.press("ArrowDown");
  await expect(group.locator('[role="radio"][aria-checked="true"]'), "arrows move the choice").not.toHaveAttribute("lang", before!);
  await expect(group.locator('[data-icon="check"]'), "the ✓ follows the choice").toHaveCount(1);
});

test("RangePair: two sliders «от» and «до», valuetext in words, the open edge, «от» above «до» is an error", async ({ page }) => {
  await page.goto("/kit");
  const range = section(page, "kit-range");
  const from = range.getByRole("slider", { name: "от", exact: true });
  const to = range.getByRole("slider", { name: "до", exact: true });
  await expect(from).toHaveCount(1);
  await expect(to).toHaveCount(1);
  await expectTarget(from, "RangePair «от»");
  await expect(from, "the low edge is the open one").toHaveAttribute("aria-valuetext", "без ограничения");
  await expect(to, "so is the high edge").toHaveAttribute("aria-valuetext", "без ограничения");
  await from.focus();
  await page.keyboard.press("ArrowRight");
  await expect(from, "an arrow steps and the value is said in words").toHaveAttribute("aria-valuetext", /^от 19 /);
  await expect(range.locator(".ui-range-value").first(), "the value stands beside the slider").toContainText("19");
  await to.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(to).toHaveAttribute("aria-valuetext", /^до 98 /);

  const wrong = section(page, "kit-range-wrong");
  for (const slider of await wrong.getByRole("slider").all()) await expectError(page, slider, "RangePair order");
  const disabled = section(page, "kit-range-disabled").getByRole("slider", { name: "от", exact: true });
  await expectDisabledWithReason(page, disabled, "RangePair disabled");
  await page.keyboard.press("ArrowRight");
  await expect(disabled, "an unavailable slider does not move").toHaveAttribute("aria-valuetext", /^от 30 /);
});

test("Textarea: named by its label, a counter of what is left in words, error and unavailable states", async ({ page }) => {
  await page.goto("/kit");
  const area = section(page, "kit-textarea").getByRole("textbox", { name: "условия", exact: true });
  await expect(area).toHaveCount(1);
  await expectTarget(area, "Textarea");
  expect(await describedText(page, area)).toContain("осталось: 20");
  await area.fill("abc");
  expect(await describedText(page, area), "the counter follows the text").toContain("осталось: 17");
  await expectError(page, section(page, "kit-textarea-error").getByRole("textbox"), "Textarea error");
  const disabled = section(page, "kit-textarea-disabled").getByRole("textbox");
  await expectDisabledWithReason(page, disabled, "Textarea disabled");
  await page.keyboard.type("x");
  await expect(disabled).toHaveValue("");
});

test("Checkbox: native, Space toggles, ✓ in the box, the whole label is 44, links in the label stay links", async ({ page }) => {
  await page.goto("/kit");
  const box = section(page, "kit-checkbox");
  const check = box.getByRole("checkbox", { name: /принимаю/ });
  await expect(check).toHaveCount(1);
  await expect(check).not.toBeChecked();
  await expect(box.locator('[data-icon="check"]'), "no ✓ while unchecked").toBeHidden();
  await expectTarget(box.locator("label"), "Checkbox label");
  const square = await check.boundingBox();
  expect(square!.width, "the square is 24 wide").toBeGreaterThanOrEqual(23.5);
  await check.focus();
  await page.keyboard.press("Space");
  await expect(check, "Space toggles").toBeChecked();
  await expect(box.locator('[data-icon="check"]'), "✓ is drawn when checked").toBeVisible();
  await expect(box.getByRole("link", { name: "пользовательское соглашение" }), "the link in the label is a link").toHaveCount(1);
  await expectError(page, section(page, "kit-checkbox-error").getByRole("checkbox"), "Checkbox error");
  const disabled = section(page, "kit-checkbox-disabled").getByRole("checkbox");
  await expectDisabledWithReason(page, disabled, "Checkbox disabled");
  await page.keyboard.press("Space");
  await expect(disabled, "an unavailable checkbox does not toggle").not.toBeChecked();
  await expect(section(page, "kit-checkbox-on").getByRole("checkbox")).toBeChecked();
});

test("Disclosure: the native details, Enter and Space open and close it, the chevron turns", async ({ page }) => {
  await page.goto("/kit");
  const summaries = section(page, "kit-disclosure").locator("summary");
  const closed = summaries.first();
  await expect(closed, "the name is the summary's text").toHaveText("схема, не карта");
  await expectTarget(closed, "Disclosure summary");
  const open = () => closed.evaluate((el) => (el.parentElement as HTMLDetailsElement).open);
  const turn = (summary: Locator) => summary.locator(".ui-chevron").evaluate((el) => getComputedStyle(el).transform);
  expect(await open()).toBe(false);
  expect(await turn(closed), "closed: the chevron points right").toBe("none");
  await closed.focus();
  await page.keyboard.press("Enter");
  expect(await open(), "Enter opens").toBe(true);
  expect(await turn(closed), "open: the chevron is turned down").not.toBe("none");
  await page.keyboard.press("Space");
  expect(await open(), "Space closes").toBe(false);
  expect(await turn(summaries.nth(1)), "the open one is turned from the start").not.toBe("none");
});

test("MessageInput: a labelled textbox and a named send, Enter sends, focus stays, empty is an outline, not disabled", async ({ page }) => {
  await page.goto("/kit");
  const message = section(page, "kit-message");
  const field = message.getByRole("textbox", { name: "реплика", exact: true });
  const send = message.getByRole("button", { name: "отправить", exact: true });
  await expect(field).toHaveCount(1);
  await expect(send, "the send button is named").toHaveCount(1);
  await expectTarget(field, "MessageInput");
  expect(await send.evaluate((el) => el.hasAttribute("disabled")), "empty send is not disabled").toBe(false);
  await expect(send, "empty: the outline, not the filled one").not.toHaveClass(/ui-send-on/);
  await send.click();
  await expect(message.getByTestId("kit-message-sent").locator("li"), "an empty press sends nothing").toHaveCount(0);
  await field.fill("hello");
  await expect(send, "with text the send is filled").toHaveClass(/ui-send-on/);
  await page.keyboard.press("Enter");
  await expect(message.getByTestId("kit-message-sent").locator("li"), "Enter sends").toHaveText(["hello"]);
  await expect(field, "the field is emptied").toHaveValue("");
  await expect(field, "and keeps the focus").toBeFocused();
  await field.fill("again");
  await send.click();
  await expect(message.getByTestId("kit-message-sent").locator("li")).toHaveCount(2);
  await expect(field, "a press on the button gives the focus back to the field").toBeFocused();

  const disabled = section(page, "kit-message-disabled").getByRole("textbox", { name: "реплика" });
  await expectDisabledWithReason(page, disabled, "MessageInput disabled");
  await expect(section(page, "kit-message-disabled").getByRole("button", { name: "отправить" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.type("x");
  await expect(disabled).toHaveValue("");
  await expect(section(page, "kit-message-busy").getByRole("textbox", { name: "реплика" })).toHaveAttribute("aria-busy", "true");
});

// The page is built for one brand at a time (VITE_BRAND; BRAND here), so the
// two brands are two runs of scripts/run-web-tests.sh.
test("axe on /kit, reduced motion: no violation of wcag2a, wcag2aa, wcag21aa, wcag22aa", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/kit");
  await expect(page.getByTestId("kit-message")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const lines = results.violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`);
  expect(lines, `axe on /kit, brand ${process.env.BRAND ?? "?"}`).toEqual([]);
});
