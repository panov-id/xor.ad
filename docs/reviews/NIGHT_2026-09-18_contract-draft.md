# Ночь 18.09.2026 · Черновик правок канона и контракта под сборку

Продолжение `NIGHT_2026-09-18_api-build-plan.md` §3: шестнадцать мест, где канон
(`docs/chat_RU.md`), протокол (`docs/protocol_RU.md`) и контракт (`docs/api/openapi.yaml`)
недоговаривают до кода. Здесь — не решения, а **протокол правок**: для каждого места оба
конца с `файл:строка` по текущему дереву, что стоит сейчас, готовый текст правки, цена и
кто решает. Ничего не правлено; всё, что помечено «решение», ждёт слова владельца, всё,
что помечено «правка», применяется пачкой из §17 по одному «го».

```diff
+ 16 мест разобраны, к ним три найденных по дороге (§0.2): якоря протокола в плане сдвинуты, у мотивировок адресат уже есть, table_likes нет в реестре
! 9 закрываются правкой без развилки; 7 ждут решения владельца; главные развилки — время (unix против date-time), формат подписи и ключа, второй шаг регистрации
@@ замер: Intl.Segmenter в образе denoland/deno:alpine-2.1.4 считает семейный эмодзи одной графемой (3.12)
```

Пометки: **ПРОВЕРЕНО** — строка прочитана на текущем дереве или замер сделан командой;
**НЕ ПРОВЕРЕНО** — вывод по чтению, без прогона.

---

## 0. Что сверено до разбора

### 0.1. Якоря плана против текущего дерева

**ПРОВЕРЕНО** `sed -n` по каждому адресу, 18.09.2026, ветка `day54`, дерево чистое.

| Файл | Якоря плана | Состояние |
|---|---|---|
| `docs/chat_RU.md` | все 30 адресов §3 плана (323, 417, 776–779, 820, 953, 1015, 1031, 1038, 1071–1086, 1145, 1214–1218, 1229, 1441, 1511–1516, 1530, 1665–1693, 1994–1995, 2027) | **верны** |
| `docs/api/openapi.yaml` | 75–80, 198, 210–215, 274, 287–291, 306, 316, 400, 413, 418, 434–438, 456, 493, 498, 522, 544–547, 587, 1068–1398 | верны, **кроме** `blocks[].since` и `Away.until`: план назвал `:707,776`, на дереве это `:1868` и `:1947` |
| `docs/protocol_RU.md` | 89, 96–102, 134, 153, 169, 176, 190–196, 220, 246, 256, 261, 365, 407, 434–435 | **сдвинуты все**: файл 403 строки, план ссылается за его конец. Реальные: время `:31`; подпись `:38–44`; сокет `:130–137`; манифест `:95`; карточка ленты `:109`; оффер односторонний `:118`; билет стола `:203`; «один на стол» `:162`; `GET /statements` `:188`; `GET /tables/:id` `:192`; счётчики в памяти `:307`; курсор `:349`; 50 промахов `:289`, `:376` |
| `docs/test-map_RU.md` | 177, 216 | верны (`8.6` `:177`, `10.3` `:216`); EN-пара `:176`, `:215` |

Ниже адреса протокола даны уже исправленные.

### 0.2. Три находки, которых в плане нет

1. **Адресат мотивировки уже есть.** План §3.11 говорит «в `dsa_statements` связи с `identities`
   нет». **ПРОВЕРЕНО** `relay/node/db/005_dsa_notices.sql:73`: `recipient_identity text NOT NULL`,
   индекс `dsa_statements_recipient (recipient_identity, created_at)` `:90–91`; заполняет её
   оператор телом решения — `relay/node/src/routes/dsa.ts:258–260`, `:289–295`. Новая колонка
   не нужна; нужно назвать, **что** в ней лежит (§11 ниже).
2. **`table_likes` объявлена каноном и не внесена в реестр.** **ПРОВЕРЕНО** `docs/chat_RU.md:1901`
   `CREATE TABLE table_likes`; `grep -c table_likes docs/facts/schema.tsv` → 0; в каноне 26
   `CREATE TABLE`, в реестре 25 таблиц чата + 4 офферов = 29 (`open.tsv:141` тоже говорит 29).
   Любая правка §4 ниже меняет этот счёт, поэтому сначала внести `table_likes`, иначе
   `product.tables.unmigrated` разойдётся на два числа сразу. **НЕ ПРОВЕРЕНО**, краснеют ли
   на этом `check-facts-schema.sh` — ему нужен поднятый стенд.
3. **«Во втором шаге два запроса»** (`protocol_RU.md:99`) — ни один из двух не назван ни в
   §4.1, ни в контракте: ручки, которой регистрация отдаёт `auth_hash`/долю и
   `lookup_id`/`wrapped_key`, нет. **ПРОВЕРЕНО** `grep -n "enroll\|два запроса"` по трём
   документам — только строка 99. Это развилка, она вынесена в §2.

---

## 1. Подпись, ключ, хэш тела · 3.1

**Где.** `protocol_RU.md:38–44` (§2, «подпись, base64url», «ECDSA, namedCurve P-256, hash SHA-256»);
`chat_RU.md:950–956` (та же врезка); `openapi.yaml:75–80` (`identitySignature`);
`chat_RU.md:1015–1016` (`sessions.sign_public_key text`, `wrap_public_key text`);
`chat_RU.md:2000` (`match_participants.ephemeral_public_key text`); `chat_RU.md:778`
(`identity_public_key text`). **ПРОВЕРЕНО.**

**Что сейчас.** Названы кривая и хэш; не названы: кодировка подписи (WebCrypto `sign` отдаёт
сырые `r‖s` 64 байта, не DER), сериализация публичных ключей в `text`, кодировка `sha256 тела`
и что подписывается у запроса без тела, тип `x-identity-time`.

**Решение владельца — три пункта, у каждого варианты.**

*1a. Подпись.*

| Вариант | Последствие | Цена |
|---|---|---|
| **raw `r‖s`, 64 байта, base64url без набивки** (рекомендую) | ровно то, что даёт `crypto.subtle.sign` в браузере и в Deno; ни одной строки преобразования на обеих сторонах | 0 строк кода сверх протокола |
| DER (ASN.1 `SEQUENCE{r,s}`) | совместимость с `openssl`-инструментами; клиенту и узлу нужен кодек DER, WebCrypto его не даёт | ~40 строк кодека в ядре клиента и в узле, тест-вектор |

*1b. Публичные ключи (`sign_public_key`, `wrap_public_key`, `identity_public_key`, `ephemeral_public_key`).*

| Вариант | Последствие | Цена |
|---|---|---|
| **SPKI DER, base64url без набивки** (рекомендую) | один формат для ECDSA P-256, ECDH P-256, Ed25519 и X25519; `importKey("spki")` замерен на трёх движках (`chat_RU.md:975` «import spki ✓») | 0; ~122 символа на ключ P-256 |
| JWK как строка JSON | самоописуем (`kty`, `crv`); длиннее, в `text` лежит JSON, который надо валидировать отдельно | ~150 символов; проверка формы JWK на узле |
| raw точка 65 байт | самый короткий (88 символов), но у Ed25519/X25519 «raw» — другие 32 байта: два формата вместо одного | второй кодек |

*1c. Хэш тела и время.*

