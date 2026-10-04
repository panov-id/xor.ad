# neighbro.place "stickers" sheets — the reference of the web's design gate (scripts/check-web-design.sh) since
# 02.10.2026, moved here from web/design/gen/dir-stickers/gen.py. Themes are data: web/themes/neighbro/<id>.json.
# Paper background, die-cut white borders, thin 1.5 line icons, 48+ targets, body >= 16.
# Mechanic: drag a reaction sticker from the sheet onto a card; tap sticker -> tap card as fallback.
# Usage: neighbro-sheets.py --theme web/themes/neighbro/<id>.json --out panel/design/sheets-neighbro/<id>/ [--strict]
# Writes 10 screens + behavior.svg into --out, then lens checks (asserts) run over the result.
# A theme is data (themes.md): adding a JSON file needs no edit here.
import os, re, shutil, subprocess, sys, json
D=os.path.dirname(os.path.abspath(__file__))
def arg(k,d=None): return sys.argv[sys.argv.index(k)+1] if k in sys.argv else d
THEME_FILE=os.path.abspath(arg("--theme",os.path.join(D,"..","..","web","themes","neighbro","light.json")))
OUT=os.path.abspath(arg("--out",os.path.join(D,"..","..","panel","design","sheets-neighbro",os.path.splitext(os.path.basename(THEME_FILE))[0])))
os.makedirs(os.path.join(OUT,"fonts"),exist_ok=True)
for f in ("russo.ttf","golos.ttf"): shutil.copy(os.path.join(D,"fonts",f),os.path.join(OUT,"fonts",f))

