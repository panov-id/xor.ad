// A seal on the disk that does not open (V2): the node hands its share for the
// right PIN, the long key's seal is spoiled, and WebCrypto's OperationError
// has no words of its own. The PIN screen must still say what happened and
// show the way back — the paper code.

import { expect, test } from "../fixtures/address.ts";
import { PIN, register, unlock } from "./helpers.ts";

test("a spoiled seal on the disk: the PIN screen says the way in is closed and leads to the paper code", async ({ page }) => {
  await register(page);
  // Flip the last byte of the long key's seal: AES-GCM's tag no longer holds.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("xor-vault", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const store = open.result.transaction("identity", "readwrite").objectStore("identity");
      const get = store.get("me");
      get.onsuccess = () => {
        const record = get.result;
        const spoiled = new Uint8Array(record.sealedLong);
        spoiled[spoiled.length - 1] ^= 0xff;
        record.sealedLong = spoiled;
        const put = store.put(record);
        put.onsuccess = () => resolve();
        put.onerror = () => reject(put.error);
      };
    };
  }));
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await unlock(page, PIN);
  await expect(page.getByTestId("error")).toHaveText("Вход закрыт до бумажного кода.", { timeout: 30000 });
  await page.getByTestId("unlock-restore").click();
  await expect(page.locator('[data-screen="restore"]')).toBeVisible();
});