| Вариант | Последствие | Цена |
|---|---|---|
| **hex нижним регистром; у запроса без тела — sha256 пустой строки `e3b0c442…b855`** (рекомендую) | одинаково у `GET` и `DELETE`, ничего не ветвится; сравнение строк | 0 |
| base64url | короче на 21 символ; строка подписи и так не ходит по сети | 0 |
| пустая строка при пустом теле | ветка «есть тело / нет тела» на обеих сторонах — место для расхождения | +1 условие ×2 |

`x-identity-time` — целое число unix-секунд, оно же четвёртой строкой подписи (одно с §7 ниже).

**Предлагаемый текст.**

`protocol_RU.md:44` — после строки `алгоритм        ECDSA, namedCurve P-256, hash SHA-256` внутри той же врезки:

```
подпись         raw r‖s, 64 байта, base64url без набивки — как отдаёт crypto.subtle.sign (18.09.2026)
ключи           публичные ключи всюду — SPKI DER, base64url без набивки (18.09.2026)
sha256 тела     hex нижним регистром; без тела — sha256 пустой строки (18.09.2026)
```

`chat_RU.md:953–954` — те же три строки в той же врезке §8.2 (врезки одинаковы, **ПРОВЕРЕНО** diff `chat_RU.md:950–955` против `protocol_RU.md:39–43`).

`openapi.yaml:79–80` — заменить обе строки описания:

```yaml
      description: 'Request signature (protocol §2): ECDSA P-256 with SHA-256 over "<method>\n<path>\n<sha256 of body, hex>\n<unix seconds>"; the signature is raw r‖s (64 bytes), base64url without padding; a request without a body signs the sha256 of the empty string; with x-identity-session and x-identity-time, a ±5 minute window (2026-09-18).'
      x-description-ru: 'Подпись запроса (протокол §2): ECDSA P-256 с SHA-256 над "<метод>\n<путь>\n<sha256 тела, hex>\n<unix-секунды>"; подпись — raw r‖s (64 байта), base64url без набивки; запрос без тела подписывает sha256 пустой строки; вместе с x-identity-session и x-identity-time, окно ±5 минут (18.09.2026).'
```

`chat_RU.md:1015–1016` — комментарии колонок:

```sql
  sign_public_key text NOT NULL,       -- подпись запросов; своя у каждого устройства; SPKI DER base64url (18.09.2026)
  wrap_public_key text NOT NULL,       -- ей заворачиваются ключи чатов (§8.13); SPKI DER base64url (18.09.2026)
```

**Цена.** RU: 3 + 3 + 2 строки; EN ×2 (`protocol_EN.md:44`, `chat_EN.md` та же врезка и DDL). Итого ~16 строк.

---

## 2. Тела и параметры, которых в контракте нет · 3.2

**Где.** **ПРОВЕРЕНО** обходом `openapi.yaml` скриптом: без `requestBody` среди `spec` —
`POST /identities` `:1069`, `PUT /identities/appearance` `:1149`, `POST /recovery/claim` `:1178`,
`POST /legal/accept` `:1202`, `POST /feed` `:1217`, `POST /matches/{id}/consent` `:1321`,
`PATCH /chats/{id}` `:1398`. Без параметров: `GET /feed` `:1232` (только `after`),
`GET /feed/density` `:1278`. Без схемы 200-ответа: `POST /identities`, `POST /vault/share` `:1083`,
`POST /sessions/invite` `:1099`, `POST /sessions/claim` `:1164`, `POST /recovery/claim`,
`GET /legal/manifest` `:1189`, `POST /chats/{id}/ticket` `:1352`, `GET /feed/density`,
`GET /inbox` `:1370` (`Page` с `items: object`). Второй конец — канон: `chat_RU.md:774–790`
(identities), `:1012–1018` (sessions), `:1069–1080` (перенос), `:1193–1198` (auth),
`:1330–1332` (бумажный код), `:1435–1447` (feed_messages), `:1665–1693` (запрос ленты),
`:1760–1761` (ступени плотности), `:2024–2027` (consent с `ephemeral_public_key`),
`:2118` (`idle_ttl_minutes IN (10, 30, 60, 260)`), `:815–822` (legal_acceptances).

**Что сейчас.** `check-openapi.sh` зелёный: он сверяет наличие операций, а не тел
(**ПРОВЕРЕНО** `scripts/check-openapi.sh:12–19`). Клиент `depth` и узел строились бы по догадке.

**Развилка сначала — второй шаг регистрации (решение владельца).** От неё зависит тело `POST /identities`.

| Вариант | Последствие | Цена |
|---|---|---|
| **A. `POST /identities` несёт всё одним телом**: имя, возраст, три ключа, `auth_hash`, `recovery: {lookup_id, wrapped_key}`; узел рождает долю и отдаёт её в ответе | один запрос, «два запроса» в `protocol_RU.md:99` [retired]; `confirmed_at` ставится сразу — «незавершённой» личности (§4) не бывает, `prune_unfinished_signups` и `signup.unfinished.ttl` [retired] | −1 пункт реестра, −1 задача; но экран 2 обязан держать всё до конца второго шага локально |
| B. Два новых маршрута `POST /vault/enroll {auth_hash}` → `{share}` и `POST /recovery/enroll {lookup_id, wrapped_key}` → 204, второй ставит `confirmed_at` | буквально «два запроса» `:99`; список 56 утверждённых маршрутов (`ROUTES_2026-09-17`) растёт до 58 | +2 операции в yaml (~40 строк), +2 строки §4.1, +2 ручки в коде шага 1 |
| C. Как B, но через уже утверждённые `POST /vault/pin` без `current_auth` и `POST /recovery/reissue` без текущего кода | без новых имён; «смена без старого» — особый режим у ручек, которые в §8.2 обязаны требовать старое | две ветки в двух ручках безопасности — отвергнуть |

Ниже тела даны для **A** (одно тело); при B из `IdentityCreate` уходят `auth_hash` и `recovery`, а ответ теряет `share`.

**Предлагаемый текст — `openapi.yaml`, `components.schemas` (вставить после `SessionsClaim`, `:230`):**

