# sosed.place "blocks" sheets — the reference of the web's design gate (scripts/check-web-design.sh) since
# 02.10.2026, moved here from web/design/gen/dir-blocks/gen.py. Themes are data: web/themes/sosed/<id>.json.
# Flat rounded tiles, thin 1.5 line icons, Golos only. Mechanic: swipe right = like, left = hide,
# pull the card down = "peek" (details slide out from under it).
# sosed-sheets.py --theme web/themes/sosed/<id>.json --out panel/design/sheets-sosed/<id>/ -> 10 screens + behavior.svg;
# scripts/design/brand-sheets.sh does light and dark of both brands.
import os, shutil
SP=os.path.dirname(os.path.abspath(__file__))
SCR=None  # set after args

# ---------- colour maths (from v4)
def lum(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)

# ---------- themes: phase of the place (day / sunset / night) x brand (sosed warm, neighbro teal/gold)
import argparse, json
ap=argparse.ArgumentParser(); ap.add_argument("--theme",required=True); ap.add_argument("--out",required=True)
ARGS=ap.parse_args()
def load(path):
    d=json.load(open(path)); k=d["tokens"]
    return dict(id=d["id"],name=f'{d["brand"]} · {d["name"]}',scheme=d["scheme"],night=d.get("night",d["id"]),
        bg=k["bg"],panel=k["surface"],fg=k["fg"],mu=k["fg-muted"],line=k["line"],pri=k["accent"],onpri=k["accent-fg"],
        focus=k["focus"],warn=k["danger"],tiles=[k["tile-1"],k["tile-2"],k["tile-3"],k["tile-4"],k["surface-2"]],
        like=k.get("accent-text",k["accent"]),hide=k["fg-muted"],inks=d.get("tile-ink",[]))
MAIN=load(ARGS.theme)
THEMES={"main":MAIN,"night":load(os.path.join(os.path.dirname(os.path.abspath(ARGS.theme)),MAIN["night"]+".json"))}
def on(bg,th):  # best text colour on a tile
    return max(th["inks"]+[th["fg"],th["bg"]],key=lambda c:cr(c,bg))   # kit inks only
CONTRAST=[]
def need(th,what,fg,bg,lim):
    v=cr(fg,bg); CONTRAST.append((th,what,fg,bg,round(v,2),lim)); assert v>=lim,(th,what,fg,bg,v)
for n,t in THEMES.items():
    for w,f,b in (("text/bg","fg","bg"),("text/panel","fg","panel"),("muted/bg","mu","bg"),("muted/panel","mu","panel"),
                  ("error/bg","warn","bg"),("button","onpri","pri"),("like/bg","like","bg"),("hide/bg","hide","bg")):
        need(n,w,t[f],t[b],4.5)
    for i,c in enumerate(t["tiles"]): need(n,f"text/tile{i}",on(c,t),c,4.5)
    need(n,"focus/bg",t["focus"],t["bg"],3); need(n,"focus/panel",t["focus"],t["panel"],3)
    v=cr(t["pri"],t["bg"])   # kit accent as a fill on bg: reported, not asserted (owner: use the kit, report failures)
    if v<3: print(f"KIT CONTRAST FAIL {t['id']}: accent {t['pri']} on bg {t['bg']} = {v:.2f} < 3 (non-text)")

SCR=os.path.abspath(ARGS.out); os.makedirs(os.path.join(SCR,"fonts"),exist_ok=True)
shutil.copy(os.path.join(SP,"fonts","golos.ttf"),os.path.join(SCR,"fonts","golos.ttf"))
W,H=375,812; G=16
BUF=[]; TH={}; TARGETS=[]; FONTS=[]
def a(s): BUF.append(s)
def esc(s): return s.replace("&","&amp;").replace("<","&lt;")
SCALE=(14,16,20,28,40)   # 14 = captions only; body and labels >=16
TID=[0]
def T(x,y,s,size=16,fill=None,w=400,anchor="start",extra=""):
    assert size in SCALE,size; FONTS.append((size,s))
    ls=' letter-spacing="-0.01em"' if size>=28 else ""
    TID[0]+=1
    a(f'<text id="t{TID[0]}" x="{x}" y="{y}" font-family="Golos Text" font-weight="{w}" font-size="{size}" fill="{fill or TH["fg"]}" text-anchor="{anchor}"{ls} {extra}>{esc(s)}</text>')

