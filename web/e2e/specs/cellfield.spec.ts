// CellField (kit_RU.md §9.2 «поле кода»; ui/CellField.tsx): the code on the
// arrival screen is one real input with a name, and the cells under it are a
// picture of what it holds — aria-hidden, so a screen reader meets one field,
// not nine. Under neighbro the nine characters of a pasted code show in nine
// cells; under sosed there are no cells to see and the field is a field.

import { expect, test } from "../fixtures/address.ts";

test("the arrival code is one named input, its cells are hidden from the reader and show a pasted code under neighbro", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("arrive").click();
  await expect(page.locator('[data-screen="arrival"]')).toBeVisible();

  const field = page.getByRole("textbox", { name: "Код" });
  await expect(field).toHaveCount(1);
  await expect(field).toHaveAttribute("data-testid", "arrive-code");
  const cellfield = page.locator(".ui-cellfield");
  await expect(cellfield.locator("input")).toHaveCount(1);
  await expect(cellfield.locator(".ui-cells")).toHaveAttribute("aria-hidden", "true");
  await expect(cellfield.locator(".ui-cell")).toHaveCount(9);

  await field.fill("k7q-m3f-2x9");
  await expect(field).toHaveValue("k7q-m3f-2x9");
  const brand = await page.locator("html").getAttribute("data-brand");
  if (brand === "neighbro") {
    await expect(cellfield.locator(".ui-cells")).toBeVisible();
    await expect(cellfield.locator(".ui-cell")).toHaveText(["K", "7", "Q", "M", "3", "F", "2", "X", "9"]);
  } else {
    await expect(cellfield.locator(".ui-cells")).toBeHidden();
  }
});