```yaml
    IdentityCreate:
      type: object
      description: "Registration in one body (chat canon §8.2; decided 2026-09-18). Keys are SPKI DER base64url; auth_hash and recovery are the two halves of §8.2 the device derives itself."
      x-description-ru: "Регистрация одним телом (канон чата §8.2; решено 18.09.2026). Ключи — SPKI DER base64url; auth_hash и recovery — две половины §8.2, которые устройство считает само."
      required: [name, age, identity_public_key, sign_public_key, wrap_public_key, auth_hash, recovery]
      properties:
        name: {type: string, description: "Up to 24 graphemes counted by the node (name.length).", x-description-ru: "До 24 графем считает узел (name.length)."}
        age: {type: integer, minimum: 13}
        identity_public_key: {type: string, description: "Ed25519, SPKI DER base64url (§8.13).", x-description-ru: "Ed25519, SPKI DER base64url (§8.13)."}
        sign_public_key: {type: string, description: "ECDSA P-256 of this device (protocol §2).", x-description-ru: "ECDSA P-256 этого устройства (протокол §2)."}
        wrap_public_key: {type: string, description: "ECDH P-256 of this device; chat keys are wrapped to it (§8.13).", x-description-ru: "ECDH P-256 этого устройства; им заворачиваются ключи чатов (§8.13)."}
        label: {type: string, maxLength: 64, description: "How the device names itself, e.g. Chrome, Android.", x-description-ru: "Как устройство себя назвало, например Chrome, Android."}
        auth_hash: {type: string, pattern: '^[0-9a-f]{64}$', description: "sha256 hex of auth (§8.2); the node stores it in vault_shares.auth_hash.", x-description-ru: "sha256 hex от auth (§8.2); узел кладёт его в vault_shares.auth_hash."}
        recovery:
          type: object
          required: [lookup_id, wrapped_key]
          properties:
            lookup_id: {type: string, description: "material[0..32] of the paper code, base64url (§8.2).", x-description-ru: "material[0..32] бумажного кода, base64url (§8.2)."}
            wrapped_key: {type: string, description: "The long key under material[32..64], base64url; the node never opens it.", x-description-ru: "Долгий ключ под material[32..64], base64url; узел его не открывает."}
        appearance: {$ref: "#/components/schemas/Appearance"}
    IdentityCreated:
      type: object
      required: [identity_id, session_id, share]
      properties:
        identity_id: {type: string, format: uuid}
        session_id: {type: string, format: uuid, description: "Goes into x-identity-session.", x-description-ru: "Идёт в x-identity-session."}
        share: {type: string, description: "The node's 32-byte share of the vault key, base64url; handed out once here and later by POST /vault/share.", x-description-ru: "Доля узла ключа хранилища, 32 байта, base64url; выдаётся здесь один раз и потом через POST /vault/share."}
    Appearance:
      type: object
      description: "One row per face (identity_appearance); every field optional, null clears it."
      x-description-ru: "Строка на лицо (identity_appearance); каждое поле необязательно, null стирает."
      properties:
        theme: {type: string, enum: [light, dark, system]}
        contrast: {type: string, enum: [normal, raised, max]}
        accent: {type: string, enum: [terra, amber, gold, crimson, teal, azure, violet]}
    VaultShareResult:
      type: object
      required: [share]
      properties:
        share: {type: string, description: "32 bytes, base64url.", x-description-ru: "32 байта, base64url."}
    SessionsInviteResult:
      type: object
      required: [expires_at]
      properties:
        expires_at: {type: integer, description: "Unix seconds; now + invite.lifetime.", x-description-ru: "Unix-секунды; now + invite.lifetime."}
    SessionsClaimResult:
      type: object
      description: "The old device answers after the person presses this is me; until then the new device polls and gets state pending."
      x-description-ru: "Прежнее устройство отвечает после нажатия «это я»; до этого новое опрашивает и получает state pending."
      required: [state]
      properties:
        state: {type: string, enum: [pending, transferred, cancelled]}
        reply_secret: {type: string, description: "Only with state transferred: the envelope with the long key, base64url.", x-description-ru: "Только при state transferred: конверт с долгим ключом, base64url."}
        session_id: {type: string, format: uuid, description: "Only with state transferred.", x-description-ru: "Только при state transferred."}
    RecoveryClaim:
      type: object
      required: [lookup_id, sign_public_key, wrap_public_key]
      properties:
        lookup_id: {type: string, description: "material[0..32] of the paper code, base64url (§8.2).", x-description-ru: "material[0..32] бумажного кода, base64url (§8.2)."}
        sign_public_key: {type: string}
        wrap_public_key: {type: string}
        label: {type: string, maxLength: 64}
    RecoveryClaimResult:
      type: object
      required: [identity_id, session_id, wrapped_key, next_code]
      properties:
        identity_id: {type: string, format: uuid}
        session_id: {type: string, format: uuid}
        wrapped_key: {type: string, description: "The long key under material[32..64]; the device unwraps it.", x-description-ru: "Долгий ключ под material[32..64]; разворачивает устройство."}
        next_code: {type: string, description: "The new paper code, shown exactly once (test 5.4). Born on the node here because the device has no long key yet.", x-description-ru: "Новый бумажный код, показывается ровно один раз (тест 5.4). Здесь его рождает узел: у устройства ещё нет долгого ключа."}
    LegalManifest:
      type: object
      required: [documents]
      properties:
        documents:
          type: array
          items:
            type: object
            required: [document, revision_date, revision_sha256, reaccept]
            properties:
              document: {type: string, enum: [terms, privacy, guidelines]}
              revision_date: {type: string, format: date}
              revision_sha256: {type: string, pattern: '^[0-9a-f]{64}$'}
              reaccept: {type: string, enum: [required]}
    LegalAccept:
      type: object
      required: [documents]
      properties:
        documents:
          type: array
          minItems: 1
          items:
            type: object
            required: [document, revision_date, revision_sha256]
            properties:
              document: {type: string, enum: [terms, privacy, guidelines]}
              revision_date: {type: string, format: date}
              revision_sha256: {type: string, pattern: '^[0-9a-f]{64}$'}
    FeedCreate:
      type: object
      description: "A phrase or an offer (feed_messages); the language is detected by the node."
      x-description-ru: "Фраза или оффер (feed_messages); язык определяет узел."
      required: [text, mode, lat, lon, area_radius]
      properties:
        text: {type: string, description: "Up to 128 graphemes counted by the node (phrase.length).", x-description-ru: "До 128 графем считает узел (phrase.length)."}
        mode: {type: string, enum: [alone, company, party]}
        lat: {type: number}
        lon: {type: number}
        area_radius: {type: integer, enum: [100, 300, 1000, 3000, 10000]}
        discount_value: {type: string, description: "Offers only; absent on a plain phrase.", x-description-ru: "Только у оффера; у обычной фразы отсутствует."}
        conditions: {type: string, description: "Offers only.", x-description-ru: "Только у оффера."}
    FeedCreated:
      type: object
      required: [id]
      properties:
        id: {type: string, format: uuid}
    Density:
      type: object
      required: [band]
      properties:
        band: {type: string, enum: [nobody, few, ten_or_so, dozens, hundreds], description: "0, 1–4, 5–14, 15–99, 100+ live phrases (chat canon §8.3).", x-description-ru: "0, 1–4, 5–14, 15–99, 100+ живых фраз (канон чата §8.3)."}
    Consent:
      type: object
      required: [ephemeral_public_key]
      properties:
        ephemeral_public_key: {type: string, description: "ECDH P-256 for this chat, SPKI DER base64url, signed by the long key (§8.13).", x-description-ru: "ECDH P-256 на этот чат, SPKI DER base64url, подписан долгим ключом (§8.13)."}
        signature: {type: string, description: "Ed25519 over the ephemeral key by the identity's long key, base64url.", x-description-ru: "Ed25519 над эфемерным ключом долгим ключом личности, base64url."}
    ConsentResult:
      type: object
      required: [state]
      properties:
        state: {type: string, enum: [waiting, opened]}
        chat_id: {type: string, format: uuid, description: "Only with state opened.", x-description-ru: "Только при state opened."}
    Ticket:
      type: object
      required: [ticket, expires_at]
      properties:
        ticket: {type: string, description: "Opaque, base64url; goes into Sec-WebSocket-Protocol as ticket.<value> (protocol §4.4).", x-description-ru: "Непрозрачный, base64url; идёт в Sec-WebSocket-Protocol как ticket.<значение> (протокол §4.4)."}
        expires_at: {type: integer, description: "Unix seconds; now + ticket.lifetime.", x-description-ru: "Unix-секунды; now + ticket.lifetime."}
    ChatSpan:
      type: object
      required: [idle_ttl_minutes]
      properties:
        idle_ttl_minutes: {type: integer, enum: [10, 30, 60, 260]}
    InboxItem:
      type: object
      description: "An offer to talk or a conversation (chat canon §8.12); no identities."
      x-description-ru: "Предложение поговорить либо беседа (канон чата §8.12); без личностей."
      required: [kind, id, created_at]
      properties:
        kind: {type: string, enum: [offer, chat]}
        id: {type: string, format: uuid, description: "match_id for an offer, chat_id for a conversation.", x-description-ru: "match_id у предложения, chat_id у беседы."}
        created_at: {type: integer, description: "Unix seconds.", x-description-ru: "Unix-секунды."}
        text_snapshot: {type: string, description: "Offer only: the phrase you liked, as it was.", x-description-ru: "Только у предложения: лайкнутая фраза, какой была."}
        unread: {type: integer, description: "Offer only: the count is shown on offers, not on chats.", x-description-ru: "Только у предложения: счётчик только на предложениях."}
    InboxPage:
      allOf:
        - {$ref: "#/components/schemas/Page"}
        - properties: {items: {type: array, items: {$ref: "#/components/schemas/InboxItem"}}}
```

