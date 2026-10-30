#!/usr/bin/env python3
"""Tests of nd4-tokens.py: 8 blocks from the real mockups; a mockup without a panel fails."""
import importlib.util
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("tok", Path(__file__).with_name("nd4-tokens.py"))
tok = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tok)


def test_real_mockups_give_eight_blocks():
    css, errors = tok.build()
    assert errors == [], errors
    assert css.count(":root[data-theme=") == 8, css.count(":root[data-theme=")
    assert "blur(18px)" in css, "amber glass missing"
    assert "--r-panel: 8px" in css, "chalk paper corners missing"
    # every theme carries every token of its base, so old screens keep working (N of M named)
    for time, base in tok.BASE.items():
        want = set(tok.base_decls(base))
        assert len(want) > 60, f"base {base} read {len(want)} tokens"
        for theme in tok.STYLES.values():
            block = css.split(f'[data-theme="{theme}"][data-time="{time}"] {{', 1)[1].split("}", 1)[0]
            have = {k for k in want if f"  {k}:" in block}
            assert have == want, f"{theme} {time}: {len(have)} of {len(want)}; missing {sorted(want - have)[:5]}"
    for acc in tok.ACCENTS:
        assert css.count(f'[data-accent="{acc}"]') == 2, f"accent {acc} lacks day or night"


def test_missing_panel_fails():
    with tempfile.TemporaryDirectory() as d:
        for style in tok.STYLES:
            for suffix in ("", "-night"):
                Path(d, f"{style}{suffix}-phone.html").write_text('<body><div class="scr" style="background:#fff"></div>', encoding="utf-8")
        _, errors = tok.build(Path(d))
        assert any("--panel not found" in e for e in errors), errors


if __name__ == "__main__":
    test_real_mockups_give_eight_blocks()
    test_missing_panel_fails()
    print("2 of 2 ok")
