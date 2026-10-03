# Writes web/themes/sosed/*.json from the kit only: grounds SOSED_LIGHT/SOSED_DARK (scripts/design-palettes.py:40-41,
# panel/design/kit/tokens.css .k-light/.k-dark for err), accents from panel/design/kit/schemes.css .k-*.k-acc-*.
# Mono = each kit hex replaced by the neutral grey of equal relative luminance (no hue).
# Moved here from web/design/gen/dir-blocks/make_themes.py (W15-D1); contract docs/design/themes_EN.md.
# Run: python3 scripts/design/sosed-themes.py, then scripts/design/themes-css.py.
import json, os, glob
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","..","web","themes","sosed")
# The dark line of controls, raised from the kit's border #3a2e20 (1.49:1 on the dark bg) to 3.13:1
# (9431c7d2, 03.10.2026; themes-css.py is red below 3:1). The shadow keeps the border.
DARK_LINE="#745c40"
# Mono dark's line was set by hand in the same commit; grey(DARK_LINE) would give #606060.
MONO_DARK_LINE="#5f5f5f"
SOSED_DARK=dict(bg="#0d0b0a",panel="#262019",panel2="#302720",border="#3a2e20",control="#80705a",fg="#f0e7dc",muted="#9a8d7c",err="#ef7a6a")
SOSED_LIGHT=dict(bg="#ece4d8",panel="#fdfaf4",panel2="#e6dbc9",border="#221a12",control="#857562",fg="#1c140d",muted="#6b5f4c",err="#a3311f")
ACC={ # name: (accent, ink light-ground, text light, ink dark-ground, text dark)  -- schemes.css lines 3-14
 "terra":("#bd4b2a","#fff6f0","#983c22","#fff6f0","#e0714f"),"amber":("#d68a1f","#1a1509","#8e5c15","#1a1509","#d68a1f"),
 "turquoise":("#1fa99a","#1a1509","#157369","#1a1509","#1fa99a"),"azure":("#336eb2","#fff6f0","#3068a8","#fff6f0","#528bcd"),
 "violet":("#8550c5","#fff6f0","#814ac3","#fff6f0","#9e74d1"),"carmine":("#cc2f27","#fff6f0","#c12d25","#fff6f0","#df5f59")}
INKS=["#fff6f0","#1a1509"]   # the kit's two accent inks, reused as text on tiles
TILES=["amber","turquoise","violet","azure"]
def tiles(acc): return [ACC[("terra" if t==acc else t)][0] for t in TILES]   # never the theme's own accent as a tile
def lum(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]; c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def grey(h):
    L=lum(h); v=L*12.92 if L<=0.0031308 else 1.055*L**(1/2.4)-0.055; g=round(v*255); return f"#{g:02x}{g:02x}{g:02x}"
def theme(id,name,scheme,g,acc,night,mono=False):
    a,ink,txt=(ACC[acc][0],ACC[acc][1],ACC[acc][2]) if scheme=="light" else (ACC[acc][0],ACC[acc][3],ACC[acc][4])
    t=dict(bg=g["bg"],surface=g["panel"],**{"surface-2":g["panel2"]},fg=g["fg"],**{"fg-muted":g["muted"]},line=(g["control"] if scheme=="light" else DARK_LINE),
           accent=a,**{"accent-fg":ink,"accent-text":txt},danger=g["err"],focus=txt,shadow=g["border"])
    for i,c in enumerate(tiles(acc)): t[f"tile-{i+1}"]=c
    inks=INKS
    if mono: t={k:grey(v) for k,v in t.items()}; inks=[grey(x) for x in INKS]
    if mono and scheme=="dark": t["line"]=MONO_DARK_LINE
    src="scripts/design-palettes.py SOSED_%s + schemes.css .k-%s.k-acc-%s; tiles %s"%(scheme.upper(),scheme,acc,"/".join(("terra" if x==acc else x) for x in TILES))
    if mono: src="greys of equal luminance from: "+src
    json.dump(dict(brand="sosed",id=id,name=name,scheme=scheme,source=src,tokens=t,night=night,**({"section":False} if id.startswith("dark-") else {}),**{"tile-ink":inks}),open(os.path.join(D,id+".json"),"w"),indent=1)
for f in glob.glob(os.path.join(D,"*.json")): os.remove(f)
theme("light","Light","light",SOSED_LIGHT,"terra","dark")
theme("dark","Dark","dark",SOSED_DARK,"terra","dark")
theme("mono","Mono","light",SOSED_LIGHT,"terra","mono-dark",mono=True)
theme("mono-dark","Mono dark","dark",SOSED_DARK,"terra","mono-dark",mono=True)
for acc in ("amber","turquoise","azure","violet","carmine"):
    theme(acc,acc.capitalize(),"light",SOSED_LIGHT,acc,"dark-"+acc)
    theme("dark-"+acc,acc.capitalize()+" dark","dark",SOSED_DARK,acc,"dark-"+acc)
print(sorted(os.listdir(D)))
