# Zone families for nd4-extract.py

One file per zone (`enter.py`, `talks.py`, …). Each runs inside `nd4-extract.py` with its names
(`FAMILIES`, `_FRAME`, `_BACK`, `_HELP`, `_WIDTHS`) and adds `FAMILIES["<name>"] = {...}` the way
`match-offer` / `match-waiting` do in `nd4-extract.py`. The archive markup is taken as is; a family only
puts in data and moves. Unwired screens stay in `app/src/nd4/raw/` (the raw pass).