# ---------- thin line icons, 24-grid, stroke 1.5
ICONS={
"heart":'<path d="M12 20 C5.5 15.6 3 12.2 3 8.8 A4.4 4.4 0 0 1 12 7 A4.4 4.4 0 0 1 21 8.8 C21 12.2 18.5 15.6 12 20Z"/>',
"eye":'<path d="M3 12 C6 7 18 7 21 12 C18 17 6 17 3 12Z"/><circle cx="12" cy="12" r="2.6"/>',
"eyeoff":'<path d="M3 12 C6 7 18 7 21 12 C18 17 6 17 3 12Z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 20 L20 4"/>',
"back":'<path d="M14.5 5.5 L8 12 L14.5 18.5"/>',
"fwd":'<path d="M9.5 5.5 L16 12 L9.5 18.5"/>',
"plus":'<path d="M12 5 V19 M5 12 H19"/>',
"send":'<path d="M4 12 L20 4.5 L15 20 L11.5 13Z M11.5 13 L20 4.5"/>',
"chat":'<path d="M4 6.5 A2.5 2.5 0 0 1 6.5 4 H17.5 A2.5 2.5 0 0 1 20 6.5 V14 A2.5 2.5 0 0 1 17.5 16.5 H10 L6 20 V16.5 A2.5 2.5 0 0 1 4 14Z"/>',
"me":'<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20 C5.5 15.5 18.5 15.5 19.5 20"/>',
"feed":'<rect x="4" y="4" width="7" height="9" rx="2"/><rect x="13" y="4" width="7" height="5" rx="2"/><rect x="4" y="15" width="7" height="5" rx="2"/><rect x="13" y="11" width="7" height="9" rx="2"/>',
"info":'<circle cx="12" cy="12" r="8.5"/><path d="M12 11 V16.5"/><path d="M12 7.6 V7.7" stroke-width="2.2"/>',
"close":'<path d="M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5"/>',
"clock":'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5 V12 L15 14"/>',
"pin":'<path d="M12 21 C7.5 15.5 6 12.5 6 9.5 A6 6 0 0 1 18 9.5 C18 12.5 16.5 15.5 12 21Z"/><circle cx="12" cy="9.5" r="2.2"/>',
"one":'<circle cx="12" cy="8" r="3.5"/><path d="M6.5 20 C7 15.5 17 15.5 17.5 20"/>',
"group":'<circle cx="9" cy="8.5" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3.5 19.5 C4 15 14 15 14.5 19.5 M14 15 C17.5 14.5 20.5 16 20.5 19"/>',
"party":'<path d="M4 20 L8.5 8 L16 15.5Z"/><path d="M13 4 V6 M18 6 L16.5 7.5 M20 11 H18 M11 9 L13 7"/>',
"sun":'<circle cx="12" cy="12" r="4"/><path d="M12 2.5 V4.5 M12 19.5 V21.5 M2.5 12 H4.5 M19.5 12 H21.5 M5.3 5.3 L6.7 6.7 M17.3 17.3 L18.7 18.7 M5.3 18.7 L6.7 17.3 M17.3 6.7 L18.7 5.3"/>',
"sunset":'<path d="M3 17 H21 M6 20.5 H18 M7 17 A5 5 0 0 1 17 17"/><path d="M12 4 V8 M9.5 6.5 L12 4 L14.5 6.5"/>',
"moon":'<path d="M19 14.5 A7.5 7.5 0 1 1 9.5 5 A6 6 0 0 0 19 14.5Z"/>',
"up":'<path d="M12 19 V6 M6.5 11.5 L12 6 L17.5 11.5"/>',
"down":'<path d="M12 5 V18 M6.5 12.5 L12 18 L17.5 12.5"/>',
"check":'<path d="M5 12.5 L10 17.5 L19 7"/>',
"key":'<circle cx="8" cy="12" r="4"/><path d="M12 12 H20.5 M17.5 12 V15 M20 12 V14.5"/>',
"device":'<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18 H13"/>',
"reset":'<path d="M5 12 A7 7 0 1 0 7.5 6.6"/><path d="M5 4.5 V8.5 H9"/>',
"globe":'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12 H20.5 M12 3.5 C9 7 9 17 12 20.5 C15 17 15 7 12 3.5"/>',
"pause":'<path d="M9 6 V18 M15 6 V18"/>',
"code":'<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M7 10 H9 M11 10 H13 M15 10 H17 M7 14 H17"/>',
"tag":'<path d="M4 12.5 V5 A1 1 0 0 1 5 4 H12.5 L20 11.5 L12.5 19Z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
"timer":'<circle cx="12" cy="13" r="7.5"/><path d="M12 9 V13 H15 M10 3 H14"/>',
}
def ic(x,y,name,col,s=1.0,sw=1.5):
    a(f'<g transform="translate({x} {y}) scale({s})" fill="none" stroke="{col}" stroke-width="{sw/s:.2f}" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</g>')
