// A complaint about an offer (O1d; offers spec §10.2): the discount was not
// given. The e-mail is required — it is the only way anyone answers; the text
// is optional, up to 1000. Once the node takes it the screen says "sent" and
// nothing more: whether it counts towards hiding the offer is not the
// person's to see.
import { createElement as h, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Say } from "../strings.ts";
import type { Client } from "../../core/client.ts";
import { Form, Head, Menu } from "../parts.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Complaint(
  { say, client, offerId, onBack }: { say: Say; client: Pick<Client, "complain">; offerId: string; onBack: () => void },
): ReactElement {
  const [email, setEmail] = useState("");
  const [text, setText] = useState("");
  const [state, setState] = useState<"edit" | "sending" | "sent">("edit");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Head, { title: say("complaint.title") }),
      h(Text, { color: "green" }, say("complaint.sent")),
      h(Menu, { actions: [{ key: "back", label: say("common.back") }], onPick: onBack }),
    );
  }
  const ready = EMAIL.test(email.trim()) && state === "edit";
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("complaint.title"), lines: [say("complaint.private")] }),
    h(Form, {
      fields: [
        { key: "email", label: say("complaint.email"), value: email },
        { key: "text", label: say("complaint.text"), value: text },
      ],
      onChange: (key, value) => (key === "email" ? setEmail(value) : setText(value.slice(0, 1000))),
      actions: [
        { key: "send", label: say("complaint.send"), disabled: !ready },
        { key: "back", label: say("common.back") },
      ],
      onPick: (key) => {
        if (key === "back") return onBack();
        if (!ready) return;
        setState("sending");
        setError(null);
        client.complain(offerId, email.trim(), text.trim() || undefined)
          .then((answer) => {
            if (answer.status >= 200 && answer.status < 300) return setState("sent");
            const code = (answer.body as { error?: { code?: string } } | null)?.error?.code ?? String(answer.status);
            setError(`${say("complaint.refused")}: ${code}`);
            setState("edit");
          })
          .catch((e: Error) => { setError(e.message); setState("edit"); });
      },
    }),
    error ? h(Text, { color: "red" }, error) : null,
  );
}