**Привязка к операциям** (одна строка в каждой; `NNN` — строка на дереве):

| Операция | Строка | Вставить |
|---|---|---|
| `POST /identities` | `:1081` | `requestBody: {required: true, content: {application/json: {schema: {$ref: "#/components/schemas/IdentityCreate"}}}}`; 200 → `content: {application/json: {schema: {$ref: "#/components/schemas/IdentityCreated"}}}`; описание `:1077–1078` «The body is not spelled out in the canon» → «Body: IdentityCreate (2026-09-18)» |
| `POST /vault/share` | `:1097` | 200 `content … VaultShareResult` |
| `POST /sessions/invite` | `:1113` | 200 `content … SessionsInviteResult` |
| `PUT /identities/appearance` | `:1160` | `requestBody … Appearance`; 200 без тела → `"204": {description: Saved., …}` |
| `POST /sessions/claim` | `:1176` | 200 `content … SessionsClaimResult` |
| `POST /recovery/claim` | `:1186` | `requestBody … RecoveryClaim`; 200 `content … RecoveryClaimResult`; `"429": {$ref: "#/components/responses/RateLimited"}` |
| `GET /legal/manifest` | `:1200` | 200 `content … LegalManifest` |
| `POST /legal/accept` | `:1215` | `requestBody … LegalAccept`; 200 → 204 |
| `POST /feed` | `:1230` | `requestBody … FeedCreate`; 202 `content … FeedCreated` |
| `GET /feed` | `:1242` | параметры: `- {name: lat, in: query, required: true, schema: {type: number}}`, `lon` так же, `- {name: radius, in: query, required: true, schema: {type: integer, minimum: 100, maximum: 10000}, description: "Viewing radius in metres; not stepped (chat canon §8.3).", x-description-ru: "Радиус просмотра в метрах; без ступеней (канон чата §8.3)."}`, `- {name: mode, in: query, schema: {type: string, enum: [alone, company, party]}}` — язык и возраст **не параметры**: они из профиля (`identities.languages`, `filter_age_*`, `chat_RU.md:784`) |
| `GET /feed/density` | `:1284` | те же `lat`, `lon`, `radius`; 200 `content … Density` |
| `POST /matches/{id}/consent` | `:1332` | `requestBody … Consent`; 200 `content … ConsentResult` |
| `GET /inbox` | `:1370` | 200 схема `Page` → `InboxPage` |
| `POST /chats/{id}/ticket` | `:1365` | 200 `content … Ticket` |
| `PATCH /chats/{id}` | `:1411` | `requestBody … ChatSpan` |

**Оговорки — честно, что здесь придумано мной, а не перенесено.** `SessionsClaimResult.state`
и опрос новым устройством — механика «второй стороне ничего до „это я“» (`chat_RU.md:1143`) не
называет, **как** новое устройство узнаёт об ответе: опрос того же `POST /sessions/claim` или
отдельный `GET`. Я положил опрос тем же запросом — это выбор, не перенос. `RecoveryClaimResult.next_code`
рождается на узле — противоречит `chat_RU.md:1313` («код рождается на устройстве»): у устройства
на этом шаге нет ничего, но тогда узел на миг знает обе половины нового кода. **Решение владельца**:
либо код рождает устройство и досылает вторым запросом (`POST /recovery/reissue` подписью новой
сессии — уже утверждён), либо принять цену. `InboxItem` — по `chat_RU.md` §8.12, поля собраны из
`match_participants.text_snapshot`; проверить на утренней голове. `Consent.signature` — §8.13
говорит «половину, подписанную долгим ключом» (`chat_RU.md:2519`), форма подписи не названа.

**Цена.** yaml ~190 строк (RU-описания внутри, EN не отдельный файл); `render-openapi.py`
перестроит обе страницы. Канон и протокол — по одному абзацу к развилке A/B (~6 строк RU ×2).

---

## 3. Время: unix-секунды или ISO · 3.3

**Где.** `protocol_RU.md:31` «Время: unix-секунды, UTC. Часовых поясов в протоколе нет нигде»;
`openapi.yaml:210` `FeedItem.created_at: integer`. Против — десять `format: date-time`:
`:306` `Board.expires_at`, `:316` `TableLine.created_at`, `:400` `SupportRequest.created_at`,
`:402` `answered_at`, `:413` `Profile.stepped_away_until`, `:418` `phrases[].expires_at`,
`:493` `Statement.until`, `:498` `Statement.created_at`, `:1868` `blocks[].since`,
`:1947` `Away.until`. **ПРОВЕРЕНО** `grep -n date-time` → ровно эти десять.

**Решение владельца.**

| Вариант | Последствие | Цена |
|---|---|---|
| **A. unix-секунды целым везде** (рекомендую) | протокол §1 остаётся правдой; клиент держит один тип; `pending.until` и кадры `board.expires_at`, `confirm.until` (`protocol_RU.md:167–168`) — тоже целые | 10 замен в yaml, по одной строке |
| B. ISO 8601 `date-time` везде | читаемо в логах; `protocol_RU.md:31` и `FeedItem.created_at` переписать, кадры сокета — тоже; клиенту парсер дат | 2 правки протокола ×2, 1 в yaml, ~4 в кадрах §4.4 ×2 |
| C. оставить смесь | клиент различает по полю — ровно тот дефект, который план нашёл | 0 сейчас, баг позже |

**Предлагаемый текст (A)** — десять замен `{type: string, format: date-time}` →
`{type: integer, description: "Unix seconds (protocol §1).", x-description-ru: "Unix-секунды (протокол §1)."}`;
у `:493` (`Statement.until`) и `:413` (`stepped_away_until`) оставить их описания, сменить только тип.
`protocol_RU.md:31` дописать: `Все поля времени в ответах и кадрах — целые unix-секунды, не строки (18.09.2026).`

**Цена.** yaml 10 строк; протокол 1 строка ×2.

---

## 4. Хранилища без DDL: приглашения, билеты, незавершённая регистрация · 3.4

**Где.** Приглашение: `chat_RU.md:1071–1080`, `:1145` (второй claim отменяет), `limits.tsv:54`
(`invite.lifetime` 120 с, executor «запрос»). Билет: `protocol_RU.md:131–137`, `:203`,
`limits.tsv:105` (`ticket.lifetime` 30 с). Незавершённая: `chat_RU.md:1214–1218`, `limits.tsv:82`
(`signup.unfinished.ttl` 1 час, executor `identity.sweeper`). DDL `identities` `:774–790` —
колонки нет. **ПРОВЕРЕНО**: ни одного из трёх имён в 26 `CREATE TABLE` канона и в `schema.tsv`.

**Решение владельца — где живут приглашения и билеты.**