def button(x,y,w,h,label,fill=None,r=16,stroke=None):
    assert w>=48 and h>=48,(label,w,h); TARGETS.append((label,w,h))
    a(f'<g role="button" tabindex="0" aria-label="{esc(label)}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill or "none"}"'
      +(f' stroke="{stroke}" stroke-width="1.5"' if stroke else "")+'/>')
def end(): a('</g>')
def ibtn(x,y,name,label,fill=None,col=None,size=48,stroke=None):
    button(x,y,size,size,label,fill,r=size/2 if size<=56 else 18,stroke=stroke)
    ic(x+size/2-12,y+size/2-12,name,col or TH["fg"]); end()
def tile(x,y,w,h,fill,r=24): a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"/>')
def wrap(s,size,maxw):
    out=[""]
    for wd in s.split():
        t=(out[-1]+" "+wd).strip()
        if len(t)*size*0.53>maxw and out[-1]: out.append(wd)
        else: out[-1]=t
    return out
def para(x,y,s,size,fill,maxw,w=400,lh=None):
    lh=lh or round(size*1.35)
    for l in wrap(s,size,maxw): T(x,y,l,size,fill,w); y+=lh
    return y

STYLE=('<style>@font-face{font-family:"Golos Text";font-weight:400 700;src:url(fonts/golos.ttf)}'
       '[role=button]:focus-visible{outline:3px solid var(--focus);outline-offset:3px}</style>')
SVGS={}
def begin(theme):
    BUF.clear(); TH.clear(); TH.update(THEMES[theme])
    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" style="--focus:{TH["focus"]}"><defs>{STYLE}</defs>')
    a(f'<rect width="{W}" height="{H}" fill="{TH["bg"]}"/>')
def finish(name):
    a('</svg>'); svg="\n".join(BUF); SVGS[name]=svg
    open(os.path.join(SCR,name+".svg"),"w").write(svg)

PHASE={"light":("sun","main"),"dark":("moon","night")}
def top(title,theme,back=False):
    x=G
    if back: ibtn(G,20,"back","back"); x=G+56
    if title: T(x,54,title,28,w=600)
    p,lab=PHASE[THEMES[theme]["scheme"]]
    a(f'<g role="img" aria-label="place phase: {lab}">'); tile(311,22,48,44,TH["panel"],22); ic(323,32,p,TH["fg"]); a('</g>')
def tabbar(active):
    a(f'<rect x="{G}" y="732" width="343" height="64" rx="32" fill="{TH["panel"]}" stroke="{TH["line"]}" stroke-width="1.5"/>')
    for i,(n,l) in enumerate((("feed","feed"),("chat","chats"),("me","me"))):
        x=40+i*112
        if i==active:
            button(x-8,740,80,48,l,TH["fg"],24); ic(x+20,752,n,TH["bg"]); end()
        else: ibtn(x+8,740,n,l)
def infobtn(x,y,text): ibtn(x,y,"info","info: "+text)
def heartn(x,y,n,col):
    ic(x,y-17,"heart",col,0.75); T(x+24,y,str(n),16,col,600,extra='font-variant-numeric="tabular-nums"')

PHR=[("walking to the river, join?","one",3,"40 min"),("coffee at the corner bakery","group",1,"1 h"),("looking for a chess partner","one",0,"2 h"),
     ("lost a ginger cat by the park","one",5,"3 h"),("yard: music tonight","party",2,"25 min"),("anyone know a good handyman","one",0,"5 h")]

