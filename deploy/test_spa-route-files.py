"""What spa-route-files.py promises, checked on a throwaway tree.

Each case is one thing the deploy would ship wrong if the script stopped
holding: a route without a file (a deep link that 404s), a file for a path
nobody declared (a 404 that stopped being honest), and a parser that quietly
matches nothing after the application changes shape.

    python3 deploy/test_spa-route-files.py
"""
import os
import pathlib
import subprocess
import sys
import tempfile

# Путь берётся из окружения, чтобы через эти же случаи можно было прогнать
# намеренно сломанную копию и увидеть, что они краснеют.
SCRIPT = pathlib.Path(os.environ.get("SUT") or pathlib.Path(__file__).with_name("spa-route-files.py"))
APP = '''
  <Route path="/login" element={<Login />} />
  <Route path="/waitlist" element={<List />} />
  <Route path="/logs/audit" element={<Audit />} />
  <Route path="/auth/callback" element={<Callback />} />
  <Route path="*" element={<Missing />} />
'''

passed = failed = 0


def check(name, expected, actual):
    global passed, failed
    if expected == actual:
        print(f"OK   {name:<52} {actual}")
        passed += 1
    else:
        print(f"FAIL {name:<52} ждали «{expected}», получили «{actual}»")
        failed += 1


def run(dist, app_text):
    source = dist.parent / "App.tsx"
    source.write_text(app_text, encoding="utf-8")
    return subprocess.run([sys.executable, str(SCRIPT), str(dist), str(source)],
                          capture_output=True, text=True)


with tempfile.TemporaryDirectory() as tmp:
    root = pathlib.Path(tmp)
    dist = root / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>xor panel</title>", encoding="utf-8")

    print("=== T1 каждый объявленный маршрут получает файл")
    result = run(dist, APP)
    check("T1 код возврата", 0, result.returncode)
    for route in ("login", "waitlist", "logs/audit", "auth/callback"):
        check(f"T1 {route}/index.html", True, (dist / route / "index.html").is_file())
    check("T1 содержимое совпадает с index.html", True,
          (dist / "waitlist/index.html").read_bytes() == (dist / "index.html").read_bytes())

    print("=== T2 путь, которого никто не объявлял, файла не получает")
    check("T2 api-keys/index.html", False, (dist / "api-keys/index.html").exists())
    check("T2 звёздочка не стала каталогом", False, (dist / "*").exists())

    print("=== T3 разбор, переставший находить маршруты, останавливает выкат")
    result = run(dist, "<Route element={<Nothing />} />")
    check("T3 код возврата", 1, result.returncode)
    check("T3 сказано, что разбор устарел", True, "разбор устарел" in result.stderr)

    print("=== T4 несобранная панель — отказ, а не пустая работа")
    empty = root / "empty"
    empty.mkdir()
    result = run(empty, APP)
    check("T4 код возврата", 1, result.returncode)
    check("T4 названа причина", True, "не собрана" in result.stderr)

print()
print(f"прошло {passed}, упало {failed}")
raise SystemExit(1 if failed else 0)