| Вариант | Последствие | Цена |
|---|---|---|
| **A. Две таблицы в базе** (рекомендую) | claim и сокет приходят на любой узел пула (`relay-pool-state`: два бокса за одним именем) — база общая; переживают перезапуск; уборка — строка в `scheduled.ts` | +2 DDL в канон, +2 строки `schema.tsv`, `open.tsv:141` 29 → 32 (с `table_likes`), +2 задачи уборки |
| B. Память узла | claim на «не тот» узел не находит приглашения — половина переносов падает при двух боксах | отвергнуть: противоречит пулу |
| C. Билет как HMAC-токен без таблицы, «гашение» — запись в `nonces`-подобную таблицу | таблица всё равно нужна ради одноразовости; выигрыш — не хранить до предъявления | та же таблица, минус одна колонка, плюс секрет HMAC в конфиге узла |

**Предлагаемый текст — канон §8.2, после DDL `sessions` (`chat_RU.md:1027`), до `nonces`:**

```sql
-- Приглашение переноса живёт в базе, а не в памяти узла: claim приходит на любой узел пула (18.09.2026).
CREATE TABLE session_invites (
  lookup_id     bytea PRIMARY KEY CHECK (octet_length(lookup_id) = 32),  -- material[0..32] кода переноса; сам код узлу неизвестен
  session       uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, -- отдающая сторона; заморозка сессии уносит приглашение
  enc_secret    bytea,                 -- конверт нового устройства; NULL = claim ещё не было
  reply_secret  bytea,                 -- ответный конверт с долгим ключом; NULL = «это я» ещё не нажато
  claimed_at    timestamptz,
  cancelled_at  timestamptz,           -- второй claim до «это я» (SEC-5): приглашение сгорело
  expires_at    timestamptz NOT NULL,  -- created_at + invite.lifetime
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_invites_expiry ON session_invites (expires_at);  -- уборка prune_session_invites

-- Билет сокета: одноразовый, 30 секунд, привязан к сессии и ровно к одной беседе или одному столу (протокол §4.4).
CREATE TABLE socket_tickets (
  ticket_hash  bytea PRIMARY KEY CHECK (octet_length(ticket_hash) = 32),  -- sha256 билета; сам билет узел не хранит
  session      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  chat_id      uuid REFERENCES chats(id) ON DELETE CASCADE,
  table_id     uuid REFERENCES tables(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,   -- created_at + ticket.lifetime
  used_at      timestamptz,            -- погашен при открытии сокета; повтор — код 4001
  CHECK ((chat_id IS NULL) <> (table_id IS NULL))
);
CREATE INDEX socket_tickets_expiry ON socket_tickets (expires_at);  -- уборка prune_socket_tickets
```

`identities` — после `closed_at` (`chat_RU.md:790`):

```sql
  confirmed_at     timestamptz          -- NULL = регистрация не завершена: бумажный код не подтверждён; такая личность не проходит ни одной проверки членства, prune_unfinished_signups сносит её через signup.unfinished.ttl (18.09.2026)
```

При варианте **A** из §2 (одно тело) колонка `confirmed_at` не нужна, абзац `chat_RU.md:1214–1218`
получает [retired], строка `limits.tsv:82` уходит.

**Реестры.** `schema.tsv`: `session_invites	docs/chat_RU.md:<строка>	-	product`,
`socket_tickets	docs/chat_RU.md:<строка>	-	product`, и недостающая `table_likes	docs/chat_RU.md:1901	-	product`.
`open.tsv:141` — «29 таблиц продукта» → «32 таблицы продукта (28 в спеке чата, 4 в спеке офферов; table_likes 17.09.2026, session_invites и socket_tickets 18.09.2026)».
`limits.tsv:54` executor «запрос» → `prune_session_invites`, `:105` → `prune_socket_tickets` — **только после** того, как задачи появятся в `scheduled.ts`, иначе `check-facts-limits` красный по имени исполнителя (**НЕ ПРОВЕРЕНО**, что он сверяет имя с файлом; по описанию `limits.tsv:15–19` — сверяет).

**Цена.** Канон 22 строки DDL + 1 ×2; реестры 3 + 1 + 2 строки; `check-facts-schema` перечитает счёт.

---

## 5. Хэш `auth` и хэш бумажного кода · 3.5

**Где.** `chat_RU.md:1229` `auth_hash text -- хэш от половины material`; `:779`
`recovery_auth_hash text -- хэш половины бумажного кода`; `:1193–1198` (врезка auth);
`openapi.yaml:439–442` (`Auth`), `:456` (`PinChange.next_auth_hash`). `test-map_RU.md:117`
(5.7: соль и алфавит, «тот же код → тот же lookup_id»). **ПРОВЕРЕНО.**

**Что сейчас.** Алгоритм не назван; `next_auth_hash` считает клиент, `POST /vault/share` сравнивает
узел — обязаны совпасть побайтно.

**Решение владельца** (простое, но это выбор алгоритма).

| Вариант | Последствие | Цена |
|---|---|---|
| **sha256 hex над сырыми 32 байтами `auth`; для бумажного кода — sha256 hex над сырыми 32 байтами `lookup_id`** (рекомендую) | `auth` уже выход Argon2id, второе растяжение не нужно; hex совпадает с `Notice.receipt_hash` `:171` | 0 |
| Argon2id повторно на узле | защищает дамп от того, кто уже украл `auth` с провода — но провод TLS, а `auth` и так растянут | +0.1 с на каждую проверку ПИНа, десять попыток → секунда |

**Предлагаемый текст.**

`chat_RU.md:1229`: `auth_hash     text NOT NULL,       -- sha256 hex от 32 байт auth (18.09.2026); сам ПИН узлу неизвестен`
`chat_RU.md:779`: `recovery_auth_hash  text,             -- sha256 hex от 32 байт lookup_id бумажного кода: по нему узел находит личность (18.09.2026)`
`chat_RU.md:1195`: `            auth  = material[0..32]   ─► уходит узлу; узел хранит sha256(auth) hex (18.09.2026)`

`openapi.yaml:456`:
```yaml
        next_auth_hash: {type: string, pattern: '^[0-9a-f]{64}$', description: "sha256 hex of the new auth (chat canon §8.2, 2026-09-18); the node stores it as vault_shares.auth_hash.", x-description-ru: "sha256 hex от нового auth (канон чата §8.2, 18.09.2026); узел кладёт его в vault_shares.auth_hash."}
```

`test-map_RU.md:117` — колонка «чем доказывается»: `вектор: тот же код → тот же lookup_id; узел хранит sha256(lookup_id) hex`.

**Цена.** Канон 3 строки ×2, yaml 1, тест-карта 1 ×2.

---

## 6. Имена полей стола · 3.6

**Где.** `chat_RU.md:323` `tables.game`; `:417` `table_games.class`; `openapi.yaml:274`
`TableCreate.class`, `:287` `TableView.class`, `:198` `FeedItem.game`; `protocol_RU.md:109`
«у стола вместо `text` — `{game, playing, watching}`»; `:192` «свой `seat` и `playing`»;
`openapi.yaml:289–291` `is_playing: boolean`, `playing: integer`. **ПРОВЕРЕНО.**

**Правка, не решение** — имя уже выбрано контрактом трижды (`class`), колонка и карточка отстали.

