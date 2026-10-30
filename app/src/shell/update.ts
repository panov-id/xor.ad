// A new build on the server (docs/newdesign4 screen 15 `update`): the build writes /version.json (vite.config.ts
// xor-version), the page asks for it every ten minutes and when it comes back into view; a version newer than its own
// shows screen 15. «Later» keeps quiet about that version for this tab; «Update» reloads. The comparison is update-logic.ts.
import { useEffect, useState } from "react";
import { newer } from "./update-logic";

export const UPDATE_POLL_MS = 10 * 60 * 1000;

/** The server's version when it is newer than `own` and not put off, else null. */
export function useNewVersion(own: string): { version: string | null; later: () => void } {
  const [version, setVersion] = useState<string | null>(null);
  const [off, setOff] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const ask = () => {
      if (document.hidden) return;
      fetch("/version.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
        .then((o: { version?: unknown } | null) => { if (live && typeof o?.version === "string" && newer(o.version, own)) setVersion(o.version); })
        .catch(() => {});
    };
    const t = setInterval(ask, UPDATE_POLL_MS);
    document.addEventListener("visibilitychange", ask);
    ask();
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", ask); };
  }, [own]);
  return { version: version && version !== off ? version : null, later: () => setOff(version) };
}