# ---------- screens
def s_Arrival(theme="main"):
    begin(theme); t=TH["tiles"]
    tile(G,24,200,236,TH["pri"],32); tile(224,24,135,112,t[1],32); tile(224,148,135,112,t[2],32)
    tile(G,272,135,150,t[3],32); tile(159,272,200,150,t[4],32)
    ic(36,44,"pin",TH["onpri"],2.0); T(36,228,"sosed",40,TH["onpri"],600)
    ic(267,56,"chat",on(t[1],TH),2.0); ic(267,180,"clock",on(t[2],TH),2.0); ic(59,322,"heart",on(t[3],TH),2.0)
    ic(235,322,"eyeoff",on(t[4],TH),2.0)
    T(G,486,"What neighbours",28,w=600); T(G,522,"say nearby",28,w=600)
    T(G,560,"What's said fades.",20,TH["mu"])
    ibtn(311,450,"globe","language: English",TH["panel"],stroke=TH["line"])
    button(G,652,343,64,"start",TH["pri"],32); ic(175,672,"check",TH["onpri"]); end()
    button(G,724,343,56,"restore with paper code",None,28,TH["line"]); ic(175,740,"key",TH["fg"]); end()
    finish("Arrival")

def feedgrid(theme):
    t=TH["tiles"]
    a(f'<g role="button" tabindex="0" aria-label="zone: 1 km">'); tile(G,88,140,48,TH["panel"],24)
    a(f'<rect x="{G}" y="88" width="140" height="48" rx="24" fill="none" stroke="{TH["line"]}" stroke-width="1.5"/>')
    ic(30,100,"pin",TH["fg"]); T(62,118,"1 km",16,w=600); a('</g>'); TARGETS.append(("zone",140,48))
    infobtn(311,88,"phrases fade on their own; no names before a match")
    # bento: wide, two halves, tall+two, wide
    cells=[(G,152,343,136),(G,300,165,180),(194,300,165,84),(194,396,165,84),(G,492,343,104),(G,608,255,108)]
    for i,((x,y,w,h),(txt,mode,n,left)) in enumerate(zip(cells,PHR+[PHR[0]])):
        c=t[i%len(t)]; fg=on(c,TH)
        a(f'<g role="button" tabindex="0" aria-label="phrase: {esc(txt)}{"; fading soon" if left.endswith("min") else ""}; likes {n}">'); tile(x,y,w,h,c,24); TARGETS.append(("phrase",w,h))
        size=20 if w>200 else 16
        yy=para(x+16,y+34,txt,size,fg,w-32,600 if size==20 else 500)
        if h>=100:
            ic(x+14,y+h-38,mode,fg,0.85); heartn(x+w-64,y+h-16,n,fg)
        a('</g>')
    button(287,624,72,72,"write a phrase",TH["pri"],36); ic(311,648,"plus",TH["onpri"]); end()
def s_Feed():
    begin("main"); top("Nearby","main"); feedgrid("main"); tabbar(0); finish("Feed")

def lifebar(x,y,w,left,fg,near=False):
    # foreign phrase: time is never a number; a thin bar, words only near the end
    a(f'<g role="img" aria-label="phrase life{": fading soon" if near else ""}">')
    a(f'<rect x="{x}" y="{y}" width="{w}" height="4" rx="2" fill="{fg}" opacity="0.25"/><rect x="{x}" y="{y}" width="{w*left:.0f}" height="4" rx="2" fill="{fg}"/>')
    if near: T(x,y+28,"fading soon",16,fg,500)
    a('</g>')
def card(x,y,c,txt,rot=0,peek=False,h=420):
    fg=TH["onpri"] if c==TH["pri"] else on(c,TH)   # the card wears the theme accent
    a(f'<g role="group" aria-label="phrase: {esc(txt)}. Swipe right like, left hide, down details" transform="rotate({rot} {x+171} {y+200})">')
    tile(x,y,343,h,c,32)
    a(f'<rect x="{x+147}" y="{y+12}" width="48" height="5" rx="2.5" fill="{fg}" opacity="0.55"/>')  # peek handle
    yy=para(x+24,y+92,txt,40,fg,290,600,48)
    ic(x+24,y+h-90,"one",fg); T(x+56,y+h-72,"solo",16,fg,500)
    lifebar(x+24,y+h-52,295,0.22,fg,near=True)
    a('</g>')
