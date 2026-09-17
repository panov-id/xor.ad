# Agreeing the names of the proposed routes — 2026-09-17

Fifty-six operations of `docs/api/openapi.yaml` with status `proposed`: the names are mine, the behaviour comes from the chat spec and the screens. The route to drawing (protocol §8 item 2) requires agreeing them in one sitting before the first line of code. The **Decision** column is yours: `ok` keeps the name, another name renames; after that the status becomes `spec` and `openapi.yaml`, protocol §4 and the test map are edited. Pair — `ROUTES_2026-09-17_naming_RU.md`.

| № | Tag | Route | What it does | Alternative | Decision |
|---|---|---|---|---|---|
| 1 | identity | `GET /identities/me` | Your own profile | GET /me | |
| 2 | identity | `GET /legal/manifest` | The documents' current revisions | GET /legal | |
| 3 | identity | `GET /statements` | Your own Article 17 statements | GET /me/statements | |
| 4 | identity | `PATCH /identities/me` | Edit the profile | PATCH /me | |
| 5 | identity | `POST /identities` | Create an identity | — | |
| 6 | identity | `POST /identities/close` | Start over — close the identity | POST /identities/me/close · DELETE /identities/me | |
| 7 | identity | `POST /legal/accept` | Record an acceptance | POST /legal/acceptances | |
| 8 | identity | `POST /recovery/claim` | Raise an identity with the paper code | POST /identities/recover | |
| 9 | identity | `POST /recovery/reissue` | Reissue the paper code | POST /recovery/code | |
| 10 | identity | `POST /vault/pin` | Change the PIN | PUT /vault/pin | |
| 11 | identity | `POST /vault/share` | Exchange a PIN proof for the node's share of the vault key | POST /vault/unlock | |
| 12 | identity | `PUT /identities/appearance` | The identity's appearance for this face | PUT /identities/me/appearance | |
| 13 | feed | `DELETE /feed/{id}` | Take down your own phrase | — | |
| 14 | feed | `GET /feed/density` | The density band under the radius handle | GET /feed/around | |
| 15 | chat | `DELETE /chats/{id}` | Close a conversation by hand, for both | POST /chats/{id}/end | |
| 16 | chat | `DELETE /chats/{id}/game` | End the game | — | |
| 17 | chat | `DELETE /feed/{id}/like` | Take a like back until a match | — | |
| 18 | chat | `GET /chats/{id}/game` | The game after a drop | — | |
| 19 | chat | `PATCH /chats/{id}` | Your own span handle | PUT /chats/{id}/span | |
| 20 | chat | `POST /chats/{id}/game` | Propose or change the game | POST /chats/{id}/games | |
| 21 | chat | `POST /chats/{id}/game/answer` | Answer the game offer | POST /chats/{id}/game/reply | |
| 22 | chat | `POST /chats/{id}/game/confirm` | I'm here — for the new game | POST /chats/{id}/game/ready | |
| 23 | chat | `POST /chats/{id}/game/moves` | A move or a pass | POST /chats/{id}/game/move | |
| 24 | chat | `POST /chats/{id}/game/proposals` | Propose: play again, a draw, an undo | — | |
| 25 | chat | `POST /chats/{id}/game/proposals/{pid}` | Answer a proposal | — | |
| 26 | chat | `POST /chats/{id}/game/resign` | Resign | — | |
| 27 | chat | `POST /chats/{id}/game/word` | Set the hangman word | POST /chats/{id}/game/secret | |
| 28 | chat | `POST /chats/{id}/messages` | Send a ciphertext | — | |
| 29 | chat | `POST /chats/{id}/received` | Confirm receipt | POST /chats/{id}/acks | |
| 30 | chat | `POST /feed/{id}/like` | Like a phrase or an offer | PUT /feed/{id}/like | |
| 31 | chat | `POST /matches/{id}/consent` | Consent to talk | POST /matches/{id}/accept | |
| 32 | tables | `DELETE /tables/{id}/seat` | Stand up | POST /tables/{id}/leave | |
| 33 | tables | `GET /tables/{id}` | The table minus what is hidden | — | |
| 34 | tables | `POST /tables` | Set a table | — | |
| 35 | tables | `POST /tables/{id}/confirm` | I'm here — for the new game | POST /tables/{id}/ready | |
| 36 | tables | `POST /tables/{id}/congratulate` | Congratulate a seat | POST /tables/{id}/cheer | |
| 37 | tables | `POST /tables/{id}/kick` | A vote to remove a seat | POST /tables/{id}/votes | |
| 38 | tables | `POST /tables/{id}/lines` | A line, an application, a refusal or a sticker | POST /tables/{id}/say | |
| 39 | tables | `POST /tables/{id}/moves` | A move or a pass | POST /tables/{id}/move | |
| 40 | tables | `POST /tables/{id}/proposals` | Propose: play again, a draw, an undo | — | |
| 41 | tables | `POST /tables/{id}/proposals/{pid}` | Answer a proposal | — | |
| 42 | tables | `POST /tables/{id}/resign` | Resign | — | |
| 43 | tables | `POST /tables/{id}/seat` | Sit down | POST /tables/{id}/seats · POST /tables/{id}/join | |
| 44 | tables | `POST /tables/{id}/ticket` | A one-time ticket for the table's socket | — | |
| 45 | safety | `DELETE /away` | Come back early | DELETE /me/away | |
| 46 | safety | `DELETE /blocks/{id}` | Lift a block | — | |
| 47 | safety | `DELETE /hidden/{id}` | Bring the hidden back | DELETE /hides/{id} | |
| 48 | safety | `GET /blocks` | Your own blocks | — | |
| 49 | safety | `GET /hidden` | The hidden list | GET /hides | |
| 50 | safety | `POST /away` | Step away | POST /me/away | |
| 51 | safety | `POST /blocks` | Block a person | — | |
| 52 | safety | `POST /hidden` | Hide a phrase or a line for yourself | POST /hides | |
| 53 | support | `GET /support` | Your own requests | GET /support/requests | |
| 54 | support | `POST /support` | A support request | POST /support/requests | |
| 55 | support | `POST /support/{no}/seen` | Clear the answer-waiting dot | POST /support/{no}/read | |
| 56 | intake | `POST /report/decision` | The decision on a notice by its receipt code | GET /report/decision?…  (нет: код в теле) | |

**Naming rules I kept:** a plural noun for collections (`/tables`, `/blocks`), a verb only where there is no resource (`/confirm`, `/resign`); `me` is not used because the signature already names the identity; `hidden` as a collection name reads worse than `hides` but matches the table name `hidden_messages` — the one place where I hesitate myself.
