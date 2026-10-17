// One origin, two builds: serves the app's build or the web's build from the same port, switched by
// GET /__mode/<web|app>, so a browser profile (IndexedDB is per origin) can make an identity with one face and open
// it with the other (scripts/measure-app.sh "interop"). Static files, SPA fallback to index.html; inside the
// measure's internal docker network only.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const roots = { web: process.env.WEB_DIST ?? "/out/web-dist", app: process.env.APP_DIST ?? "/out/dist" };
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
let mode = "app";

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://x");
  if (pathname.startsWith("/__mode/")) {
    const want = pathname.slice(8);
    if (want in roots) mode = want;
    res.writeHead(200, { "content-type": "text/plain" }).end(mode);
    return;
  }
  const root = roots[mode];
  let file = join(root, normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
  try { if (!(await stat(file)).isFile()) throw new Error("not a file"); } catch { file = join(root, "index.html"); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(4175, "0.0.0.0");