`chat_RU.md:323`: `  class            text NOT NULL,                             -- класс доски: grid | free | dots | deck | dice | physics | word (было game, 18.09.2026)`
`openapi.yaml:198`: `        class: {type: string, enum: [grid, free, dots, deck, dice, physics, word], description: "Table only (was game, 2026-09-18).", x-description-ru: "Только у стола (было game, 18.09.2026)."}`
`protocol_RU.md:109`: `{game, playing, watching}` → `{class, playing, watching}` (18.09.2026; `game` [retired]).
`protocol_RU.md:192`: `свой `seat` и `playing`` → `свой `seat` и `is_playing`; `playing` и `watching` — числа`.

**Цена.** 4 строки RU, 2 ×2 EN = 6.

---

## 7. `match_participants` для мэтча от оффера · 3.7

**Где.** `chat_RU.md:1994–1995` `message_id uuid NOT NULL`, `text_snapshot text NOT NULL`;
`test-map_RU.md:216` (10.3 «необязательны»); `protocol_RU.md:118` («у оффера мэтч односторонний
и не требует своей живой фразы»). **ПРОВЕРЕНО.**

**Правка** — тест и протокол уже решили.

```sql
  message_id        uuid,                -- NULL у мэтча от оффера без своей фразы (тест 10.3, 18.09.2026)
  text_snapshot     text,                -- снимок на момент мэтча; NULL вместе с message_id
  …
  CHECK ((message_id IS NULL) = (text_snapshot IS NULL))
```

Строка `CHECK` — последней в DDL, перед `);` (`chat_RU.md` после `declined_at`, точное место
уточняется по хвосту DDL при применении).

**Цена.** 3 строки ×2.

---

## 8. Ответ лайка · 3.8

**Где.** `openapi.yaml:211–215` `LikeResult {state, match_id}`; `test-map_RU.md:177` (8.6
«только `{state}`»), EN `:176`. **ПРОВЕРЕНО.**

**Решение владельца.**

| Вариант | Последствие | Цена |
|---|---|---|
| **A. Оставить `match_id`, поправить тест 8.6** (рекомендую) | у оффера лайк рождает мэтч сразу, и `POST /matches/{id}/consent` нужен `id` тут же; uuid сущности §1 протокола разрешает | тест 1 строка ×2 |
| B. Убрать `match_id`, брать из `GET /inbox` | второй запрос после каждого лайка на оффер; контракт 1 строка | yaml −1, лишний запрос в клиенте |

**Текст (A).** `test-map_RU.md:177`: `| 8.6 | Клиенту не сообщают, кого он лайкнул | ответ содержит `{state, match_id?}` и ничего о личности — ни id, ни имени | нечем |`.
`openapi.yaml:215`: `        match_id: {type: string, format: uuid, description: "Only with state matched; an entity uuid, never a person (protocol §1).", x-description-ru: "Только при state matched; uuid сущности, не человека (протокол §1)."}`

---

## 9. Манифест юридических документов · 3.9

**Где.** `protocol_RU.md:95`; `chat_RU.md:815–822` (`legal_acceptances`), `:843–847`
(`reaccept` `required`); `openapi.yaml:100–113` (`LegalReacceptance`), `:1189–1200`;
`test-map_RU.md:187` (8.10, `deploy/check-legal-revisions.py`). **ПРОВЕРЕНО.** Откуда узел
берёт текущие редакции трёх документов двух витрин — не сказано нигде.

**Решение владельца.**

| Вариант | Последствие | Цена |
|---|---|---|
| **A. Таблица `legal_revisions`, пишет её команда узла при выкате витрины** (рекомендую) | пул читает одно место; смена редакции — без пересборки образа узла; манифест = `SELECT`; `Health` может отдавать `legal: {terms: date, …}` | DDL 8 строк, +1 таблица (33), команда `deno task legal:publish <brand> <manifest.json>` — код |
| B. JSON в образе узла (`LEGAL_MANIFEST_PATH`) | редакция витрины тянет пересборку и выкат **узла**; два бокса могут расходиться до второго выката | 0 DDL; связка выкатов |
| C. Переменная окружения | три документа × две витрины × три поля = 18 значений в env | отвергнуть |

**Текст (A)** — канон §8.2 после `legal_acceptances`:

```sql
-- Текущие редакции — в базе, а не в образе: их меняет выкат витрины, а не узла (18.09.2026).
CREATE TABLE legal_revisions (
  brand            text NOT NULL,
  document         text NOT NULL CHECK (document IN ('terms', 'privacy', 'guidelines')),
  revision_date    date NOT NULL,
  revision_sha256  text NOT NULL CHECK (revision_sha256 ~ '^[0-9a-f]{64}$'),
  reaccept         text NOT NULL DEFAULT 'required' CHECK (reaccept IN ('required')),
  published_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand, document)
);
```

`protocol_RU.md:95` дописать в «что делает»: `; редакции узел читает из `legal_revisions`, куда их кладёт выкат витрины (18.09.2026)`.

**Цена.** Канон 10 строк ×2, протокол 1 ×2, реестр 1, `open.tsv:141` счёт.

---

## 10. Путь сокета и стол · 3.10

**Где.** `protocol_RU.md:133–134` (`new WebSocket(...)` без пути), `:162` («один на беседу и один
на стол»), `:177` (`xor.p1, ticket.<билет>`); `openapi.yaml:587–596` (`GET /chat`, built, 501,
`x-source: relay/node/src/main.ts`). **ПРОВЕРЕНО.**

**Правка** — билет из §4 сам знает, к чему привязан (`socket_tickets.chat_id | table_id`), значит путь один.

`protocol_RU.md:134`: `2. new WebSocket("wss://<узел>/chat", ["xor.p1", "ticket.<билет>"])  билет идёт в Sec-WebSocket-Protocol,` — путь `/chat` один на беседы и столы, к чему привязан сокет, знает билет (18.09.2026).

`openapi.yaml:590–591`:
```yaml
      summary: The socket of a conversation or a table
      x-summary-ru: Сокет беседы или стола
      description: "One path for both; the ticket from POST /chats/{id}/ticket or POST /tables/{id}/ticket rides in Sec-WebSocket-Protocol as xor.p1, ticket.<value> and says what the socket is bound to (protocol §4.4). Built as a 501 slot; the exchange is step 4 of the build plan."
      x-description-ru: "Один путь на оба; билет из POST /chats/{id}/ticket или POST /tables/{id}/ticket едет в Sec-WebSocket-Protocol как xor.p1, ticket.<значение> и сам говорит, к чему привязан сокет (протокол §4.4). Построен как слот 501; обмен — шаг 4 плана сборки."
```

Оговорка: `x-status: built` и `x-source: main.ts` остаются — ворота требуют, чтобы built-путь
стоял в своём `x-source` (`check-openapi.sh:16`), а `/chat` там есть; менять статус нельзя,
пока код не построен.

**Цена.** Протокол 1 ×2, yaml 4.

---

## 11. Адресат мотивировки · 3.11

**Где.** `protocol_RU.md:188` («свои мотивировки по подписи»); `relay/node/db/005_dsa_notices.sql:73`
`recipient_identity text NOT NULL`; `relay/node/src/routes/dsa.ts:258–260` (обязательное поле тела
решения, до 200 символов, **вводит оператор**), `:289–295` (INSERT); `docs/dsa/SPEC_RU.md:95`
(`recipient_identity` — 200); `openapi.yaml:2094–2108`. **ПРОВЕРЕНО.**

**Что сейчас.** Колонка есть, план ошибся; **нет** правила, что в ней лежит: сегодня — что
оператор набрал. `GET /statements` сможет найти «свои» только если там uuid личности из снимка цели.

