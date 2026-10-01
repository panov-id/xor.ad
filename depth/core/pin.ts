// The PIN's proof and the local half (chat spec §8.2):
//
//   material = Argon2id(PIN, device salt, 64 MiB, t=3, p=1) — 64 bytes
//   auth  = material[0..32]   → goes to the node, which keeps sha256(auth)
//   local = material[32..64]  → never leaves the device
//
// 64 MiB and t=3 were measured on 2026-08-28 (docs/depth-client_RU.md §9);
// p=1 and the library were chosen on 2026-09-24 by measurement in both
// runtimes this core runs in: hash-wasm 4.12.0 took ~270 ms in Deno and in
// Node and matched argon2-cffi byte for byte; @noble/hashes matched too but
// took ~2.8 s, twenty times the 144 ms the spec calls unnoticeable, and
// argon2-browser crashed the process in both. The device salt is the
// caller's: it is made once per device and kept with its keys.

import { argon2id } from "hash-wasm";

export const PIN_MEMORY_KIB = 64 * 1024;
export const PIN_ITERATIONS = 3;
export const PIN_PARALLELISM = 1;
const SALT_BYTES = 16;

// An obvious PIN warns and does not lock (chat spec §8.2, decided 2026-08-26):
// one digit six times, a run of the digit line up or down, or a four-digit
// year of birth inside the six. The page's list (web/src/screens/Register.tsx
// easyPin) — kept the same here, so the two faces warn about the same PINs.
export function obviousPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return true;
  const year = Number(pin.slice(1, 5));
  return year >= 1930 && year <= 2020;
}

export function newDeviceSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

export async function derivePin(pin: string, deviceSalt: Uint8Array): Promise<{ auth: Uint8Array; local: Uint8Array }> {
  if (!/^[0-9]{6}$/.test(pin)) throw new Error("the PIN is six digits");
  if (deviceSalt.length !== SALT_BYTES) throw new Error(`the device salt is ${SALT_BYTES} bytes`);
  const material = await argon2id({
    password: new TextEncoder().encode(pin),
    salt: deviceSalt,
    parallelism: PIN_PARALLELISM,
    iterations: PIN_ITERATIONS,
    memorySize: PIN_MEMORY_KIB,
    hashLength: 64,
    outputType: "binary",
  });
  return { auth: material.slice(0, 32), local: material.slice(32, 64) };
}
