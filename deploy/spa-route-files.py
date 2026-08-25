"""Give every route of the panel a file of its own.

The panel is a BrowserRouter application served from a storage zone: only the
files that exist are answered, and `/auth/callback?token=…` — the address every
magic-link points at — is not a file. Bunny's Custom404FilePath does return the
application for such a path, but it returns it under **404**, measured on all
three environments on 2026-08-25. Anything that reads the status rather than the
body — uptime checks, fetch() with res.ok, a preview bot — sees a panel that is
down, and a browser is left to render an error page that happens to contain an
app.

The fix that keeps the truth in the status line is boring: copy index.html to
`<route>/index.html` for every route the application declares. The path then
exists, so it answers 200, while a path nobody declared — a mistyped asset, a
route that was removed — still answers 404. Bunny's Rewrite404To200 would have
turned every one of those into a 200 as well, which is why it is not used here.

The routes are read out of the application rather than kept in a second list:
a route added in App.tsx and forgotten here would be a deep link that 404s, and
that is exactly the failure being fixed.

    spa-route-files.py <dist-directory> <App.tsx>

Prints one line per file written. Exits 1 if the source has no routes at all,
which means the parsing stopped matching the code it reads.
"""
import pathlib
import re
import sys

ROUTE = re.compile(r'path="(/[^"*]*)"')


def routes(source: pathlib.Path) -> list[str]:
    found = []
    for path in ROUTE.findall(source.read_text(encoding="utf-8")):
        route = path.strip("/")
        if route and route not in found:
            found.append(route)
    return sorted(found)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    dist = pathlib.Path(sys.argv[1])
    source = pathlib.Path(sys.argv[2])

    index = dist / "index.html"
    if not index.is_file():
        raise SystemExit(f"нет {index} — панель не собрана")
    if not source.is_file():
        raise SystemExit(f"нет {source}")

    found = routes(source)
    if not found:
        # A silent zero here would ship a panel whose deep links all 404 while
        # the deploy said nothing, which is the failure this script exists for.
        raise SystemExit(f"в {source} не найдено ни одного маршрута — разбор устарел")

    body = index.read_bytes()
    for route in found:
        target = dist / route / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
        print(f"  → /{route}/index.html")
    print(f"маршрутов с собственным файлом: {len(found)}")


if __name__ == "__main__":
    main()