def cardactions(liked=False,y=640):
    ibtn(48,y,"eyeoff","hide (swipe left)",TH["panel"],TH["hide"],64,TH["line"])
    ibtn(155,y+4,"down","details (pull down)",TH["panel"],TH["fg"],56,TH["line"])
    if liked: button(263,y,64,64,"liked; undo",TH["pri"],32); ic(283,y+20,"heart",TH["onpri"]); a(f'<path transform="translate(283 {y+20})" d="{ICONS["heart"][9:-3]}" fill="{TH["onpri"]}"/>'); end()
    else: ibtn(263,y,"heart","like (swipe right)",TH["panel"],TH["like"],64,TH["line"])
def s_Card(theme="main",name="Card"):
    begin(theme); top("",theme,back=True)
    T(80,54,"1 of 6",16,TH["mu"],extra='font-variant-numeric="tabular-nums"')
    a(f'<rect x="{G+8}" y="96" width="327" height="480" rx="32" fill="{match_pair()[1]}"/>')  # next card under: 2nd Match-hero tile, harmonised per theme
    card(G,108,TH["pri"],PHR[0][0],h=480)
    cardactions(y=612); tabbar(0); finish(name)
def s_Cardliked():
    begin("main"); top("",  "main",back=True); T(80,54,"1 of 6",16,TH["mu"])
    # liked state: card stays full width, heart medallion overlaps its top-right corner
    a(f'<rect x="{G+8}" y="96" width="327" height="420" rx="32" fill="{match_pair()[1]}"/>')
    card(G,108,TH["pri"],PHR[0][0])
    a(f'<g aria-hidden="true"><circle cx="323" cy="120" r="34" fill="{TH["pri"]}" stroke="{TH["panel"]}" stroke-width="4"/>'); ic(299,96,"heart",TH["onpri"],2.0); a('</g>')
    a(f'<g role="status" aria-label="like sent; mutual means match">'); tile(G,560,343,56,TH["fg"],28)
    ic(36,576,"heart",TH["bg"]); ic(64,576,"check",TH["bg"]); T(100,594,"mutual = match",16,TH["bg"],500); a('</g>')
    cardactions(liked=True); tabbar(0); finish("Card-liked")
