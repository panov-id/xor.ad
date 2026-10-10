import type { FormEvent, ReactNode } from "react";
import { Button } from "./Button.tsx";
import { Field, FieldGroup } from "./Field.tsx";
import type { IconName } from "./Icon.tsx";

// MoveInput (kit_RU.md §3.3, К6): the fields of a move as a FieldGroup of
// Fields, each named by a label of the dictionary; Enter sends; the first
// field takes the focus on Tab. A refusal of the move («так нельзя») is the
// screen's ErrorLine. `extra` is a second action of the same form (a watcher's
// «заявка» beside «сказать»).
export type MoveField = { label: string; value: string; onChange: (value: string) => void; maxLength?: number; testid?: string };

export function MoveInput({ legend, fields, submit, onSubmit, extra }: {
  legend: string;
  fields: readonly MoveField[];
  submit: { label: string; icon: IconName; testid?: string };
  onSubmit: () => void;
  extra?: ReactNode;
}) {
  const send = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={send}>
      <FieldGroup legend={legend}>
        {fields.map((field) => (
          <Field key={field.label} label={field.label} value={field.value} onChange={field.onChange} maxLength={field.maxLength}
            autoComplete="off" data-testid={field.testid} />
        ))}
        <div className="ui-icon-row">
          <Button kind="primary" type="submit" icon={submit.icon} aria-label={submit.label} data-testid={submit.testid} />
          {extra}
        </div>
      </FieldGroup>
    </form>
  );
}