# ---------------- colour ----------------
def lum(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def cr(a_,b_):
    la,lb=sorted([lum(a_),lum(b_)],reverse=True); return (la+0.05)/(lb+0.05)
INK="#1d1a24"
# Sticker hues: deeper, cleaner multicolour. Each hue carries ink icons (>=4.5:1).
HUE=dict(coral="#f08a6c",sun="#f5c04a",mint="#7fcfa6",sky="#8ec5ec",lilac="#c3a8ec",teal="#5cc2c4",gold="#d9b450",rose="#f2a7b8")
class _Hue(dict):
    def __missing__(self,k): return k          # theme tiles are passed as hex
HUE=_Hue(HUE)
def mix(fg,bg,al):
    f=[int(fg[i:i+2],16) for i in (1,3,5)]; b=[int(bg[i:i+2],16) for i in (1,3,5)]
    return "#"+"".join(f"{round(al*x+(1-al)*y):02x}" for x,y in zip(f,b))
def load(path):
    j=json.load(open(path)); t=j["tokens"]; dark=j["scheme"]=="dark"
    tiles=[t[f"tile-{k}"] for k in range(1,6) if f"tile-{k}" in t]
    while len(tiles)<5: tiles.append(tiles[len(tiles)-4])   # tile-5 optional: reuse tile-1
    return dict(atext=t.get("accent-text",t["accent"]),id=j["id"],name=f'{j["brand"]} · {j["name"]}',scheme=j["scheme"],bg=t["bg"],panel=t["surface"],fg=t["fg"],mu=t["fg-muted"],
        pri=t["accent"],prifg=t["accent-fg"],die=(t["surface-2"] if dark else "#ffffff"),shadow=t["shadow"],line=t["line"],
        sky=(t["surface"],t["bg"]),grad=t.get("accent-gradient"),tink=j.get("tile-ink",{}),gold={t["accent"]} if t.get("accent-gradient") else set(),dot=t["surface-2"],focus=t["focus"],warn=t["danger"],stick=tuple(tiles))
THEMES={}
THEMES["main"]=load(THEME_FILE)
_night=json.load(open(THEME_FILE)).get("night")   # night pairing from the theme file (gold-light -> gold-dark)
THEMES["night"]=load(os.path.join(os.path.dirname(THEME_FILE),_night+".json")) if _night else THEMES["main"]
CONTRAST=[]
PALETTE_FAIL=[]
def ON(c,t=None):
    t=t or TH
    if c in t.get("gold",()): return t["prifg"]                # ink on metallic gold = accent-fg
    if c in t.get("tink",{}): return t["tink"][c]           # landing accent-ink for a tile that is an accent
    return max((t["fg"],t["bg"]),key=lambda x:cr(x,c))   # ink for a tile: theme fg or bg, whichever reads
def need(th,what,fg,bg,lim):
    v=cr(fg,bg); CONTRAST.append((th,what,fg,bg,v,lim))
    if v<lim: PALETTE_FAIL.append(f"{th}: {what} {fg} on {bg} = {v:.2f} < {lim}")
for n,t in THEMES.items():
    for w,f_,b_,l in (("текст/фон","fg","bg",4.5),("текст/панель","fg","panel",4.5),("вторичный/фон","mu","bg",4.5),
                      ("вторичный/панель","mu","panel",4.5),("кнопка: иконка/заливка","prifg","pri",4.5),
                      ("ошибка/панель","warn","panel",4.5),("фокус/фон","focus","bg",3),("фокус/панель","focus","panel",3),
                      ("контур/фон","line","bg",3),("кнопка/фон","pri","bg",3)):
        need(n,w,t[f_],t[b_],l)
    for k,h in enumerate(t["stick"]):
        if h not in t.get("gold",()): need(n,f"icon/tile-{k+1}",ON(h,t),h,3)   # gold tiles are checked per gradient stop
    for k,c in enumerate(t.get("grad") or ()): need(n,f"accent-fg/gold stop {k+1}",t["prifg"],c,4.5)
    for k in (1,2,3): need(n,f"text/tile-{k+1} (chip, bubble)",ON(t["stick"][k],t),t["stick"][k],4.5)

# ---------------- canvas ----------------
W,H=375,812
BUF=[]; TH={}; TARGETS=[]; TEXTS=[]; SCREEN=[None]
def a(x): BUF.append(x)
def esc(s): return s.replace("&","&amp;").replace("<","&lt;")
SCALE=(14,16,18,22,28,36)
def T(x,y,s,size=16,fill=None,cls="b",anchor="start",extra=""):
    assert size in SCALE,(s,size)
    TEXTS.append((SCREEN[0],s,size,cls)); tid=f't{len(TEXTS)}'
    a(f'<text id="{tid}" x="{x}" y="{y}" class="{cls}" font-size="{size}" fill="{fill or TH["fg"]}" text-anchor="{anchor}" {extra}>{esc(s)}</text>')

# thin line icons on a 24 grid, stroke 1.5 regardless of scale
ICONS={
"back":'<path d="M15 5 L8 12 L15 19"/>',
"close":'<path d="M6 6 L18 18 M18 6 L6 18"/>',
"pen":'<path d="M4 20 L5 15 L16 4 L20 8 L9 19Z"/><path d="M14 6 L18 10"/>',
"send":'<path d="M4 12 L20 4 L14 20 L11 13Z"/><path d="M11 13 L20 4"/>',
"eye":'<path d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12Z"/><circle cx="12" cy="12" r="3"/>',
"hide":'<path d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="M4 20 L20 4"/>',
"block":'<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6 L18.4 18.4"/>',
"feed":'<path d="M4 6 H20 M4 12 H20 M4 18 H20"/>',
"say":'<path d="M4 5 H20 V16 H10 L5 20 V16 H4Z"/>',
"me":'<circle cx="12" cy="8" r="4"/><path d="M4 21 C4 15 20 15 20 21"/>',
"info":'<circle cx="12" cy="12" r="9"/><path d="M12 11 V17"/><circle cx="12" cy="7.6" r=".6"/>',
"check":'<path d="M4 12 L10 18 L20 6"/>',
"arrive":'<rect x="12" y="3" width="9" height="18" rx="2"/><path d="M2 12 H14 M10 8 L14 12 L10 16"/>',
"key":'<circle cx="8" cy="12" r="4"/><path d="M12 12 H21 M18 12 V15 M21 12 V14"/>',
"play":'<path d="M8 5 L19 12 L8 19Z"/>',
"timer":'<circle cx="12" cy="13" r="8"/><path d="M12 9 V13 L15 15 M9 2 H15"/>',
"shield":'<path d="M12 3 L19 6 V11 C19 16 16 19 12 21 C8 19 5 16 5 11 V6Z"/><path d="M9 12 L11 14 L15 10"/>',
"end":'<path d="M5 15 C8 11 16 11 19 15 L17 17 L14 15.5 V13.5 C12.7 13.2 11.3 13.2 10 13.5 V15.5 L7 17Z"/>',
"reset":'<path d="M5 7 H19 L18 21 H6Z"/><path d="M3 7 H21 M9 7 V4 H15 V7"/>',
"later":'<path d="M6 3 H18 C18 9 13 10 12 12 C11 10 6 9 6 3Z"/><path d="M6 21 H18 C18 15 13 14 12 12 C11 14 6 15 6 21Z"/>',
"pin":'<path d="M12 22 C7 15 5 12 5 9 A7 7 0 0 1 19 9 C19 12 17 15 12 22Z"/><circle cx="12" cy="9" r="2.5"/>',
"code":'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10 V14 M10 10 V14 M13 10 V14 M16 10 V14"/>',
"undo":'<path d="M9 7 L4 12 L9 17"/><path d="M4 12 H14 A6 6 0 0 1 14 24"/>',
"grab":'<circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/>',
# reactions (no stars): heart, wave, sun, coffee, leaf
"r_heart":'<path d="M12 20 C5.5 15.5 3 12 3 8.6 A4.6 4.6 0 0 1 12 6.8 A4.6 4.6 0 0 1 21 8.6 C21 12 18.5 15.5 12 20Z"/>',
"r_wave":'<path d="M8 13 V6 A1.5 1.5 0 0 1 11 6 V12 M11 11 V4.5 A1.5 1.5 0 0 1 14 4.5 V12 M14 11 V6 A1.5 1.5 0 0 1 17 6 V14 C17 18 15 21 11 21 C8 21 6 19 4.5 16 L3.5 13 A1.4 1.4 0 0 1 6 12 L8 15"/>',
"r_sun":'<circle cx="12" cy="12" r="4"/><path d="M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.3 5.3 L7 7 M17 17 L18.7 18.7 M5.3 18.7 L7 17 M17 7 L18.7 5.3"/>',
"r_cup":'<path d="M4 9 H16 V14 A5 5 0 0 1 11 19 H9 A5 5 0 0 1 4 14Z"/><path d="M16 10 H18 A2.5 2.5 0 0 1 18 15 H16 M8 3 C7 4.5 9 5.5 8 7 M12 3 C11 4.5 13 5.5 12 7"/>',
"r_leaf":'<path d="M5 19 C5 9 11 4 20 4 C20 13 15 19 5 19Z"/><path d="M5 19 L13 11"/>',
}
REACT=[("r_heart","like")]   # owner 02.10: the node knows only like/unlike — one sticker
LABEL=dict(back="back",close="close",pen="write",send="send",hide="hide",block="block",feed="feed",say="talks",
           me="me",info="hint",check="done",arrive="move here",key="enter PIN",play="start",timer="talk term",shield="safety",
           end="end talk",reset="start over",later="not now",pin="zone",code="recovery code",undo="remove sticker",grab="heart pad",
           **{k:v for k,v in REACT})
def icon(cx,cy,name,size=24,stroke=None,sw=1.5):
    s=size/24
    a(f'<g transform="translate({cx-size/2:.1f} {cy-size/2:.1f}) scale({s:.3f})" fill="none" stroke="{stroke or TH["fg"]}" '
      f'stroke-width="{sw}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round">'
      +ICONS[name].replace("<path ",'<path vector-effect="non-scaling-stroke" ').replace("<circle ",'<circle vector-effect="non-scaling-stroke" ').replace("<rect ",'<rect vector-effect="non-scaling-stroke" ')+'</g>')
def target(x,y,w,h,label,role="button"):
    TARGETS.append((SCREEN[0],x,y,w,h,label))
    a(f'<g role="{role}" aria-label="{esc(label)}" tabindex="0">')

# ---------------- sticker primitives ----------------
def die(shape,shadow=True):
    """Die-cut: soft drop shadow, thick white border painted under the fill."""
    if TH.get("gold"): shape=re.sub(r'fill="(#[0-9a-fA-F]{6})"',lambda m:'fill="url(#gold)"' if m.group(1) in TH["gold"] else m.group(0),shape)
    if shadow: a(re.sub(r' fill="[^"]*"','',shape).replace("/>",f' transform="translate(1.5 3)" fill="{TH["shadow"]}" stroke="{TH["shadow"]}" stroke-width="10" stroke-linejoin="round"/>',1))
    a(shape.replace("/>",f' stroke="{TH["die"]}" stroke-width="7" stroke-linejoin="round" paint-order="stroke"/>',1))
def sticker(cx,cy,r,hue,ic,label=None,tilt=0,ghost=False,shadow=True):
    g=f'<g transform="rotate({tilt} {cx} {cy})"' + (' opacity=".35"' if ghost else '') + '>'
    if label: target(cx-max(r,24),cy-max(r,24),2*max(r,24),2*max(r,24),label)
    a(g); die(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{HUE[hue]}"/>',shadow)
    icon(cx,cy,ic,r*1.05,ON(HUE[hue])); a('</g>')
    if label: a('</g>')
def sticker_on_accent(cx,cy,r,ic,tilt=0):
    """A sticker placed on the accent card: the heart sticker IS the accent colour, so it goes white with a coloured icon."""
    ink=next(c for c in (TH["pri"],TH["atext"],TH["prifg"],INK) if cr(c,"#ffffff")>=3)
    a(f'<g transform="rotate({tilt} {cx} {cy})">'); die(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#ffffff"/>'); icon(cx,cy,ic,r*1.05,ink); a('</g>')
def tag(x,y,w,h,fill,tilt=0):
    a(f'<g transform="rotate({tilt} {x+w/2} {y+h/2})">'); die(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{min(h/2,14)}" fill="{fill}"/>'); a('</g>')
def card(x,y,w,h,tilt=0,fill=None):
    a(f'<g transform="rotate({tilt} {x+w/2} {y+h/2})">'); die(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="{fill or TH["panel"]}"/>'); a('</g>')

CW=0.55
def wrap(s,size,maxw):
    out=[];cur=""
    for w_ in s.split(" "):
        t_=(cur+" "+w_).strip()
        if len(t_)*size*CW>maxw and cur: out.append(cur); cur=w_
        else: cur=t_
    if cur: out.append(cur)
    return out

# ---------------- chrome ----------------
STYLE=('<style>@font-face{font-family:"Russo One";src:url(fonts/russo.ttf)}@font-face{font-family:"Golos Text";font-weight:400 700;src:url(fonts/golos.ttf)}'
       '.h{font-family:"Russo One"}.b{font-family:"Golos Text";font-weight:400}.s{font-family:"Golos Text";font-weight:600}'
       '[role=button]:focus-visible,[role=tab]:focus-visible{outline:3px solid var(--focus);outline-offset:3px}</style>')
SVGS={}
def begin(name,theme):
    BUF.clear(); TH.clear(); TH.update(THEMES[theme]); SCREEN[0]=name; INFOS.clear()
    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" style="--focus:{TH["focus"]}">')
    a(f'<defs>{STYLE}<pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="{TH["dot"]}"/></pattern>'
      f''+('<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">'+"".join(f'<stop offset="{k/(len(TH["grad"])-1):.2f}" stop-color="{c}"/>' for k,c in enumerate(TH["grad"]))+'</linearGradient>' if TH.get("grad") else "")+f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{TH["sky"][0]}"/><stop offset="1" stop-color="{TH["sky"][1]}"/></linearGradient></defs>')
    a(f'<rect width="{W}" height="{H}" fill="{TH["bg"]}"/><rect width="{W}" height="220" fill="url(#sky)"/><rect width="{W}" height="{H}" fill="url(#dots)"/>')
def end():
    if INFOS: popup()
    a('</svg>'); s="\n".join(BUF); SVGS[SCREEN[0]]=s; open(os.path.join(OUT,SCREEN[0]+".svg"),"w").write(s)
INFOS=[]
def infobtn(cx,cy,text,openit=False):
    target(cx-24,cy-24,48,48,"hint")
    a(f'<circle cx="{cx}" cy="{cy}" r="16" fill="{TH["panel"]}" stroke="{TH["line"]}" stroke-width="1.5"/>'); icon(cx,cy,"info",22); a('</g>')
    if openit: INFOS.append((cx,cy,text))
def popup():
    cx,cy,text=INFOS[0]; lines=wrap(text,16,290); h=len(lines)*24+40; y=cy+34
    a(f'<rect width="{W}" height="{H}" fill="#000" opacity=".35"/>'); card(16,y,343,h)
    target(359-48,y,48,48,"close"); icon(359-24,y+24,"close",20); a('</g>')
    yy=y+32
    for l in lines: T(32,yy,l,16); yy+=24
def phase(k):
    """Time-of-day phase of the place: a small sticker in the top bar."""
    hue,ic,lab={"day":(TH["stick"][1],"r_sun","day"),"sunset":(TH["stick"][4],"r_sun","sunset"),"night":(TH["stick"][3],"moon","night")}[k]
    if ic=="moon": ICONS["moon"]='<path d="M19 15 A8 8 0 1 1 10 4 A6.5 6.5 0 0 0 19 15Z"/>'
    a(f'<g role="img" aria-label="place phase: {lab}">'); sticker(336,40,16,hue,ic,shadow=False); a('</g>')
def topbar(title,back=False,ph=None):
    x=16
    if back:
        target(16,16,48,48,"back"); die(f'<circle cx="40" cy="40" r="22" fill="{TH["panel"]}"/>'); icon(40,40,"back",22); a('</g>'); x=76
    T(x,49,title,22,cls="h")
    phase(ph or TH_KEY[0])
    return 92
TH_KEY=["day"]
def tabbar(active):
    y=H-80; a(f'<rect x="0" y="{y}" width="{W}" height="80" fill="{TH["panel"]}"/><path d="M0 {y} H{W}" stroke="{TH["dot"]}" stroke-width="2"/>')
    for i,ic in enumerate(("feed","say","me")):
        cx=62+i*125; on=i==active
        target(cx-32,y+12,64,56,LABEL[ic],"tab")
        if on: tag(cx-30,y+18,60,44,HUE[TH["stick"][1]])
        icon(cx,y+40,ic,26,ON(TH["stick"][1]) if on else TH["fg"]); a('</g>')
def bigbtn(x,y,w,ic,label,kind="pri",h=56):
    target(x,y,w,h,label)
    fill={"pri":TH["pri"],"sec":TH["panel"]}[kind]
    die(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" fill="{fill}"/>')
    icon(x+w/2,y+h/2,ic,26,TH["prifg"] if kind=="pri" else TH["fg"]); a('</g>')
def roundbtn(cx,cy,ic,label,hue=None,r=26):
    target(cx-r,cy-r,2*r,2*r,label)
    die(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{HUE[hue] if hue else TH["panel"]}"/>'); icon(cx,cy,ic,24,ON(HUE[hue]) if hue else TH["fg"]); a('</g>')
def heartcount(x,y,n):
    icon(x+10,y-6,"r_heart",20,TH["fg"]); T(x+26,y,str(n),16,cls="s",extra='font-variant-numeric="tabular-nums"')
def stuck(x,y,items,col=None):
    """Reactions already on a card: little tilted stickers with counts."""
    for i,(ic,n) in enumerate(items):
        hue=TH["stick"][[r[0] for r in REACT].index(ic)]
        if col and HUE[hue]==TH["pri"]:            # same colour as the accent card: invert to white fill, coloured icon
            a(f'<g transform="rotate({(-8,6,-4,9)[i%4]} {x+i*64} {y})">'); die(f'<circle cx="{x+i*64}" cy="{y}" r="17" fill="#ffffff"/>',False)
            ink=next(c for c in (HUE[hue],TH["atext"],TH["prifg"],INK) if cr(c,"#ffffff")>=3)   # same hue, darker step when the fill colour is too light on white
            icon(x+i*64,y,ic,17.85,ink); a('</g>')
            need(TH["id"],"inverted sticker icon/white",ink,"#ffffff",3)
        else: sticker(x+i*64,y,17,hue,ic,tilt=(-8,6,-4,9)[i%4],shadow=False)
        T(x+i*64+27,y+6,str(n),16,col,cls="s",extra='font-variant-numeric="tabular-nums"')
def phrase(y,text,meta=True,tilt=0,reacts=(),h=None,x=16,w=343,dashed=False):
    lines=wrap(text,22,w-40); h=h or 40+len(lines)*30+(46 if (meta or reacts) else 0)
    card(x,y,w,h,tilt)
    if dashed: a(f'<rect x="{x+6}" y="{y+6}" width="{w-12}" height="{h-12}" rx="14" fill="none" stroke="{TH["pri"]}" stroke-width="2" stroke-dasharray="7 5"/>')
    a(f'<g transform="rotate({tilt} {x+w/2} {y+h/2})">')
    yy=y+44
    for l in lines: T(x+20,yy,l,22,cls="s"); yy+=30
    if reacts: stuck(x+38,yy+14,reacts)
    elif meta: T(x+20,yy+16,"solo · 300 m",16,TH["mu"])
    a('</g>'); return y+h
def tray(y,active=None,ghost=None):
    """The sticker pad: one heart on a peel-off strip (a stack of hearts behind it), 56+ target."""
    tag(12,y,351,76,TH["panel"])
    a(f'<path d="M24 {y+8} H351" stroke="{TH["dot"]}" stroke-width="1.5" stroke-dasharray="4 4"/>')
    target(12,y,40,76,"heart pad") if False else None
    for k in (2,1):                                    # the pad: hearts underneath, offset
        a(f'<circle cx="{187+k*5}" cy="{y+40-k*3}" r="24" fill="{TH["die"]}" stroke="{TH["dot"]}" stroke-width="1.5"/>')
    for i,(ic,lab) in enumerate(REACT):
        cx=187; cy=y+40
        if ghost==i: a(f'<circle cx="{cx}" cy="{cy}" r="22" fill="none" stroke="{TH["mu"]}" stroke-width="1.5" stroke-dasharray="4 4"/>'); continue
        sticker(cx,cy,22,TH["stick"][i],ic,label=lab)
        if active==i: a(f'<circle cx="{cx}" cy="{cy}" r="31" fill="none" stroke="{TH["focus"]}" stroke-width="3"/>')

# ---------------- screens ----------------
def s_Arrival():
    y=topbar("Move here")
    sticker(187,190,56,TH["stick"][3],"arrive",tilt=-6)
    infobtn(76,290,"On your current device open Transfer: it shows a nine-character code. Type it here.")
    T(16,296,"code",16,TH["mu"])
    for i,ch in enumerate("X6X T88 NQ_".replace(" ","")):
        x=16+i*38; tag(x+2,312,28,56,TH["panel"]); T(x+16,348,ch,22,cls="s",anchor="middle") if ch!="_" else None
    a(f'<rect x="{16+8*38+15}" y="324" width="2" height="32" fill="{TH["pri"]}"/>')
    bigbtn(16,400,343,"check","done")
    bigbtn(16,468,343,"back","back","sec")
def s_Feed():
    y=topbar("nearby")
    T(16,84,"1 km · 12 phrases",16,TH["mu"])
    y=phrase(108,"river walk, who's in",reacts=(("r_heart",4),),tilt=0)
    y=phrase(y+18,"chess partner wanted in the yard",reacts=(("r_heart",2),),tilt=0)
    y=phrase(y+18,"where to fix a bike nearby",meta=True,tilt=0)
    target(H and 291,H-80-16-68,68,68,"write"); die(f'<rect x="291" y="{H-80-16-68}" width="68" height="68" rx="22" fill="{TH["pri"]}"/>'); icon(325,H-80-16-34,"pen",28,TH["prifg"]); a('</g>')
    tabbar(0)
def cardscreen(theme_key,state):
    TH_KEY[0]="night" if TH["scheme"]=="dark" else theme_key
    y=topbar("phrase",back=True)
    reacts={"plain":(("r_heart",3),),"liked":(("r_heart",4),),"more":(("r_heart",3),)}[state]
    cy=y+4; ty=H-16-56-16-76; ch=272                # card hugs its content; the next phrase peeks below it
    py=cy+ch+14
    a(f'<g opacity=".55" role="img" aria-label="next phrase">'); ph=(ty-16-py-14)/2
    for k,(t1,m1) in enumerate((("chess partner wanted","solo · 1 km"),("where to fix a bike","solo · 300 m"))):
        q=py+k*(ph+14); card(16,q,343,ph); T(36,q+38,t1,22,cls="s"); T(36,q+66,m1,16,TH["mu"])
    a('</g>')
    card(16,cy,343,ch,fill=TH["pri"])                # the big card wears the theme accent (as in sosed)
    if state=="more": a(f'<rect x="22" y="{cy+6}" width="331" height="{ch-12}" rx="14" fill="none" stroke="{TH["prifg"]}" stroke-width="2" stroke-dasharray="7 5"/>')
    yy=cy+52
    yy+=8
    for l in wrap("river walk, bringing tea",36,300): T(36,yy,l,36,TH["prifg"],cls="s"); yy+=46
    T(36,yy+4,"solo · 300 m",16,TH["prifg"])
    by=cy+ch-36                                     # card footer: reactions left, hint right, anchored to the row
    stuck(54,by,reacts,TH["prifg"])
    infobtn(327,by,"The author sees your sticker. If they stick one back on your phrase, it is a match and names open.")
    if state=="liked":
        sticker_on_accent(290,cy+ch-90,34,"r_heart",tilt=12)
    if state=="more":
        sx,sy=187,ty+14; dx,dy=290,cy+ch-90
        a(f'<path d="M{sx} {sy+4} Q{sx} {ty-8} {sx+24} {ty-8} H{dx-20} Q{dx} {ty-8} {dx} {ty-28} V{dy+42}" fill="none" stroke="{TH["pri"]}" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>')
        a('<g role="img" aria-label="heart sticker over the card">'); sticker_on_accent(dx,dy,38,"r_heart",tilt=-10); a('</g>')
        tray(ty,ghost=0)
        tag(16,H-16-56,343,56,TH["panel"]); icon(48,H-16-28,"grab",22,TH["mu"]); T(72,H-16-22,"drop on the phrase, or tap it",16,TH["mu"])
    else:
        tray(ty)
        y2=H-16-56
        roundbtn(44,y2+28,"hide","hide"); roundbtn(108,y2+28,"block","block")
        if state=="liked":
            target(156,y2,203,56,"remove sticker"); die(f'<rect x="156" y="{y2}" width="203" height="56" rx="28" fill="{TH["panel"]}"/>'); icon(236,y2+28,"undo",24); T(258,y2+34,"5 s",16,cls="s",extra='font-variant-numeric="tabular-nums"'); a('</g>')
        else: bigbtn(156,y2,203,"grab","heart pad")
def s_Card(): cardscreen("day","plain")
def s_Cardliked(): cardscreen("day","liked")
def s_Cardmore(): cardscreen("day","more")
def s_Carddark(): cardscreen("night","plain")
def s_Compose():
    TH_KEY[0]="night" if TH["scheme"]=="dark" else "day"; y=topbar("new phrase",back=True)
    card(16,y,343,190); T(32,y+44,"walking by the river,",22,cls="s"); T(32,y+74,"anyone near",22,cls="s"); a(f'<rect x="160" y="{y+52}" width="2" height="28" fill="{TH["pri"]}"/>')
    T(343,y+172,"91",16,TH["mu"],anchor="end",extra='font-variant-numeric="tabular-nums"')
    y+=214; T(16,y,"mode",16,TH["mu"])
    for i,(lab,on) in enumerate((("solo",1),("group",0),("party",0))):
        x=16+i*117; target(x,y+12,109,48,lab)
        tag(x,y+12,109,48,HUE[TH["stick"][1]] if on else TH["panel"],tilt=(-2 if on else 0)); T(x+54,y+43,lab,16,ON(TH["stick"][1]) if on else TH["fg"],"s" if on else "b","middle"); a('</g>')
    y+=92; T(16,y,"zone",16,TH["mu"]); infobtn(80,y-6,"Same point and radius link your phrases together.")
    for i,lab in enumerate(("100 m","300 m","1 km","3 km")):
        x=16+i*(343+8)/4; on=lab=="1 km"; target(x,y+18,79.75,48,lab)
        tag(x,y+18,79.75,48,HUE[TH["stick"][2]] if on else TH["panel"]); T(x+39.9,y+49,lab,16,ON(TH["stick"][2]) if on else TH["fg"],"s" if on else "b","middle"); a('</g>')
    bigbtn(16,H-16-56,343,"send","send")
import colorsys
def _hls(c): return colorsys.rgb_to_hls(*[int(c[i:i+2],16)/255 for i in (1,3,5)])
def hue_gap(a_,b_):
    d=abs(_hls(a_)[0]-_hls(b_)[0])*360; return min(d,360-d)
HEROES=[]
def hero(cx,cy):
    """Match hero: two solid stickers (accent + the first sticker colour >= 60 deg away), white die-cut ring,
    soft translucent shadow, small overlap so no colour mixes. Mono has no hue: pick the most different grey."""
    A=TH["pri"]; mono=all(_hls(c)[2]<0.02 for c in (A,)+tuple(TH["stick"]))
    cand=[c for c in TH["stick"] if c!=A]
    B=max(cand,key=lambda c:abs(lum(c)-lum(A))) if mono else next(c for c in cand if hue_gap(A,c)>=60)
    if not mono: assert hue_gap(A,B)>=60,(A,B)
    HEROES.append((TH["id"],A,B))
    for x,c,ic,t in ((cx-38,A,"r_heart",-8),(cx+38,B,"r_heart",8)):
        a(f'<g transform="rotate({t} {x} {cy})"><circle cx="{x+2}" cy="{cy+6}" r="56" fill="#000000" opacity=".18"/>'
          f'<circle cx="{x}" cy="{cy}" r="52" fill="{c}" stroke="#ffffff" stroke-width="8" paint-order="stroke"/>')
        icon(x,cy,ic,52,TH["prifg"] if c==A else ON(c)); a('</g>')
def s_Match():
    TH_KEY[0]="night" if TH["scheme"]=="dark" else "sunset"; y=topbar("match",back=True)
    hero(187,y+96)
    T(187,y+196,"Boris, 31",28,cls="h",anchor="middle")
    y=phrase(y+226,"walking by the river, anyone near",meta=False,reacts=(("r_heart",1),),tilt=0)
    y=phrase(y+14,"river walk, who's in",meta=False,reacts=(("r_heart",1),),tilt=0)
    infobtn(335,H-16-56-68+28,"A talk opens when both agree. Its keys are born on your two devices; the node never sees them.")
    bigbtn(16,H-16-56-68,279,"say","talk"); bigbtn(16,H-16-56,343,"later","not now","sec")
def s_Chat():
    TH_KEY[0]="night" if TH["scheme"]=="dark" else "sunset"; y=topbar("Anya, 28",back=True)
    roundbtn(270,40,"shield","safety")
    tag(16,y,343,56,TH["panel"]); icon(44,y+28,"timer",24); T(66,y+34,"1 h",16,cls="s"); infobtn(331,y+28,"The talk fades after an hour of your silence.")
    target(16,y,280,56,"talk term"); a(f'<rect x="16" y="{y}" width="280" height="56" fill="none"/></g>')
    def bub(y,text,mine,react=None):
        lines=wrap(text,18,230); w=max(len(l) for l in lines)*18*CW+40; h=len(lines)*26+26
        x=359-w if mine else 16
        die(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="20" fill="{HUE[TH["stick"][3]] if mine else TH["panel"]}"/>')
        yy=y+30
        for l in lines: T(x+20,yy,l,18,ON(TH["stick"][3]) if mine else TH["fg"]); yy+=26
        if react: sticker(x+w-6 if not mine else x+6,y+h-4,14,TH["stick"][0],react,tilt=10,shadow=False)
        return y+h+(30 if react else 18)
    y+=84; y=bub(y,"hi, at the river yet",False); y=bub(y,"yes, by the bridge, with tea",True); y=bub(y,"on my way, ten minutes",False)
    ry=H-16-56
    a(f'<rect x="16" y="{ry}" width="279" height="56" rx="28" fill="{TH["panel"]}" stroke="{TH["line"]}" stroke-width="1.5"/>'); T(40,ry+34,"message",16,TH["mu"])
    roundbtn(331,ry+28,"send","send",hue=None,r=28)
def s_Profile():
    TH_KEY[0]="night" if TH["scheme"]=="dark" else "day"; y=topbar("me")
    sticker(70,y+50,44,TH["stick"][4],"me",tilt=-6); T(130,y+44,"Anya, 28",22,cls="h"); T(130,y+70,"shown after a match only",16,TH["mu"])
    y+=126
    # The rows in web/src/screens/Me.tsx's order after name and age (W16-SH). Five,
    # as before: the hero above them is the sheet's own, so two more rows sit lower
    # than the screen's and measured worse (14.09% against 12.57%, 04.10.2026).
    for i,(ic,lab) in enumerate((("me","age filter"),("hide","hidden · 0"),("eye","theme"),("timer","step away"),("key","change PIN"))):
        target(16,y,343,56,lab); tag(16,y,343,56,TH["panel"])
        sticker(46,y+28,16,TH["stick"][i%5],ic,shadow=False); T(76,y+34,lab,16,TH["warn"] if ic=="reset" else TH["fg"])
        icon(337,y+28,"back",18,TH["mu"]) if False else a(f'<path d="M334 {y+21} L341 {y+28} L334 {y+35}" fill="none" stroke="{TH["mu"]}" stroke-width="1.5" stroke-linecap="round"/>')
        a('</g>'); y+=68
    tabbar(2)

SCREENS=[("Arrival","main",s_Arrival),("Feed","main",s_Feed),("Card","main",s_Card),("Card-liked","main",s_Cardliked),("Card-more","main",s_Cardmore),
         ("Compose","main",s_Compose),("Match","main",s_Match),("Chat","main",s_Chat),("Profile","main",s_Profile),("Card-dark","night",s_Carddark)]
for nm,th,fn in SCREENS:
    begin(nm,th); TH_KEY[0]="night" if TH["scheme"]=="dark" else "day"; fn(); end()

# ---------------- behavior.svg ----------------
ROWS=[("heart pad (button)","open the pad","—","heart pad above the buttons","heart pad"),
 ("heart sticker","select (focus ring) → tap phrase sticks","drag onto phrase","like sent, heart on phrase, undo 5 s","like"),
 ("heart: keyboard","Enter/Space picks, Enter on phrase","—","same as drag (WCAG 2.5.7)","as above"),
 ("heart over phrase","—","drop outside phrase","back to the pad, nothing sent","—"),
 ("remove heart","unlike within 5 s","—","heart returns to the pad","remove heart"),
 ("phrase in feed","open card","long-press → heart pad","Card screen","phrase text"),
 ("hide","hide phrase","—","phrase leaves feed","hide"),
 ("block","confirm: yes / cancel","—","author hidden for good","block"),
 ("(i) button","open hint","—","balloon on top, close button","hint"),
 ("write","new phrase","—","Compose screen","write"),
 ("mode / zone","select","—","selected tag sticker","solo / group / … / 1 km"),
 ("send","publish","—","phrase in feed","send"),
 ("talk","offer a talk","—","waiting for the other","talk"),
 ("not now","close match","—","match kept in talks","not now"),
 ("talk term","pick term","—","10 min / 30 min / 1 h / while talking","talk term"),
 ("safety","keys, report, block","—","action sheet","safety"),
 ("tabs","feed / talks / me","—","switch section","feed / talks / me"),
 ("back","previous screen","swipe from left edge","—","back")]
BUF.clear(); TH.clear(); TH.update(THEMES["main"]); SCREEN[0]="behavior"
cols=(("element",210),("tap",300),("long-press / swipe / drag",250),("result",290),("a11y label",290)); BW=sum(w for _,w in cols)+32; BH=110+len(ROWS)*56+20
a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{BW}" height="{BH}" viewBox="0 0 {BW} {BH}"><defs>{STYLE}</defs><rect width="{BW}" height="{BH}" fill="{TH["bg"]}"/>')
T(16,48,"stickers · element behaviour",28,cls="h")
x=16
for c,w in cols: T(x+8,92,c,16,TH["mu"],"s"); x+=w
for i,row in enumerate(ROWS):
    y=106+i*56; a(f'<rect x="16" y="{y}" width="{BW-32}" height="52" rx="10" fill="{TH["panel"] if i%2==0 else TH["bg"]}"/>'); x=16
    for (c,w),v in zip(cols,row):
        ls=wrap(v,16,w-16)[:2]
        for j,l in enumerate(ls): T(x+8,y+(32 if len(ls)==1 else 22+j*20),l,16 if len(ls)==1 else 14)
        x+=w
a('</svg>'); open(os.path.join(OUT,"behavior.svg"),"w").write("\n".join(BUF))

# ---------------- lens checks (machine) ----------------
PROBLEMS=[]
for sc,x,y,w,h,lab in TARGETS:
    if min(w,h)<48: PROBLEMS.append(f"{sc}: цель «{lab}» {w}x{h} < 48")
    if not lab: PROBLEMS.append(f"{sc}: цель без aria-label")
    if x<0 or y<0 or x+w>W or y+h>H: PROBLEMS.append(f"{sc}: цель «{lab}» за краем экрана")
for sc,s,size,cls in TEXTS:
    if sc!="behavior" and cls=="b" and size<16: PROBLEMS.append(f"{sc}: текст «{s}» {size} < 16")
    if "!" in s: PROBLEMS.append(f"{sc}: восклицание словом «{s}»")
for nm,s in SVGS.items():
    if "Boris" in s and nm not in ("Match",): PROBLEMS.append(f"{nm}: имя до мэтча")
    if re.search(r'stroke-width="(2\.5|3|2)"[^>]*vector-effect',s): PROBLEMS.append(f"{nm}: толстая иконка")
# overlaps between targets on the same screen
for i,(sc,x,y,w,h,lab) in enumerate(TARGETS):
    for sc2,x2,y2,w2,h2,lab2 in TARGETS[i+1:]:
        if sc==sc2 and x<x2+w2 and x2<x+w and y<y2+h2 and y2<y+h: PROBLEMS.append(f"{sc}: цели «{lab}» и «{lab2}» перекрываются")
for p in PALETTE_FAIL: print("  PALETTE (kit colour kept, reported):",p)
print(f"palette_fails={len(PALETTE_FAIL)} screens={len(SVGS)} targets={len(TARGETS)} contrast_pairs={len(CONTRAST)} problems={len(PROBLEMS)}")
for p in PROBLEMS: print("  -",p)
if "--strict" in sys.argv: assert not PROBLEMS
