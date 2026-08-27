#!/usr/bin/env bash
# Переадресация www.panov.id → panov.id.
#
# Сайт отвечал только на голом домене, а «www.» люди пишут по привычке — и
# попадали не на медленную страницу, а в NXDOMAIN: записи не существовало вовсе.
# Браузер в этом случае не показывает ничего, что можно принять за наш сайт.
#
# Порядок обязателен и держится на одном: сертификат выпускается только тогда,
# когда имя уже указывает на зону.
#
#   1. DNS   — CNAME www → зона              (deploy/namecheap-dns.sh www --apply)
#   2. хостнейм в зоне                        (этот скрипт, шаг hostname)
#   3. сертификат Let's Encrypt + ForceSSL    (этот скрипт, шаг cert)
#   4. правило редиректа 301 на голый домен   (этот скрипт, шаг rule)
#
#   scripts/www-redirect.sh status     # что уже сделано, ничего не меняя
#   scripts/www-redirect.sh hostname   # добавить www как хостнейм зоны
#   scripts/www-redirect.sh cert       # выпустить сертификат и включить ForceSSL
#   scripts/www-redirect.sh rule       # создать правило редиректа
#   scripts/www-redirect.sh all        # 2, 3 и 4 подряд
set -uo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
set -a; . "$ROOT_DIR/deploy/.env.deploy" 2>/dev/null; set +a
[ -n "${BUNNY_API_KEY:-}" ] || { echo "нет BUNNY_API_KEY в deploy/.env.deploy" >&2; exit 2; }

python3 - "$BUNNY_API_KEY" "${1:-status}" <<'PY'
import json
import sys
import urllib.error
import urllib.request

key, step = sys.argv[1], sys.argv[2]
API = "https://api.bunny.net"
ZONE_HOSTNAME = "panov.id"       # зона опознаётся по точному хостнейму, не по подстроке
WWW = "www.panov.id"


def call(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{API}{path}", method=method, data=data,
        headers={"AccessKey": key, "Accept": "application/json",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            raw = response.read().decode()
            return response.status, (json.loads(raw) if raw.strip().startswith(("{", "[")) else raw)
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()[:300]


status, zones = call("/pullzone")
if status != 200 or not isinstance(zones, list):
    sys.exit(f"не удалось получить зоны: HTTP {status}")

zone = next((z for z in zones
             if any(h.get("Value") == ZONE_HOSTNAME for h in z.get("Hostnames", []))), None)
if zone is None:
    sys.exit(f"зона с хостнеймом {ZONE_HOSTNAME} не найдена")

zone_id = zone["Id"]
hostnames = {h.get("Value"): h for h in zone.get("Hostnames", [])}


def show():
    print(f"зона {zone['Name']} (id {zone_id})")
    for value, host in hostnames.items():
        print(f"  хостнейм {value:<20} сертификат={host.get('HasCertificate')} force_ssl={host.get('ForceSSL')}")
    code, rules = call(f"/pullzone/{zone_id}/edgerules") if False else (200, zone.get("EdgeRules", []))
    redirects = [r for r in (rules or []) if r.get("ActionType") == 1]
    print(f"  правил всего: {len(rules or [])}, из них редиректов: {len(redirects)}")
    for rule in redirects:
        print(f"    → {rule.get('Description')}: {rule.get('ActionParameter1')} [{rule.get('ActionParameter2')}]")


if step == "status":
    show()
    print(f"\nwww как хостнейм: {'есть' if WWW in hostnames else 'НЕТ'}")
    sys.exit(0)

if step in ("hostname", "all"):
    if WWW in hostnames:
        print(f"хостнейм {WWW} уже есть — пропускаю")
    else:
        code, body = call(f"/pullzone/{zone_id}/addHostname", "POST", {"Hostname": WWW})
        print(f"добавление хостнейма {WWW}: HTTP {code} {body if code not in (200, 204) else ''}")
        if code not in (200, 204):
            sys.exit(1)

if step in ("cert", "all"):
    # Сертификат выпускается только когда имя уже указывает на зону: Let's Encrypt
    # ходит по этому же имени. Без DNS шаг честно падает, и это не повод его прятать.
    code, body = call(f"/pullzone/loadFreeCertificate?hostname={WWW}")
    print(f"сертификат для {WWW}: HTTP {code} {body if code not in (200, 204) else 'выпущен'}")
    if code in (200, 204):
        code, body = call(f"/pullzone/{zone_id}/setForceSSL", "POST",
                          {"Hostname": WWW, "ForceSSL": True})
        print(f"ForceSSL: HTTP {code}")

if step in ("rule", "all"):
    # 301 на тот же путь голого домена. Условие — только по имени хоста, чтобы
    # правило не трогало запросы, пришедшие на сам panov.id.
    # Параметры взяты не из головы, а из работающего правила в боевых зонах
    # витрин — там такой редирект стоит и действует. Три отличия от того, что я
    # написал по догадке, и каждое ломало правило молча:
    #   ActionType = 1 (Redirect), а не 2 — двойка проходит валидацию и ничего не делает;
    #   путь без слеша перед {{path}}, иначе адрес выходит с двойным слешем;
    #   код 301 сохраняется только при ActionType = 1 — при двойке API его молча съедал.
    rule = {
        "ActionType": 1,
        "ActionParameter1": "https://panov.id{{path}}",
        "ActionParameter2": "301",
        "Description": "www → apex, 301",
        "Enabled": True,
        "TriggerMatchingType": 0,
        "Triggers": [{
            "Type": 0,                        # URL
            "PatternMatchingType": 0,         # Any
            "PatternMatches": [f"https://{WWW}/", f"https://{WWW}/*"],
        }],
    }
    existing_rule = next((r for r in (zone.get("EdgeRules") or [])
                          if r.get("Description") == rule["Description"]), None)
    if existing_rule:
        rule["Guid"] = existing_rule["Guid"]
    code, body = call(f"/pullzone/{zone_id}/edgerules/addOrUpdate", "POST", rule)
    print(f"правило редиректа: HTTP {code} {body if code not in (200, 204) else 'создано'}")

print()
status, zones = call("/pullzone")
zone = next(z for z in zones if z["Id"] == zone_id)
hostnames = {h.get("Value"): h for h in zone.get("Hostnames", [])}
show()
PY
