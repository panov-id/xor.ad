// "Me"'s state (step 4 of the brand split): the profile read again after an
// edit, and the sizes of the hidden and blocked lists. Moved verbatim from
// screens/Me.tsx.

import { useEffect, useState } from "react";
import type { Client } from "../../../../depth/core/client.ts";
import { blockList, hiddenList } from "../../api/lists.ts";

export function useMe({ client, refresh }: { client: Client; refresh: number }) {
  const [profile, setProfile] = useState<{ name: string; pending?: string; age: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    client.profile()
      .then((p) => setProfile({ name: p.name, pending: p.name_pending, age: p.age }))
      .catch((e: Error) => setError(e.message));
  }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  // The two lists' sizes, as the terminal's "me" shows them (depth/ink
  // rooms.ts): "скрытое · n", and "Заблокировано: n" only while there is
  // something to lift (Q-48).
  const [hidden, setHidden] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(0);
  useEffect(() => {
    hiddenList(client).then((r) => setHidden(r.length)).catch(() => setHidden(null));
    blockList(client).then((r) => setBlocked(r.length)).catch(() => setBlocked(0));
  }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  return { profile, error, hidden, blocked };
}

export type MeLogic = ReturnType<typeof useMe>;
