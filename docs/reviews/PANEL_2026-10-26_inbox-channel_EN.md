# Panel 2026-10-26: the chats list's node channel and «your turn»

Subject: db/087_inbox_room.sql, db/088_your_turn.sql, routes/inbox.ts (POST /inbox/ticket), chat/relay.ts (inbox room, inbox_frame), routes/tables.ts (POST /tables/:id/nudge). Lenses: security (fable), correctness and coverage (opus).

## Security (fable)
- No HIGH or MED. Ticket: one use, 30 s, bound to the session, frozen session refused; room key comes from the ticket's identity, never from the client; the nudge frame carries only table and the nudger's seat.
- LOW: the inbox_frame type is sent verbatim. No user text reaches it today; add an allow-list if that changes.
- LOW: one NOTIFY per trigger row; bounded by the chat line limit.
- LOW: no cap on concurrent rooms per session. This was already true before the change.

## Correctness (opus)
1. HIGH, fixed: deleting a match notified nobody, because the cascade removes the participant rows before the AFTER trigger runs. Fix: the row going away notifies its own identity. Test «a match taken away…» was red before the fix and green after it.
2. MED, fixed: `UPDATE matches SET expires_at/chat_id` fired nothing. Added a trigger on matches. The test was shown red with the trigger narrowed.
3. LOW, open: deleting pending_deliveries, a renamed other side, chat_starters and feed deletion fire nothing; the badge stays stale until the next read.
4. LOW, fixed: a nudge to a seat whose person had left spent the table's minute. It is now refused with 409.
5. LOW, open: session frames (name_verdict) reach the inbox room too, so the client must ignore unknown types.
6. Open coverage: frozen 4002 on the inbox room; constraint rejecting inbox+chat; a watcher's nudge 409; the nudge in the table room; poker turn index.
