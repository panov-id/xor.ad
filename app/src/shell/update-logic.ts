// The pure part of screen 15 (update.ts): no React, read by node:test.

/** Is `there` newer than `here`? Dotted numbers, part by part; anything unreadable is not newer. */
export function newer(there: string, here: string): boolean {
  const parts = (v: string) => (/^\d+(\.\d+)*$/.test(v) ? v.split(".").map(Number) : null);
  const a = parts(there), b = parts(here);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}
