// The screens are made of the kit (kit_RU.md §4): kit.ts is the one file in
// depth/ink that draws. A screen that calls h(Box) or h(Text) itself is back to
// its own layout, its own colours and its own idea of focus — which is what the
// kit was written to end.
//
// The tree is read as text, so this runs under Deno with the core's tests and
// needs neither React nor a node.
import { assertEquals } from "jsr:@std/assert@1";

const INK = new URL(".", import.meta.url);

// Every screen file: depth/ink and its subfolders, minus the kit itself, the
// tests and the tools that are not screens.
export function screenFiles(dir: URL = INK): string[] {
  const found: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) {
      if (entry.name !== "locales") found.push(...screenFiles(url));
    } else if (entry.name.endsWith(".ts") && entry.name !== "kit.ts" && !/test\.ts$/.test(entry.name)) {
      found.push(url.pathname);
    }
  }
  return found.sort();
}

// A call that draws: h(Box, …) or h(Text, …), whether it stands on one line or
// the component's name is on the next (`h(\n  Box,`). Comments are cut first, so
// a sentence that names h(Box) in prose is not a call.
export function drawingCalls(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return [...code.matchAll(/\bh\(\s*(Box|Text)\s*,/g)].map((m) => m[0].replace(/\s+/g, " "));
}

Deno.test("screen outside kit.ts does not call h(Box)/h(Text)", () => {
  const files = screenFiles();
  // A scan that found nothing would pass for the wrong reason.
  if (files.length < 10) throw new Error(`only ${files.length} screen files found — the scan lost the tree`);
  const offenders: Record<string, string[]> = {};
  for (const file of files) {
    const calls = drawingCalls(Deno.readTextFileSync(file));
    if (calls.length > 0) offenders[file.slice(INK.pathname.length)] = calls;
  }
  assertEquals(
    offenders,
    {},
    "these screens draw with h(Box)/h(Text) instead of a kit.ts element (Stack, Row, Txt, Muted, Notice, Item, …)",
  );
});

Deno.test("the scan sees both spellings of a call, and not prose", () => {
  assertEquals(drawingCalls('x(h(Box, { a: 1 }))').length, 1);
  assertEquals(drawingCalls("h(\n  Text,\n  null)").length, 1);
  assertEquals(drawingCalls("// h(Box, …) is what the kit hides").length, 0);
  assertEquals(drawingCalls("h(Stack, null)").length, 0);
});
