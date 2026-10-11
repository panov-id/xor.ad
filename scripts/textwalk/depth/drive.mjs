// One person's walk of the terminal (K10, 11.10.2026): depth/ink/main.ts under a pty
// (script(1)), DEPTH_PLAIN=1, keys played from a list of steps. The capture is the raw
// stream; read it with read.py.
//   node drive.mjs <steps.json> <capture>
// A step: {wait: s} pause first · {mark: "label"} a marker line in the capture ·
// {keys: "text<down><enter>…", after: s} keys typed one by one, then a pause ·
// {code: true} types groups 2 and 4 of the paper code last shown on the screen, and
// keeps the whole code in <capture>.code · {fullCode: "<path>"} waits for that file
// (another person's walk) and types the whole code from it — the restore walk.
// The first step may be {args: "restore"}: the terminal is started as `depth restore`.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [stepsPath, outPath] = process.argv.slice(2);
const steps = JSON.parse(readFileSync(stepsPath, "utf8"));
const args = steps[0]?.args ? ` ${steps[0].args}` : "";
const child = spawn("script", ["-q", "-c", `stty cols 100 rows 40; node --experimental-transform-types ink/main.ts${args}`, "/dev/null"],
  { stdio: ["pipe", "pipe", "pipe"], env: process.env });
let capture = "";
child.stdout.on("data", (d) => { capture += d.toString("utf8"); });
child.stderr.on("data", (d) => { capture += d.toString("utf8"); });

const sleep = (s) => new Promise((done) => setTimeout(done, s * 1000));
const NAMED = { "<down>": "\x1b[B", "<up>": "\x1b[A", "<right>": "\x1b[C", "<left>": "\x1b[D", "<enter>": "\r", "<esc>": "\x1b", "<tab>": "\t", "<bs>": "\x7f" };
const KEY = /\x1b\[[A-D]|[\s\S]/gu;
async function press(text) {
  // One key at a time: a person types slower than the screen redraws.
  for (const k of text.replace(/<\w+>/g, (n) => NAMED[n] ?? n).match(KEY) ?? []) {
    child.stdin.write(k);
    // 80 ms lost keys of the second PIN field on a loaded machine (two walks and a test run).
    await sleep(0.15);
  }
}

for (const step of steps) {
  if (step.wait) await sleep(step.wait);
  if (step.mark) capture += `\n@@@ ${step.mark}\n`;
  if (step.keys !== undefined) {
    await press(step.keys);
    await sleep(step.after ?? 0.6);
  }
  if (step.code) {
    const shown = [...capture.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").matchAll(/([A-Z0-9]{4}) - ([A-Z0-9]{4}) - ([A-Z0-9]{4}) - ([A-Z0-9]{4})/g)].at(-1);
    if (!shown) { capture += "\n@@@ NO PAPER CODE ON THE SCREEN\n"; continue; }
    writeFileSync(`${outPath}.code`, shown.slice(1, 5).join(""));
    await press(`${shown[2]}<down>${shown[4]}`);
    await sleep(0.4);
  }
  if (step.fullCode) {
    for (let i = 0; i < 600 && !existsSync(step.fullCode); i++) await sleep(1);
    if (!existsSync(step.fullCode)) { capture += "\n@@@ NO CODE FILE FROM THE OTHER WALK\n"; continue; }
    await press(readFileSync(step.fullCode, "utf8").trim());
    await sleep(0.6);
  }
}
await sleep(2);
child.stdin.write("\x03");
await sleep(1);
child.kill("SIGKILL");
writeFileSync(outPath, capture);
process.exit(0);
