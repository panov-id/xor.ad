# neighbro themes from the neighbro.place landing palette (landing/index.html :root, [data-mode=light], [data-theme]).
# Exact landing hex; structure mirrors themes/sosed: one light theme per accent with its own dark-<accent> night,
# light/dark (teal) as the base pair, mono/mono-dark as equal-luminance greys of light/dark.
# Moved here from web/design/gen/dir-stickers/make_themes.py (W15-D1); writes web/themes/neighbro/*.json,
# contract docs/design/themes_EN.md. Run: python3 scripts/design/neighbro-themes.py, then scripts/design/themes-css.py.
import json, os
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","..","web","themes","neighbro")
SRC="neighbro.place landing/index.html lines 85-129"
import colorsys
def _lum(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]; c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def cool(h,hue=215,sat=0.08):
    """Owner 02.10: kill the warm hue, keep the WCAG luminance -> slate neutral."""
    lo,hi,L=0.0,1.0,_lum(h)
    for _ in range(40):
        m=(lo+hi)/2; r,g,b=colorsys.hls_to_rgb(hue/360,m,sat); c="#%02x%02x%02x"%tuple(round(v*255) for v in (r,g,b))
        lo,hi=(m,hi) if _lum(c)<L else (lo,m)
    return c
NEUTRAL_OLD={}
DARK=dict(bg="#0c0b09",surface="#14120e",**{"surface-2":"#26221a"},line="#6a5d39",fg="#ede8dd",**{"fg-muted":"#928979"},danger="#ff8a80",ok="#9ecb7a")
LIGHT=dict(bg="#e9e6dd",surface="#f4f1e8",**{"surface-2":"#ded9cc"},line="#1e1b14",fg="#181510",**{"fg-muted":"#5f5a4e"},danger="#a3311f",ok="#4b712c")
for g in (DARK,LIGHT):
    for k in ("bg","surface","surface-2","line","fg","fg-muted"): NEUTRAL_OLD[g[k]]=cool(g[k]); g[k]=NEUTRAL_OLD[g[k]]
DARK["ok"]="#7fd19a"; LIGHT["ok"]="#3f9a5c"          # clean green instead of olive #9ecb7a / #4b712c
# accent, accent-ink, accent-text dark, accent-text light
ACC={"crimson":("#cc2f27","#fdeceb","#e0625b","#b32922"),
     "teal":("#1fb39a","#04201c","#1fb39a","#126a5c"),"azure":("#336eb2","#eaf2ff","#548dce","#2d609c"),
     "violet":("#8550c5","#f3ecfd","#a077d2","#793fbe")}
def theme(acc,mode):
    g=dict(DARK if mode=="dark" else LIGHT); a,ink,td,tl=ACC[acc]
    t=dict(bg=g["bg"],surface=g["surface"],**{"surface-2":g["surface-2"]},fg=g["fg"],**{"fg-muted":g["fg-muted"]},line=g["line"],
           accent=a,**{"accent-fg":ink,"accent-text":td if mode=="dark" else tl},danger=g["danger"],focus=td if mode=="dark" else tl,shadow=g["line"])
    others=[ACC[k][0] for k in ("teal","crimson","azure","violet")]
    for i,c in enumerate(others): t[f"tile-{i+1}"]=c
    t[f"tile-{len(others)+1}"]=g["ok"]
    return t
def lum(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]; c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def grey(h):
    L=lum(h); v=L*12.92 if L<=0.0031308 else 1.055*L**(1/2.4)-0.055; x=round(v*255); return f"#{x:02x}{x:02x}{x:02x}"
for f in os.listdir(OUT):
    if f.endswith(".json"): os.remove(os.path.join(OUT,f))
INK={}
def put(i,name,scheme,tokens,night,section=True,src=SRC):
    j=dict(brand="neighbro",id=i,name=name,scheme=scheme,source=src,tokens=tokens,night=night,
           **{"tile-ink":{tokens[k]:INK[tokens[k]] for k in tokens if k.startswith("tile-") and tokens[k] in INK}})
    if not section: j["section"]=False
    json.dump(j,open(os.path.join(OUT,i+".json"),"w"),indent=1)
INK.update({v[0]:v[1] for v in ACC.values()})
put("light","Light","light",theme("teal","light"),"dark",src=SRC+" (teal)")
put("dark","Dark","dark",theme("teal","dark"),"dark",src=SRC+" (teal)")
for acc in ("crimson","azure","violet"):
    put(acc,acc.capitalize(),"light",theme(acc,"light"),"dark-"+acc,src=f"{SRC} [data-mode=light][data-theme={acc}]")
    put("dark-"+acc,acc.capitalize()+" dark","dark",theme(acc,"dark"),"dark-"+acc,section=False,src=f"{SRC} :root[data-theme={acc}]")
for i,base,sc in (("mono","light","light"),("mono-dark","dark","dark")):
    t={k:grey(v) for k,v in theme("teal",base).items() if k!="accent-gradient"}
    INK.update({grey(v[0]):grey(v[1]) for v in ACC.values()})
    cr=lambda a,b:(max(_lum(a),_lum(b))+.05)/(min(_lum(a),_lum(b))+.05)
    while cr(t["line"],t["bg"])<3:                   # rounding of the grey cost 0.01 on mono-dark: step one level away from bg
        v=int(t["line"][1:3],16)+(1 if sc=="dark" else -1); t["line"]=t["shadow"]=f"#{v:02x}{v:02x}{v:02x}"
    put(i,"Mono" if i=="mono" else "Mono dark",sc,t,"mono-dark",section=True,src="equal-luminance greys of neighbro "+base)
print(sorted(os.listdir(OUT)))

for a_,b_ in NEUTRAL_OLD.items(): print("neutral",a_,"->",b_)