def s_Cardmore():
    begin("main"); top("",  "main",back=True); T(80,54,"1 of 6",16,TH["mu"])
    # peek: the details tile stays, the card slid down 236px; drag handle shows the pull
    t=TH["tiles"]
    a('<g role="region" aria-label="phrase details">')
    tile(G,92,343,236,TH["panel"],28); a(f'<rect x="{G}" y="92" width="343" height="236" rx="28" fill="none" stroke="{TH["line"]}" stroke-width="1.5"/>')
    rows=(("pin","~400 m","distance"),("one","solo","mode"),("timer",None,"time"),("heart","3","likes"))
    for i,(n,v,l) in enumerate(rows):
        x=G+16+(i%2)*164; y=108+(i//2)*104
        a(f'<g role="img" aria-label="{l}{": "+v if v else ""}">')
        tile(x,y,147,92,t[i+1] if i<3 else t[0],20); fg=on(t[i+1] if i<3 else t[0],TH)
        ic(x+14,y+14,n,fg)
        if v: T(x+14,y+72,v,20,fg,600)
        else: lifebar(x+14,y+56,119,0.22,fg)
        a('</g>')
    a('</g>')
    ibtn(163,300,"up","collapse details (card up)",TH["fg"],TH["bg"])
    card(G,358,TH["pri"],PHR[0][0],h=300)
    ibtn(48,668,"eyeoff","hide phrase from feed",TH["panel"],TH["hide"],56,TH["line"])
    ibtn(271,668,"heart","like",TH["panel"],TH["like"],56,TH["line"])
    tabbar(0); finish("Card-more")
def s_Carddark(): s_Card("night","Card-dark")

def s_Compose():
    begin("main"); top("Phrase","main",back=True)
    a(f'<g role="textbox" aria-label="phrase text, up to 146 characters">'); tile(G,92,343,200,TH["panel"],24)
    a(f'<rect x="{G}" y="92" width="343" height="200" rx="24" fill="none" stroke="{TH["focus"]}" stroke-width="2"/>')
    para(G+20,132,"walking to the river, join?",20,TH["fg"],300,500)
    T(339,276,"23 / 146",14,TH["mu"],500,"end",'font-variant-numeric="tabular-nums"'); a('</g>')
    T(G,334,"mode",14,TH["mu"],500)
    for i,(n,l) in enumerate((("one","solo"),("group","group"),("party","party"))):
        x=G+i*116; sel=i==0; c=TH["tiles"][0] if sel else TH["panel"]
        button(x,346,111,72,l+(" (selected)" if sel else ""),c,20,None if sel else TH["line"]); ic(x+43,358,n,on(c,TH)); T(x+55,406,l,14,on(c,TH),500,"middle"); end()
    T(G,454,"time",14,TH["mu"],500)
    for i,l in enumerate(("30 min","1 h","3 h","8 h")):
        x=G+i*87; sel=i==1; c=TH["tiles"][2] if sel else TH["panel"]
        button(x,466,82,52,"time "+l+(" (selected)" if sel else ""),c,26,None if sel else TH["line"]); T(x+41,498,l,16,on(c,TH),600 if sel else 400,"middle"); end()
    T(G,554,"zone",14,TH["mu"],500)
    button(G,566,343,56,"zone: 1 km around",TH["panel"],28,TH["line"]); ic(G+16,582,"pin",TH["fg"]); T(G+52,600,"1 km",16,w=600); end()
    infobtn(311,566,"seen only in your zone; no name")
    button(G,700,343,64,"publish",TH["pri"],32); ic(175,720,"send",TH["onpri"]); end()
    finish("Compose")

import colorsys
def hue(h): r,g,b=[int(h[i:i+2],16)/255 for i in (1,3,5)]; hh,l,sat=colorsys.rgb_to_hls(r,g,b); return hh*360,l,sat
def hdist(a,b): d=abs(hue(a)[0]-hue(b)[0])%360; return min(d,360-d)
def chroma(h): return hue(h)[2]>0.08
def match_pair():
    """Two of the 4 tiles for the hero: neither the accent nor near it (hue >= 30), and >= 60 apart from each other.
    Mono (no hue): the two tiles furthest in lightness from each other and from the accent."""
    acc=TH["pri"]; t=TH["tiles"][:4] if chroma(acc) else TH["tiles"][:5]; best=None   # mono may use surface-2
    for i in range(len(t)):
        for j in range(i+1,len(t)):
            a_,b_=t[i],t[j]
            if a_==acc or b_==acc: continue
            if chroma(acc) and chroma(a_):
                if min(hdist(a_,acc),hdist(b_,acc))<30 or hdist(a_,b_)<60: continue
                sc=min(hdist(a_,acc),hdist(b_,acc))+hdist(a_,b_)
            else: sc=min(cr(a_,acc),cr(b_,acc),cr(a_,b_))   # mono: maximise the weakest separation
            if best is None or sc>best[0]: best=(sc,a_,b_)
    assert best,("no tile pair for the match hero",TH["id"])
    return best[1],best[2]
HERO=[]
def s_Match():
    begin("main"); c1,c2=match_pair(); acc=TH["pri"]
    sep=lambda r:min(cr(r,c1),cr(r,c2),cr(r,acc))
    ring=TH["panel"]   # surface ring; falls back to bg/fg only when it would vanish on a card (mono)
    if min(cr(ring,c1),cr(ring,c2))<1.5: ring=max((TH["panel"],TH["bg"],TH["fg"]),key=sep)
    HERO.append((TH["id"],acc,c1,c2,round(cr(acc,ring),2),round(cr(ring,c1),2),round(cr(ring,c2),2)))
    if cr(acc,ring)<3: print(f"KIT CONTRAST FAIL {TH['id']}: accent {acc} vs ring/surface {ring} = {cr(acc,ring):.2f} < 3")
    a('<g role="img" aria-label="match: mutual like">')
    a(f'<rect x="40" y="120" width="190" height="250" rx="32" fill="{c1}" transform="rotate(-8 135 245)"/>')
    a(f'<rect x="145" y="140" width="190" height="250" rx="32" fill="{c2}" transform="rotate(7 240 265)"/>')
    for k,(dr,op) in enumerate(((14,0.05),(10,0.07),(6,0.10))):   # soft shadow as vector rings, no filter (keeps PDF vector)
        a(f'<circle cx="187" cy="{268+k}" r="{60+dr}" fill="#000000" opacity="{op}"/>')
    a(f'<circle cx="187" cy="262" r="60" fill="{ring}"/><circle cx="187" cy="262" r="56" fill="{acc}"/>')
    ic(187-28,262-28,"heart",TH["onpri"],2.33,sw=3); a('</g>')
    T(187,452,"Match",40,w=600,anchor="middle")
    a(f'<g role="group" aria-label="their phrase">'); tile(G,520,343,80,TH["panel"],24)
    T(G+20,566,PHR[1][0],20,w=500); a('</g>')
    infobtn(311,416,"names appear in chat if you both agree")
    button(G,640,343,64,"start chat",TH["pri"],32); ic(175,660,"chat",TH["onpri"]); end()
    button(G,716,343,56,"not now",None,28,TH["line"]); ic(175,732,"close",TH["fg"]); end()
    finish("Match")

def s_Chat():
    begin("main"); top("Boris","main",back=True)
    a(f'<g role="status" aria-label="chat fades after an hour of your silence">'); tile(G,84,280,48,TH["tiles"][4],24)
    ic(G+14,96,"timer",on(TH["tiles"][4],TH)); T(G+48,114,"52 min",16,on(TH["tiles"][4],TH),600); a('</g>')
    infobtn(311,84,"chat fades after an hour of your silence")
    a(f'<g role="group" aria-label="phrase you matched on">'); tile(G,148,343,64,TH["tiles"][0],20)
    ic(G+14,168,"heart",on(TH["tiles"][0],TH),0.85); T(G+48,186,PHR[1][0],16,on(TH["tiles"][0],TH),500); a('</g>')
    msgs=((0,"hi, at the bakery","17:02"),(1,"on my way","17:04"),(0,"getting two coffees","17:05"),(1,"great, thanks","17:07"))
    y=240
    for side,txt,tm in msgs:
        w=min(260,int(len(txt)*8.6)+40); x=G if side==0 else 359-w
        c=TH["panel"] if side==0 else TH["tiles"][2]; fg=on(c,TH)
        tile(x,y,w,72,c,22)
        if side==0: a(f'<rect x="{x}" y="{y}" width="{w}" height="72" rx="22" fill="none" stroke="{TH["line"]}" stroke-width="1.5"/>')
        T(x+18,y+32,txt,16,fg); T(x+18,y+56,tm,14,TH["mu"] if side==0 else fg,500,extra='font-variant-numeric="tabular-nums"'); y+=88
    a(f'<g role="textbox" aria-label="message">'); tile(G,724,271,56,TH["panel"],28)
    a(f'<rect x="{G}" y="724" width="271" height="56" rx="28" fill="none" stroke="{TH["line"]}" stroke-width="1.5"/>'); T(G+22,758,"message",16,TH["mu"]); a('</g>')
    ibtn(295,720,"send","send",TH["pri"],TH["onpri"],64)
    finish("Chat")

def s_Profile():
    # The rows in web/src/screens/Me.tsx's order (W16-SH): the name wide, then the
    # settings in pairs, then the service rows wide; what does not fit above the
    # tab bar (paper code, documents, start again) lies below the fold, as on the screen.
    begin("main"); top("Me","main"); t=TH["tiles"]; P=TH["panel"]
    items=[("me","Anya","name",t[0],(G,92,343,104)),
           ("me","28","age",t[1],(G,208,165,120)),("me","age filter","who you see",P,(194,208,165,120)),
           ("eyeoff","0","hidden",t[3],(G,340,165,120)),("eye","theme","colours",P,(194,340,165,120)),
           ("timer","step away","pause",t[2],(G,472,165,120)),("key","PIN","change",t[4],(194,472,165,120)),
           ("device","move","to another device",P,(G,604,343,88))]
    for n,v,l,c,(x,y,w,h) in items:
        button(x,y,w,h,f"{v}: {l}",c,24,None if c!=P else TH["line"]); fg=on(c,TH)
        ic(x+18,y+18 if h>100 else y+h/2-12,n,fg)
        tx=x+18 if h>100 else x+60
        T(tx,y+h-22 if h>100 else y+h/2+7,v,20,fg,600)  # caption word lives in aria-label only
        end()
    tabbar(2); finish("Profile")

# ---------- behaviour table
ROWS=[("Phrase tile (feed)","open card","—","card, 1 of N","phrase: text; fading; likes"),
("Card","—","swipe right","like; tile leaves, heart beneath","like (swipe right)"),
("Card","—","swipe left","hide; next","hide (swipe left)"),
("Card","—","pull down (peek)","details: icon + value","details (pull down)"),
("Card, release","—","release above 80 px","snaps back, details closed","—"),
("Heart under card","like","long: undo like","like / undo","like; liked, undo"),
("eye under card","hide","long: show hidden","phrase moves to hidden","hide"),
("↓ under card","peek","—","same as pull","details"),
("↑ in peek","collapse details","swipe up","card back; phrase stays","collapse details"),
("+ (feed)","new phrase","—","phrase screen","write a phrase"),
("Zone 1 km","pick radius","—","radius sheet","zone: 1 km"),
("(i)","info balloon","—","text instead of a paragraph","info: …"),
("Mode / time","pick","—","tile filled","… (selected)"),
("Publish (phrase)","publish","—","feed, phrase on top","publish"),
("Match: chat","open chat","—","chat","start chat"),
("Match: ×","not now","—","feed","not now"),
("Chat: send","message","—","bubble on right","send"),
("Profile tiles","open section","—","section screen","value: section"),
("Tab bar","section","—","feed / chats / me","feed; chats; me"),
("Place phase","—","—","theme day / sunset / night","place phase: …"),]
def behavior():
    BUF.clear(); TH.clear(); TH.update(THEMES["main"])
    cols=((24,"Element",210),(234,"Tap",170),(404,"Long / swipe",200),(604,"Result",280),(884,"a11y label",300))
    h=140+len(ROWS)*44
    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="{h}" viewBox="0 0 1200 {h}"><defs>{STYLE}</defs><rect width="1200" height="{h}" fill="{TH["bg"]}"/>')
    T(24,56,"blocks · buttons and gestures",28,w=600)
    tile(16,80,1168,44,TH["tiles"][0],12)
    for x,l,_ in cols: T(x,108,l,16,on(TH["tiles"][0],TH),600)
    for i,r in enumerate(ROWS):
        y=124+i*44
        if i%2: a(f'<rect x="16" y="{y}" width="1168" height="44" rx="10" fill="{TH["panel"]}"/>')
        for (x,_,mw),v in zip(cols,r):
            s=v if len(v)*8.4<mw else v[:int(mw/8.4)-1]+"…"
            T(x,y+28,s,16,TH["fg"] if x<884 else TH["mu"],500 if x==24 else 400)
    a('</svg>'); open(os.path.join(SCR,"behavior.svg"),"w").write("\n".join(BUF))

ORDER=[s_Arrival,s_Feed,s_Card,s_Cardliked,s_Cardmore,s_Compose,s_Match,s_Chat,s_Profile,s_Carddark]
for f in ORDER: f()
behavior()
# ---------- lens asserts
small=[s for z,s in FONTS if z<16]
assert all(len(s)<=24 for s in small),[s for s in small if len(s)>24]   # 14 only for short captions
assert all(w>=48 and h>=48 for _,w,h in TARGETS)
import re
for k,s in SVGS.items():
    if k.startswith("Card"): assert not re.search(r"\d+\s*(min|h)\b",s),(k,"foreign time as number")
OTHER={c.lower() for k,c in MAIN.items() if k!="like" and isinstance(c,str) and c.startswith("#")}|{c.lower() for c in MAIN["tiles"]}
if MAIN["like"].lower() not in OTHER:   # same hex as another token (mono greys) is not an accent-text fill
    for k,v in SVGS.items(): assert f'fill="{MAIN["like"]}"' not in v,(k,"accent-text used as a fill",MAIN["like"])
print("match hero",HERO)
for s in SVGS.values(): assert "!" not in s.split("</defs>",1)[1] and "★" not in s
print(f"screens {len(SVGS)}, targets {len(TARGETS)} (min {min(min(w,h) for _,w,h in TARGETS)}), contrast pairs {len(CONTRAST)} (min {min(c[4] for c in CONTRAST)})")