**Правка** (план §3.11 «колонка `addressee_identity` нужна» — [retired] этим разбором).

`protocol_RU.md:188`, в «что делает» после «свои мотивировки по ст. 17»: `— строки `dsa_statements`, у которых `recipient_identity` равен uuid личности запроса: его кладёт решение из снимка цели (`author_identity` фразы, стола или участника беседы), не рука оператора; внешнего ключа нет, мотивировка живёт год и переживает удаление личности через 30 дней (18.09.2026)`.

`docs/dsa/SPEC_RU.md:95` — в описание поля: `uuid личности-адресата из снимка цели; заполняет узел, оператор поле не вводит (18.09.2026)`.

Код (не в этой пачке, шаг 7 плана): `dsa.ts:258` — брать из снимка, из тела [retired]. Пока снимок
не несёт `author_identity` (таблиц личностей нет), поле остаётся ручным — и это надо записать в
`open.tsv` пунктом `dsa.statements.recipient.manual`.

**Цена.** Протокол 1 ×2, DSA-спека 1 ×2, `open.tsv` 1.

---

## 12. Графемы · 3.12

**Где.** `chat_RU.md:1441` («128 графем: узел»), `:776` («24 графемы: узел»), `:326`
(имя стола); `limits.tsv:31`, `:53`, `:110`; `test-map_RU.md:58` (1.2b). `relay/node/src/lib/text.ts`
— **нет** (**ПРОВЕРЕНО** `ls relay/node/src/lib/`); образ `denoland/deno:alpine-2.1.4`
(`relay/node/Dockerfile:2`).

**Замер — ПРОВЕРЕНО** в контейнере 18.09.2026:
`docker run --rm --network none denoland/deno:alpine-2.1.4 eval '…Intl.Segmenter("und",{granularity:"grapheme"})…'`
над строкой `👨‍👩‍👧‍👦🇦🇲é` (10 кодовых точек) → `{"segments":3,"codepoints":10,"nfc":3}`.
Семья, флаг и `é` — по одной графеме. ICU в образе полный; тест 1.2b на смену образа нужен.

**Правка.** `chat_RU.md` §8.3, новый абзац после DDL `feed_messages` (`:1204` конец блока):

> **Чем считаются графемы — записано 18.09.2026.** `new Intl.Segmenter("und", {granularity: "grapheme"})` над строкой после `normalize("NFC")`, одна функция в `relay/node/src/lib/text.ts` для имени, фразы, имени стола и реплики. Замерено в образе `denoland/deno:alpine-2.1.4`: семейный эмодзи из семи кодовых точек, флаг и составной `é` — по одной графеме. Счёт зависит от ICU в образе Deno, поэтому тест 1.2b с семейным эмодзи стоит воротами на смену образа.

`test-map_RU.md:58` «чем доказывается»: `имя из 24 эмодзи с модификаторами → принято; 25 → отказ; семейный эмодзи 👨‍👩‍👧‍👦 — одна графема (замер 18.09.2026)`.

**Цена.** Канон 4 строки ×2, тест-карта 1 ×2.

---

## 13. Курсор `after` · 3.13

**Где.** `protocol_RU.md:349` («курсор кодирует (`visible_at`, `id`) … не раскрывает ничего сверх
уже выданного»); `openapi.yaml:518–524` (`After`). **ПРОВЕРЕНО.**

**Правка** — подпись не нужна: обе величины уже выданы клиенту в той же странице.

`protocol_RU.md:349`, после «(DATA-5)»: `; кодирование — base64url без набивки от строки `<unix-секунды>.<uuid>`; курсор, который не разбирается, — 400 `invalid_body` (18.09.2026)`.

`openapi.yaml:523–524`:
```yaml
      description: "Opaque cursor from the previous answer's next (protocol §6): base64url of <unix seconds>.<uuid>, (visible_at, id) for the feed and (created_at, id) for the inbox; unparsable → 400 invalid_body (2026-09-18)."
      x-description-ru: "Непрозрачный курсор из next предыдущего ответа (протокол §6): base64url от <unix-секунды>.<uuid>, (visible_at, id) у ленты и (created_at, id) у инбокса; неразобранный → 400 invalid_body (18.09.2026)."
```

**Цена.** Протокол 1 ×2, yaml 2.

---

## 14. Таблица `nonces` — три мелочи · 3.14

**Где.** `chat_RU.md:1028–1040`; `openapi.yaml:434–438` (`Nonce` 22 символа), `:544–547`
(`NonceReused`: «или nonce не той формы — code invalid_body» под 409); `limits.tsv:109`
(`nonce.ttl`, executor `chat.janitor.missing`); `scheduled.ts` — задачи `prune_nonces` нет
(**ПРОВЕРЕНО** `grep -n PRUNE_ scheduled.ts`). **ПРОВЕРЕНО.**

**Правка.** 409 — только повтор nonce на другом маршруте; битая форма — 400 как у любого тела.

`openapi.yaml:545–546`:
```yaml
      description: "The same nonce on another route — code invalid_body (protocol §2). A malformed nonce is a body error and answers 400 like any other (2026-09-18). On POST /blocks this 409 answers the nonce only, never the target of the block."
      x-description-ru: "Тот же nonce на другом маршруте — code invalid_body (протокол §2). Nonce не той формы — ошибка тела, 400 как у любого (18.09.2026). У POST /blocks этот 409 отвечает только на nonce, никогда — на цель блокировки."
```

`chat_RU.md:1038`: `CREATE INDEX nonces_expiry ON nonces (created_at);  -- уборка по nonce.ttl задачей prune_nonces в scheduled.ts, с шага 0 (18.09.2026; «тем же уборщиком, что чистит беседы» [retired])`.
`limits.tsv:109` executor `chat.janitor.missing` → `prune_nonces` — **после** появления задачи (см. §4, та же оговорка).

**Цена.** yaml 2, канон 1 ×2, реестр 1 (позже).

---

## 15. Пул и счётчики в памяти · 3.15

**Где.** `protocol_RU.md:289` («50 за час на узел»), `:307` («счётчики по личности живут в памяти
узла … на каждом узле пула свои, и это принято»), `:376–380` (§8 п. 7); `rate_limit.ts:5–7`
(«N nodes allow N times the limit»). **ПРОВЕРЕНО.**

**Правка.** `protocol_RU.md:307`, после «и это принято»: `; то же верно для общего порога промахов «50 за час на узел» (`claim.miss.shared`) — при двух боксах за одним именем реальный порог 100, и это тоже принято (18.09.2026)`.

**Цена.** 1 строка ×2.

---

## 16. Функции гео и полос в базе · 3.16

**Где.** `chat_RU.md:1665–1687` (запрос зовёт `grid_round_lat`, `grid_round_lon`, `haversine`,
`band_low`, `band_high`); формулы `:1511–1516` (клетка), `:1400–1401` (полосы);
`test-map_RU.md:153` (7.2). `CREATE FUNCTION` — нет. **ПРОВЕРЕНО.** Оговорка к плану: «чтобы
`check-facts-schema` их видел» — не увидит: ворота грепают только `CREATE TABLE`
(**ПРОВЕРЕНО** `scripts/check-facts-schema.sh:66`).

**Правка** — канон §8.3, перед запросом выдачи (`chat_RU.md:1663`):

