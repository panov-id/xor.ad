# Agreeing the names of the proposed routes — 2026-09-17

Fifty-six operations of `docs/api/openapi.yaml` with status `proposed`: the names are mine, the behaviour comes from the chat spec and the screens. The route to drawing (protocol §8 item 2) requires agreeing them in one sitting before the first line of code. The **Decision** column is yours: `ok` keeps the name, another name renames; after that the status becomes `spec` and `openapi.yaml`, protocol §4 and the test map are edited. Pair — `ROUTES_2026-09-17_naming_RU.md`.

| № | Tag | Route | What it does | Alternative | Decision |
|---|---|---|---|---|---|
| 1 | identity | `GET /identities/me` | Your own profile | GET /me | ok |
| 2 | identity | `GET /legal/manifest` | The documents' current revisions | GET /legal | ok |
| 3 | identity | `GET /statements` | Your own Article 17 statements | GET /me/statements | ok |
| 4 | identity | `PATCH /identities/me` | Edit the profile | PATCH /me | ok |
| 5 | identity | `POST /identities` | Create an identity | — | ok |
| 6 | identity | `POST /identities/close` | Start over — close the identity | POST /identities/me/close · DELETE /identities/me | ok |
| 7 | identity | `POST /legal/accept` | Record an acceptance | POST /legal/acceptances | ok |
| 8 | identity | `POST /recovery/claim` | Raise an identity with the paper code | POST /identities/recover | ok |
| 9 | identity | `POST /recovery/reissue` | Reissue the paper code | POST /recovery/code | ok |
| 10 | identity | `POST /vault/pin` | Change the PIN | PUT /vault/pin | ok |
| 11 | identity | `POST /vault/share` | Exchange a PIN proof for the node's share of the vault key | POST /vault/unlock | ok |
| 12 | identity | `PUT /identities/appearance` | The identity's appearance for this face | PUT /identities/me/appearance | ok |
| 13 | feed | `DELETE /feed/{id}` | Take down your own phrase | — | ok |
| 14 | feed | `GET /feed/density` | The density band under the radius handle | GET /feed/around | ok |
| 15 | chat | `DELETE /chats/{id}` | Close a conversation by hand, for both | POST /chats/{id}/end | ok |
| 16 | chat | `DELETE /chats/{id}/game` | End the game | — | ok |
| 17 | chat | `DELETE /feed/{id}/like` | Take a like back until a match | — | ok |
| 18 | chat | `GET /chats/{id}/game` | The game after a drop | — | ok |
| 19 | chat | `PATCH /chats/{id}` | Your own span handle | PUT /chats/{id}/span | ok |
| 20 | chat | `POST /chats/{id}/game` | Propose or change the game | POST /chats/{id}/games | ok |
| 21 | chat | `POST /chats/{id}/game/answer` | Answer the game offer | POST /chats/{id}/game/reply | ok |
| 22 | chat | `POST /chats/{id}/game/confirm` | I'm here — for the new game | POST /chats/{id}/game/ready | ok |
| 23 | chat | `POST /chats/{id}/game/moves` | A move or a pass | POST /chats/{id}/game/move | ok |
| 24 | chat | `POST /chats/{id}/game/proposals` | Propose: play again, a draw, an undo | — | ok |
| 25 | chat | `POST /chats/{id}/game/proposals/{pid}` | Answer a proposal | — | ok |
| 26 | chat | `POST /chats/{id}/game/resign` | Resign | — | ok |
| 27 | chat | `POST /chats/{id}/game/word` | Set the hangman word | POST /chats/{id}/game/secret | ok |
| 28 | chat | `POST /chats/{id}/messages` | Send a ciphertext | — | ok |
| 29 | chat | `POST /chats/{id}/received` | Confirm receipt | POST /chats/{id}/acks | ok |
| 30 | chat | `POST /feed/{id}/like` | Like a phrase or an offer | PUT /feed/{id}/like | ok |
| 31 | chat | `POST /matches/{id}/consent` | Consent to talk | POST /matches/{id}/accept | ok |
| 32 | tables | `DELETE /tables/{id}/seat` | Stand up | POST /tables/{id}/leave | ok |
| 33 | tables | `GET /tables/{id}` | The table minus what is hidden | — | ok |
| 34 | tables | `POST /tables` | Set a table | — | ok |
| 35 | tables | `POST /tables/{id}/confirm` | I'm here — for the new game | POST /tables/{id}/ready | ok |
| 36 | tables | `POST /tables/{id}/congratulate` | Congratulate a seat | POST /tables/{id}/cheer | ok |
| 37 | tables | `POST /tables/{id}/kick` | A vote to remove a seat | POST /tables/{id}/votes | ok |
| 38 | tables | `POST /tables/{id}/lines` | A line, an application, a refusal or a sticker | POST /tables/{id}/say | ok |
| 39 | tables | `POST /tables/{id}/moves` | A move or a pass | POST /tables/{id}/move | ok |
| 40 | tables | `POST /tables/{id}/proposals` | Propose: play again, a draw, an undo | — | ok |
| 41 | tables | `POST /tables/{id}/proposals/{pid}` | Answer a proposal | — | ok |
| 42 | tables | `POST /tables/{id}/resign` | Resign | — | ok |
| 43 | tables | `POST /tables/{id}/seat` | Sit down | POST /tables/{id}/seats · POST /tables/{id}/join | ok |
| 44 | tables | `POST /tables/{id}/ticket` | A one-time ticket for the table's socket | — | ok |
| 45 | safety | `DELETE /away` | Come back early | DELETE /me/away | ok |
| 46 | safety | `DELETE /blocks/{id}` | Lift a block | — | ok |
| 47 | safety | `DELETE /hidden/{id}` | Bring the hidden back | DELETE /hides/{id} | ok |
| 48 | safety | `GET /blocks` | Your own blocks | — | ok |
| 49 | safety | `GET /hidden` | The hidden list | GET /hides | ok |
| 50 | safety | `POST /away` | Step away | POST /me/away | ok |
| 51 | safety | `POST /blocks` | Block a person | — | ok |
| 52 | safety | `POST /hidden` | Hide a phrase or a line for yourself | POST /hides | ok |
| 53 | support | `GET /support` | Your own requests | GET /support/requests | ok |
| 54 | support | `POST /support` | A support request | POST /support/requests | ok |
| 55 | support | `POST /support/{no}/seen` | Clear the answer-waiting dot | POST /support/{no}/read | ok |
| 56 | intake | `POST /report/decision` | The decision on a notice by its receipt code | GET /report/decision?…  (нет: код в теле) | ok |

**Naming rules I kept:** a plural noun for collections (`/tables`, `/blocks`), a verb only where there is no resource (`/confirm`, `/resign`); `me` is not used because the signature already names the identity; `hidden` as a collection name reads worse than `hides` but matches the table name `hidden_messages` — the one place where I hesitate myself.

**Outcome 2026-09-17:** all 56 agreed by the owner as they are, interactively by six groups; the status in `openapi.yaml` is now `spec`.

**A fifty-seventh — 2026-09-20, and not by taste.** `POST /recovery/confirm` was added by quorum of two review lenses while step 1 was being built: the column `identities.signup_completed_at` was promised by the canon on 2026-09-10 with nothing to fill it — every other call of registration happens before the paper code is shown — and `identities.recovery_wrapped_key` was written by no operation at all, so `POST /recovery/claim` had nothing to return. The name follows this document's own rule: a verb where there is no resource. The owner did not agree it: the list of 56 stopped being complete, and that is written here rather than left to be noticed.