```sql
-- Пять функций, которые зовёт запрос ниже; IMMUTABLE, чтобы планировщик мог их сворачивать (18.09.2026).
CREATE FUNCTION grid_round_lat(lat double precision, r integer) RETURNS double precision
  LANGUAGE sql IMMUTABLE AS $$ SELECT round(lat / (r / 111320.0)) * (r / 111320.0) $$;
CREATE FUNCTION grid_round_lon(lon double precision, lat double precision, r integer) RETURNS double precision
  LANGUAGE sql IMMUTABLE AS $$
    SELECT round(lon / d) * d
    FROM (SELECT r / (111320.0 * cos(radians(grid_round_lat(lat, r)))) AS d) s $$;  -- косинус от УЖЕ ОКРУГЛЁННОЙ широты (§8.3)
CREATE FUNCTION haversine(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision) RETURNS double precision
  LANGUAGE sql IMMUTABLE AS $$
    SELECT 2 * 6371000.0 * asin(sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2
      + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) ^ 2)) $$;  -- метры
CREATE FUNCTION band_low(age integer) RETURNS integer
  LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN age <= 20 THEN greatest(13, age - 2) ELSE least(21, age - 2) END $$;
CREATE FUNCTION band_high(age integer) RETURNS integer
  LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN age <= 20 THEN age + 2 ELSE 2147483647 END $$;  -- ∞ взрослого пула
```

**ПРОВЕРЕНО** в контейнере `postgres:16-alpine` 18.09.2026 (`scratchpad/ddl-check.sql`): все пять
функций создаются; `band_low(20)=18, band_high(20)=22, band_low(21)=19, band_high(21)=2147483647,
band_low(13)=13` — тест 7.2 сходится; `haversine` на 0.01° долготы в Париже даёт 732 м (ожидаемо ≈733);
`grid_round_lat(48.8566, 1000)=48.85914…`, `grid_round_lon(2.3522, 48.8566, 1000)=2.34848…`. Тем же
прогоном созданы `session_invites`, `socket_tickets` (§4) и `legal_revisions` (§9) на заглушках
`sessions`/`chats`/`tables` — DDL синтаксически и по ограничениям верны.

**Цена.** Канон 16 строк ×2.

---

## 17. Порядок применения одной пачкой

Пачка — `scratchpad/batch-contract.py` по форме `batch-likes.py` (список `rep(path, old, new, n)`,
каждый якорь обязан совпасть ровно `n` раз, `--check` без записи, затем запись). **Скрипт не
написан**: половина якорей зависит от решений §1–§5, §8–§9, и писать его до утра значило бы
угадывать за владельца. Порядок применения после решений:

1. `schema.tsv` += `table_likes` (§0.2) — первым, чтобы счёт таблиц был честным до остальных DDL.
2. §6, §7, §10, §13, §14, §15, §16 — правки без развилок: канон, протокол, yaml, тест-карта.
3. §12 — канон + тест-карта.
4. §11 — протокол, DSA-спека, `open.tsv`.
5. §3 — десять замен в yaml (после решения A/B).
6. §1, §5 — врезки протокола и канона, `identitySignature`, `Auth`/`PinChange`.
7. §4, §9 — DDL в канон, `schema.tsv`, `open.tsv:141`.
8. §2 — схемы и привязки в yaml (самая большая; после решения о втором шаге регистрации).
9. `scripts/render-openapi.py` — перестроить `docs/api/index_RU.html`, `index_EN.html`.
10. EN-пары: `protocol_EN.md`, `chat_EN.md`, `test-map_EN.md`, `docs/dsa/SPEC_EN.md` — той же пачкой
    (навык `docs-pairing`); якоря EN берутся по месту, как `batch-likes.py:63` оговаривает.

Форма пачки — как на этой неделе:

```python
#!/usr/bin/env python3
"""Owner's decisions of 2026-09-19 on NIGHT_2026-09-18_contract-draft.md; every anchor matches exactly once."""
import pathlib, sys
X = pathlib.Path("/home/eugene-panov/Projects/panov-id/xor.ad/docs")
edits = []
def rep(p, old, new, n=1): edits.append((p, old, new, n))
# §6 table field names
rep(X/"chat_RU.md", "  game             text NOT NULL,                             -- класс доски:", "  class            text NOT NULL,                             -- класс доски:")
rep(X/"protocol_RU.md", "у стола вместо `text` — `{game, playing, watching}`", "у стола вместо `text` — `{class, playing, watching}` (18.09.2026; `game` [retired])")
# … остальные по §§ выше …
bad = []
for p, old, new, n in edits:
    c = p.read_text(encoding="utf-8").count(old)
    if c != n: bad.append(f"anchor x{c} (want {n}) in {p.name}: {old[:80]!r}")
if bad: sys.exit("\n".join(bad))
if "--check" in sys.argv: sys.exit("anchors ok: %d" % len(edits))
for p, old, new, n in edits:
    p.write_text(p.read_text(encoding="utf-8").replace(old, new), encoding="utf-8")
```

**Ворота после пачки, в этом порядке:**

| Ворота | Что ловит здесь |
|---|---|
| `scripts/check-openapi.sh` | дубли ключей и порванные flow-описания в новых схемах; built-путь в `x-source`; страницы `index_*.html` собраны из нынешнего yaml |
| `scripts/test_check-openapi.sh` | сами ворота не сломаны |
| `scripts/check-facts-limits.sh` | executor у `invite.lifetime`, `ticket.lifetime`, `nonce.ttl`, `signup.unfinished.ttl` — имя задачи или пункт `open.tsv` |
| `scripts/check-facts-schema.sh` | нужен стенд: счёт `product.tables.unmigrated` против реестра (29 → 32/33) |
| `scripts/check-docs-pairing-all.sh` | RU/EN пары после §17 п. 10 |
| `scripts/check-retired-terms.sh` | `game` у стола, «тем же уборщиком», «три шага» |
| `scripts/harden-cycle.sh` | всё вместе, тремя репозиториями |

---

## 18. Итог для владельца

**Правкой без развилки — 9:** §6 (имена стола), §7 (`NOT NULL`), §10 (путь сокета), §11 (адресат —
правило, не колонка), §12 (графемы, замер есть), §13 (курсор), §14 (`nonces`), §15 (пул), §16
(функции SQL). Плюс `table_likes` в реестр.

**Ждут решения — 7:** §1 (подпись / ключ / хэш тела — три пункта), §2 (второй шаг регистрации,
и от него — тело `POST /identities`), §3 (unix против `date-time`), §4 (таблицы против памяти —
формально, рекомендация одна), §5 (алгоритм хэша `auth`), §8 (`match_id` в ответе лайка),
§9 (где живут редакции документов).

**Три главные развилки:**

1. **Второй шаг регистрации (§2):** одно тело `POST /identities` против двух новых маршрутов
   `/vault/enroll` и `/recovery/enroll`. Тянет за собой `confirmed_at`, `prune_unfinished_signups`,
   `signup.unfinished.ttl`, строку `protocol_RU.md:99` и список из 56 утверждённых имён.
2. **Время (§3):** unix-секунды целым везде — десять правок yaml — против `date-time` везде —
   переписать §1 протокола и кадры сокета.
3. **Подпись и ключи (§1):** raw `r‖s` + SPKI base64url + hex-хэш; альтернатива DER/JWK стоит
   кодека на обеих сторонах и ничего не даёт WebCrypto-клиенту.

Отдельно, не развилка, но цена: `RecoveryClaimResult.next_code` в §2 рождается на узле и спорит
с `chat_RU.md:1313`; и `SessionsClaimResult` с опросом — моя догадка о механике, которой канон не
описывает. Оба помечены в тексте §2.
