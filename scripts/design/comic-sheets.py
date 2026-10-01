#!/usr/bin/env python3
"""The comic face's mocks (owner 2026-10-01): the overview sheet web/design/comic-2026-10-01.svg and one
375x812 sheet per web screen in panel/design/sheets-comic/<Screen>[-dark|-neighbro].svg — the reference
of scripts/check-web-design.sh since 02.10.2026.

    scripts/design/comic-sheets.py           # write them
    scripts/design/comic-sheets.py --check   # exit 1 if any written file differs from what this would write

Fonts: Russo One and Golos Text 500 (OFL) from panel/design/fonts — embedded in the overview, referenced
as /fonts/<file> by the screen sheets (served by scripts/design/render-comic-sheets.sh)."""
import base64, math, os, re, sys, tempfile
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS=os.path.join(ROOT,"panel/design/fonts")
FONT={"russo.ttf":"comic-russo-one.ttf","golos.ttf":"comic-golos-500.ttf"}
CHECK="--check" in sys.argv
STAGE=tempfile.mkdtemp() if CHECK else None
def target(path):
    # in --check mode everything is written under a temp dir and compared afterwards
    return os.path.join(STAGE, os.path.relpath(path, ROOT)) if CHECK else path
def write(path, text):
    t=target(path); os.makedirs(os.path.dirname(t), exist_ok=True); open(t,"w").write(text)
OUT=os.path.join(ROOT,"web/design/comic-2026-10-01.svg")
def b64(f): return base64.b64encode(open(os.path.join(FONTS,FONT[f]),'rb').read()).decode()
INK="#141018"; PAPER="#fffaf0"; SKY="#f6efe2"; OR="#bd4b2a"; PK="#bd4b2a"; TL="#bd4b2a"; YL="#d9b766"; WH="#ffffff"
GOLD0="#b8893b"; GOLD1="#e9cf8a"; SEA="#0f6f86"
NBG="#0e1324"; NPN="#18203a"; NFG="#f3ead8"; NPK="#d9b766"; NTL="#d9b766"; MU="#5a4e44"; NMU="#b9b2a2"
def lum(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)
PAIRS=[("ink / бумага",INK,PAPER),("ink / крем",INK,SKY),("серый / крем",MU,SKY),("бумага / терракота",PAPER,OR),
       ("ink / золото тёмное #b8893b",INK,GOLD0),("ink / золото среднее #d9b766",INK,YL),("ink / золото светлое #e9cf8a",INK,GOLD1),
       ("ночь: текст / фон #0e1324",NFG,NBG),("ночь: текст / панель #18203a",NFG,NPN),("ночь: серый / фон",NMU,NBG),("ночь: серый / панель",NMU,NPN),
       ("ночь: золото / фон",YL,NBG),("ночь: золото тёмное / фон",GOLD0,NBG),("neighbro: бумага / море #0f6f86",PAPER,SEA),("предупреждение / крем","#a3311f",SKY)]
for n,a,b in PAIRS: assert cr(a,b)>=4.5,(n,cr(a,b))
W,H=375,812; G=40
COLS=4; SW=G+COLS*(W+G)
TOP=420; ROWH=H+70
ICONY=TOP+3*ROWH+150+740; QY=ICONY+60+7*110+30; SH=QY+760
BUF=[[]]
def a(x): BUF[-1].append(x)
def clean(t):
    t=re.sub(r'<rect[^>]*fill="url\(#(dotPk|dotNt|dotOr|dsosed|dneighbro)\)"[^>]*opacity="[^"]*"[^>]*/>','',t)
    t=re.sub(r'fill="url\(#(dotInk|dotInkN|sh|ssosed|sneighbro)\)"','fill="#141018"',t)
    t=re.sub(r'fill="url\(#(dotOr|dsosed|dneighbro)\)"','fill="#efe6d2"',t)
    t=t.replace('fill="#d9b766"','fill="url(#gold)"').replace('stroke="#d9b766"','stroke="#b8893b"')
    t=re.sub(r'stroke-width="(3|3\.0|3\.5|4|4\.0)"','stroke-width="2.5"',t)
    t=re.sub(r'rotate\((-?[0-9.]+) ([0-9.]+) ([0-9.]+)\)',lambda m:'rotate(0 '+m.group(2)+' '+m.group(3)+')' if True else m.group(0),t)
    t=t.replace('translate(5 5)','translate(4 4)').replace('translate(6 6)','translate(4 4)')
    return t
def esc(s): return s.replace("&","&amp;").replace("<","&lt;")
def T(x,y,s,size=15,fill=INK,cls="b",anchor="start",extra=""):
    if cls=="h": size=round(size*0.9,1)
    a(f'<text x="{x}" y="{y}" class="{cls}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" {extra}>{esc(s)}</text>')
def panel(x,y,w,h,fill=PAPER,cut=16,shadow=INK,rot=0,stroke=INK,sw=2.5):
    rot=0
    pts=lambda dx,dy:f"{x+dx},{y+dy} {x+w-cut+dx},{y+dy} {x+w+dx},{y+cut+dy} {x+w+dx},{y+h+dy} {x+dx},{y+h+dy}"
    g=f'<g transform="rotate({rot} {x+w/2} {y+h/2})">' if rot else '<g>'
    a(g+f'<polygon points="{pts(4,4)}" fill="{shadow}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"/>'
      f'<polygon points="{pts(0,0)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"/>'
      f'<polygon points="{x+4},{y+4} {x+w-cut+2},{y+4} {x+w-4},{y+cut-2} {x+w-4},{y+h-4} {x+4},{y+h-4}" fill="none" stroke="url(#gold)" stroke-width="1"/></g>')
def burst(cx,cy,r,fill=YL,n=12,inner=.62,stroke=INK,sw=2.5):
    # gold medallion: foil disc, thin double rim; a non-gold fill becomes the centre
    R=r*0.8
    a(f'<circle cx="{cx+3}" cy="{cy+3}" r="{R:.1f}" fill="{INK}"/><circle cx="{cx}" cy="{cy}" r="{R:.1f}" fill="url(#gold)" stroke="{INK}" stroke-width="2.5"/>')
    a(f'<circle cx="{cx}" cy="{cy}" r="{R-3.5:.1f}" fill="none" stroke="#7a5a22" stroke-width="1"/><circle cx="{cx}" cy="{cy}" r="{R-6:.1f}" fill="{fill if fill not in (YL,"#d9b766") else "none"}" stroke="#fff2cc" stroke-width="1"/>')
def sym(cx,cy,kind,r,fill=None):
    if kind=="heart":
        a(f'<path transform="translate({cx-r} {cy-r}) scale({r/12})" d="M12 21 C5 16 2 12.5 2 8.5 A5 5 0 0 1 12 6.5 A5 5 0 0 1 22 8.5 C22 12.5 19 16 12 21Z" fill="{fill or PK}" stroke="{INK}" stroke-width="{36/r}" stroke-linejoin="round"/>')
    else:
        burst(cx,cy,r*1.3); sym(cx,cy+1,"heart",r*0.55,fill=PK); return
        for i in range(10):
            rr=r if i%2==0 else r*.45; t=math.pi*i/5-math.pi/2; p.append(f"{cx+rr*math.cos(t):.1f},{cy+rr*math.sin(t):.1f}")
        a(f'<polygon points="{" ".join(p)}" fill="{fill or PK}" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>')
ICONS={
"back":'<path d="M15 5 L8 12 L15 19"/>',
"hide":'<path class="f" d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="M4 20 L20 4"/>',
"block":'<circle class="f" cx="12" cy="12" r="9"/><path d="M5.6 5.6 L18.4 18.4"/>',
"pen":'<path class="f" d="M4 20 L5 15 L16 4 L20 8 L9 19Z"/><path d="M14 6 L18 10"/>',
"plus":'<path d="M12 5 V19 M5 12 H19"/>',
"likes":'<path class="f" d="M10 21 C4 16.5 2 13.5 2 10.5 A4 4 0 0 1 10 8.8 A4 4 0 0 1 18 10.5 C18 13.5 16 16.5 10 21Z"/><path d="M19 2 V8 M16.5 4.5 L19 2 L21.5 4.5"/>',
"send":'<path class="f" d="M4 12 L20 4 L14 20 L11 13Z"/><path d="M11 13 L20 4"/>',
"end":'<path class="f" d="M5 15 C8 11 16 11 19 15 L17 17 L14 15.5 V13.5 C12.7 13.2 11.3 13.2 10 13.5 V15.5 L7 17Z"/>',
"key":'<circle class="f" cx="8" cy="12" r="4"/><path d="M12 12 H21 M18 12 V15 M21 12 V14"/>',
"shield":'<path class="f" d="M12 3 L19 6 V11 C19 16 16 19 12 21 C8 19 5 16 5 11 V6Z"/><path d="M9 12 L11 14 L15 10"/>',
"dice":'<rect class="f" x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="#141018"/><circle cx="15" cy="15" r="1" fill="#141018"/><circle cx="15" cy="9" r="1" fill="#141018"/><circle cx="9" cy="15" r="1" fill="#141018"/>',
"play":'<path class="f" d="M8 5 L19 12 L8 19Z"/>',
"flag":'<path class="f" d="M5 4 H17 L14 8.5 L17 13 H5Z"/><path d="M5 21 V4"/>',
"stand":'<path d="M10 4 H5 V20 H10"/><path d="M14 8 L18 12 L14 16 M18 12 H9"/>',
"refresh":'<path d="M20 12 A8 8 0 1 1 17.7 6.3"/><path d="M20 4 V9 H15"/>',
"open":'<path d="M5 12 H18 M13 7 L18 12 L13 17"/>',
"say":'<path class="f" d="M4 5 H20 V16 H10 L5 20 V16 H4Z"/>',
"timer":'<circle class="f" cx="12" cy="13" r="8"/><path d="M12 9 V13 L15 15 M9 2 H15"/>',
}
ACTIONS=[("назад","back",PAPER),("лайк","boom",YL),("скрыть","hide",PAPER),("блок","block",PK),("написать","pen",YL),("новое","plus",OR),
 ("кто лайкнул","likes",YL),("отправить","send",TL),("завершить","end",PK),("ключ / вход","key",YL),("согласие","shield",TL),("случайно","dice",PAPER),
 ("смотреть","play",OR),("жалоба","flag",PK),("выйти","stand",PAPER),("обновить","refresh",TL),("открыть","open",OR),("сказать","say",PAPER)]
ICONS['check']='<path d="M4 12 L10 18 L20 6"/>'
ICONS['arrive']='<rect class="f" x="12" y="3" width="9" height="18" rx="2"/><path d="M2 12 H14 M10 8 L14 12 L10 16"/>'
ICONS['queue']='<rect class="f" x="4" y="4" width="16" height="5"/><rect class="f" x="4" y="11" width="11" height="5"/><path d="M4 20 H11 M15 18 L19 20 L15 22"/>'
ICONS['code']='<rect class="f" x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10 V14 M10 10 V14 M13 10 V14 M16 10 V14"/>'
ICONS['reset']='<path class="f" d="M5 7 H19 L18 21 H6Z"/><path d="M3 7 H21 M9 7 V4 H15 V7 M10 11 V17 M14 11 V17"/>'
ICONS['forget']='<rect class="f" x="6" y="2" width="12" height="20" rx="2"/><path d="M9 9 L15 15 M15 9 L9 15"/>'
ICONS['giveup']='<path class="f" d="M6 4 C10 2 13 6 19 4 V12 C13 14 10 10 6 12Z"/><path d="M6 21 V3"/>'
ICONS['pass']='<path class="f" d="M4 5 L13 12 L4 19Z"/><path d="M18 5 V19"/>'
ICONS['unblock']='<rect class="f" x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11 V7 A4 4 0 0 1 16 6"/>'
ICONS['link']='<path d="M9 15 L15 9"/><path d="M8 11 L5 14 A3.5 3.5 0 0 0 10 19 L13 16"/><path d="M16 13 L19 10 A3.5 3.5 0 0 0 14 5 L11 8"/>'
ICONS['mail']='<rect class="f" x="3" y="6" width="18" height="13" rx="1"/><path d="M3 7 L12 13 L21 7"/>'
ICONS['pin']='<path class="f" d="M12 22 C7 15 5 12 5 9 A7 7 0 0 1 19 9 C19 12 17 15 12 22Z"/><circle cx="12" cy="9" r="2.5"/>'
ICONS['close']='<path d="M6 6 L18 18 M18 6 L6 18"/>'
ICONS['eye']='<path class="f" d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12Z"/><circle cx="12" cy="12" r="3"/>'
ICONS['table']='<path class="f" d="M3 8 H21 V11 H3Z"/><path d="M6 11 V19 M18 11 V19 M5 15 H19"/>'
ICONS['feed']='<path d="M4 6 H20 M4 12 H20 M4 18 H20"/>'
ICONS['me']='<circle class="f" cx="12" cy="8" r="4"/><path class="f" d="M4 21 C4 15 20 15 20 21Z"/>'
ICONS['later']='<path class="f" d="M6 3 H18 C18 9 13 10 12 12 C11 10 6 9 6 3Z"/><path class="f" d="M6 21 H18 C18 15 13 14 12 12 C11 14 6 15 6 21Z"/>'
ICONS['venue']='<path class="f" d="M3 9 L5 4 H19 L21 9Z"/><path class="f" d="M5 9 V20 H19 V9"/><path d="M10 20 V14 H14 V20"/>'
ICONS['offers']='<path class="f" d="M3 12 V4 H11 L21 14 L13 22Z"/><circle cx="7.5" cy="8" r="1.5"/>'
ICONS['d_house']='<path class="f" d="M3 11 L12 3 L21 11 V21 H3Z"/><path d="M10 21 V15 H14 V21"/>'
ICONS['d_kettle']='<path class="f" d="M5 9 H17 L16 20 H6Z"/><path d="M17 11 H20 L17 16 M9 9 V6 H13 V9 M10 4 H12"/>'
ICONS['d_domino']='<rect class="f" x="8" y="2" width="8" height="20" rx="1.5"/><path d="M8 12 H16"/><circle cx="12" cy="7" r="1" fill="#141018"/><circle cx="10" cy="15" r="1" fill="#141018"/><circle cx="14" cy="19" r="1" fill="#141018"/>'
ICONS['d_knight']='<path class="f" d="M7 21 H17 L16 17 C17 13 17 8 13 4 L11 3 L10 6 L6 9 L7 12 L10 11 L8 17Z"/>'
ICONS['d_bike']='<circle class="f" cx="6" cy="16" r="4"/><circle class="f" cx="18" cy="16" r="4"/><path d="M6 16 L10 9 H16 L18 16 M10 9 L13 16 H6 M15 6 H18"/>'
ICONS['d_cat']='<path class="f" d="M4 20 V8 L7 4 L10 8 H14 L17 4 L20 8 V20Z"/><path d="M9 13 H10 M14 13 H15 M10 16 Q12 18 14 16"/>'
ICONS['d_tree']='<path class="f" d="M12 3 C6 3 4 9 6 13 C8 16 16 16 18 13 C20 9 18 3 12 3Z"/><path d="M12 9 V21"/>'
ICONS["info"]='<circle class="f" cx="12" cy="12" r="9"/><path d="M12 11 V17"/><circle cx="12" cy="7.5" r="1.3" fill="#141018"/>'
ACTIONS+=[("инфо → баллон","info",TL),("готово / дальше","check",TL),("перенести сюда","arrive",YL),("в очередь","queue",PAPER),("показать код","code",YL),("начать заново","reset",PK),
 ("забыть устройство","forget",PK),("сдаться","giveup",PAPER),("пас","pass",TL),("снять блок","unblock",YL),("получить ссылку","link",PAPER),("заказать конверт","mail",YL),
 ("сдвинуть точку","pin",PK),("отмена","close",PAPER),("предпросмотр","eye",TL),("новый стол","table",OR),("лента","feed",PAPER),("я","me",YL),("не сейчас","later",YL),
 ("заведения","venue",OR),("мои офферы","offers",PK)]
def icon(x,y,name,fill,s=1.0,bg=None):
    # x,y = top-left of 44x44 hit zone
    if name=="boom":
        burst(x+22,y+22,21*s); sym(x+22,y+23,"heart",8*s,fill=PK); return
    if bg: a(f'<rect x="{x+2}" y="{y+2}" width="40" height="40" rx="6" fill="{bg}" stroke="{INK}" stroke-width="3"/>')
    a(f'<g transform="translate({x+22-12*s*1.2} {y+22-12*s*1.2}) scale({1.2*s})" fill="none" stroke="{INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="--f:{fill}">{ICONS[name].replace(chr(34)+"f"+chr(34), chr(34)+"f"+chr(34)+" fill="+chr(34)+fill+chr(34))}</g>')
def iconbtn(x,y,name,fill):
    a(f'<rect x="{x+4}" y="{y+4}" width="44" height="44" fill="{INK}"/>')
    a(f'<rect x="{x}" y="{y}" width="44" height="44" fill="{fill}" stroke="{INK}" stroke-width="3"/>')
    if name=="boom": icon(x,y,"boom",YL,0.85)
    else: icon(x,y,name,WH if fill!=WH else YL,0.9)
# ---------- phone frame
def phone(px,py,title,bg=SKY,dark=False,sunset=True):
    a(f'<g clip-path="url(#ph)" transform="translate({px} {py})">')
    a(f'<rect width="{W}" height="{H}" fill="{bg}"/>')
    if sunset and not dark:
        a(f'<rect width="{W}" height="300" fill="url(#sun)"/><rect width="{W}" height="300" fill="url(#dotPk)" opacity=".55"/>')
    if dark:
        a(f'<rect width="{W}" height="320" fill="url(#night)"/><rect width="{W}" height="320" fill="url(#dotNt)" opacity=".7"/>')
    fg=NFG if dark else INK
    a(f'<rect width="{W}" height="44" fill="{INK}"/>')
    T(16,29,"9:41",14,PAPER,"b"); T(W-16,29,"●●● 100%",12,PAPER,"b","end")
    return fg
def endphone(px,py,label):
    a('</g>')
    a(f'<rect x="{px}" y="{py}" width="{W}" height="{H}" rx="36" fill="none" stroke="{INK}" stroke-width="4"/>')
    T(px,py-16,label,22,INK,"h")
def header(title,fg,left="back",right=None,dark=False):
    # top bar with title in heavy narrow font, slanted plate
    a(f'<polygon points="70,58 300,52 306,96 64,100" fill="{YL if not dark else NPK}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>')
    T(185,89,title,30,INK,"h","middle")
    if left: iconbtn(12,56,left,PAPER)
    if right: iconbtn(W-56,56,right[0],right[1])
def tabbar(active,dark=False):
    y=H-84
    a(f'<rect x="0" y="{y}" width="{W}" height="84" fill="{INK}"/>')
    items=[("say",OR),("pen",YL),("likes",PK),("stand",TL)]
    names=["лента","стол","лайки","я"]
    for i,(ic,c) in enumerate(items):
        x=22+i*88
        if i==active:
            burst(x+22,y+30,30,fill=c,n=9,sw=3,stroke=PAPER if dark else YL)
            icon(x,y+8,ic,WH,0.95)
        else:
            a(f'<g opacity=".95">'); icon(x,y+8,ic,"#3a3040",0.95); a('</g>')
            a(f'<g transform="translate(0 0)"></g>')
        # outline icons on ink: lighten stroke
    # recolor trick: draw stroke-only light layer
    for i,(ic,c) in enumerate(items):
        if i!=active:
            x=22+i*88
            a(f'<g transform="translate({x+22-12*1.14} {y+8+22-12*1.14}) scale(1.14)" fill="none" stroke="{PAPER}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">{ICONS[ic].replace("class=\"f\"","")}</g>')
def card(x,y,w,h,who,text,fill=PAPER,rot=0,likes=None,tag=None,tagc=OR,dark=False):
    panel(x,y,w,h,fill=fill,rot=rot,shadow="url(#dotInk)")
    a(f'<g transform="rotate({rot} {x+w/2} {y+h/2})">')
    if tag:
        a(f'<polygon points="{x-6},{y-12} {x+len(tag)*9+26},{y-14} {x+len(tag)*9+20},{y+14} {x-2},{y+12}" fill="{tagc}" stroke="{INK}" stroke-width="3"/>')
        T(x+8,y+7,tag.upper(),15,INK,"h")
    T(x+16,y+40,who,14,MU if fill==PAPER else INK,"m")
    yy=y+66
    for line in text: T(x+16,yy,line,17,INK,"b"); yy+=24
    if likes is not None:
        burst(x+w-34,y+h-30,20,fill=YL,n=10,sw=2.6); T(x+w-34,y+h-24,str(likes),15,INK,"h","middle")
        iconbtn(x+12,y+h-58,"hide",PAPER) if False else None
    a('</g>')
# ================= SHEET
a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{SW}" height="{SH}" viewBox="0 0 {SW} {SH}">')
a(f'''<defs><style>
@font-face{{font-family:"Russo One";font-weight:400;src:url(data:font/ttf;base64,{b64("russo.ttf")}) format("truetype");}}
@font-face{{font-family:"Golos Text";font-weight:500;src:url(data:font/ttf;base64,{b64("golos.ttf")}) format("truetype");}}
.h{{font-family:"Russo One";font-weight:400;letter-spacing:.04em}}
.b{{font-family:"Golos Text";font-weight:500}}
.m{{font-family:"Golos Text";font-weight:500;letter-spacing:.2px}}
</style>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8893b"/><stop offset=".5" stop-color="#e9cf8a"/><stop offset="1" stop-color="#b8893b"/></linearGradient><clipPath id="ph"><rect width="{W}" height="{H}" rx="36"/></clipPath>
<pattern id="dotInk" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="{PK}"/><circle cx="3" cy="3" r="1.9" fill="{INK}"/></pattern>
<pattern id="dotInkN" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="{NTL}"/><circle cx="3" cy="3" r="1.9" fill="{INK}"/></pattern>
<pattern id="dotPk" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="5" cy="5" r="2.2" fill="{PK}"/></pattern>
<pattern id="dotNt" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="5" cy="5" r="1.8" fill="{NPK}"/></pattern>
<pattern id="dotOr" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="4" cy="4" r="2" fill="{OR}"/></pattern>
<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{OR}"/><stop offset=".55" stop-color="#e3b48a"/><stop offset="1" stop-color="{SKY}"/></linearGradient>
<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1e46"/><stop offset="1" stop-color="{NBG}"/></linearGradient>
</defs>''')
a(f'<rect width="{SW}" height="{SH}" fill="#f3e6cf"/>')
# ---- top strip
T(G,70,"XOR.AD · ВЕБ-ЛИЦО · «ЗАГРУЗОЧНЫЙ ЭКРАН»",48,INK,"h")
T(G,104,"Комикс-флэт с лакшери: срез угла 16 px, контур 2.5, тень 4/4/0 чернилами, золото фольгой, без растра и звёзд. Лист 01.10.2026, телефон 375×812.",17,MU,"b")
sw=[("ink",INK,PAPER),("бумага",PAPER,INK),("крем",SKY,INK),("терракота",OR,PAPER),("море",SEA,PAPER),("золото 0",GOLD0,INK),("золото 1",GOLD1,INK),("ночь",NBG,NFG),("ночь·панель",NPN,NFG),("золото ср.",YL,INK)]
for i,(n,c,t) in enumerate(sw):
    x=G+i*104
    a(f'<rect x="{x+5}" y="{135}" width="92" height="70" fill="url(#dotInk)" stroke="{INK}" stroke-width="3"/><rect x="{x}" y="130" width="92" height="70" fill="{c}" stroke="{INK}" stroke-width="3"/>')
    T(x+8,156,n,13,t,"m"); T(x+8,190,c,13,t,"m")
fx=G+1060
T(fx,160,"ЗАГОЛОВКИ — Russo One",32,INK,"h"); T(fx,196,"АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ",15,INK,"h")
T(fx,226,"Текст — Golos Text 500: съешь же ещё этих булок",16,INK,"b")
T(fx,250,"Russo One и Golos Text — SIL OFL 1.1; кириллица проверена в рендере.",14,MU,"b")
# contrast table
T(G,250,"КОНТРАСТ WCAG (норма 4.5:1, посчитано по формуле относительной яркости в генераторе)",20,INK,"h")
for i,(n,a1,b1) in enumerate(PAIRS):
    x=G+(i%4)*410; y=262+(i//4)*34
    a(f'<rect x="{x}" y="{y}" width="34" height="28" fill="{b1}" stroke="{INK}" stroke-width="2"/>')
    T(x+17,y+21,"Аа",14,a1,"h","middle")
    T(x+44,y+21,f"{n} — {cr(a1,b1):.2f}:1",15,INK,"b")
# ---- screens
def pos(i): return G+(i%COLS)*(W+G), TOP+(i//COLS)*ROWH+30
# 1 Лента light
def feed(i,dark):
    px,py=pos(i); fg=phone(px,py,"",dark=dark,bg=NBG if dark else SKY)
    a(f'<g transform="translate(0 0)">')
    # header (no back) with logo plate
    a(f'<polygon points="16,58 240,50 248,104 10,110" fill="{NPK if dark else YL}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>')
    T(26,94,"СОСЕДИ РЯДОМ",26,INK,"h")
    iconbtn(W-60,58,"refresh",TL if not dark else NTL)
    shadow="url(#dotInkN)" if dark else "url(#dotInk)"
    pf=NPN if dark else PAPER; tf=NFG if dark else INK; mf=NMU if dark else MU
    cards=[(136,150,-1.2,"300 м · один","Кто идёт гулять с собакой",["в парк к восьми? Беру мяч."],7,"рядом",OR),
           (306,170,0.8,"1 км · компанией","Ищу, с кем порепетировать",["английский по вечерам,","два раза в неделю."],12,"новое",TL),
           (500,128,-0.6,"500 м · один","Отдам кресло-мешок",["заберите до пятницы."],3,None,PK)]
    for y,h,r,who,head,lines,lk,tag,tc in cards:
        x=24;w=W-48
        a(f'<g transform="rotate({r} {x+w/2} {y+h/2})">')
        pts=lambda dx,dy:f"{x+dx},{y+dy} {x+w-24+dx},{y+dy} {x+w+dx},{y+24+dy} {x+w+dx},{y+h+dy} {x+dx},{y+h+dy}"
        a(f'<polygon points="{pts(4,4)}" fill="{shadow}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/><polygon points="{pts(0,0)}" fill="{pf}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>')
        if tag:
            tw=len(tag)*11+24
            a(f'<polygon points="{x+14},{y-14} {x+14+tw},{y-16} {x+10+tw},{y+12} {x+16},{y+10}" fill="{tc if not dark else NTL}" stroke="{INK}" stroke-width="3"/>')
            T(x+24,y+5,tag.upper(),17,INK,"h")
        T(x+16,y+38,who,14,mf,"m")
        T(x+16,y+68,head,17,tf,"h")
        yy=y+94
        for l in lines: T(x+16,yy,l,16,tf,"b"); yy+=22
        burst(x+w-36,y+h-34,24,fill=NPK if dark else YL,n=10,sw=3); T(x+w-36,y+h-28,str(lk),17,INK,"h","middle")
        a('</g>')
    # floating write button
    a(f'<g>'); burst(W-58,H-130,36,fill=PK if not dark else NPK,n=11,sw=3.5); icon(W-80,H-152,"pen",YL,1.0); a('</g>')
    tabbar(0,dark); a('</g>')
    endphone(px,py,"ЛЕНТА · ТЁМНАЯ (НОЧНОЙ ВАЙС-СИТИ)" if dark else "ЛЕНТА")
feed(0,False)
# 2 Карточка
px,py=pos(1); phone(px,py,"")
header("КАРТОЧКА",INK,"back",("flag",PK))
x,y,w,h=24,130,W-48,330
panel(x,y,w,h,fill=PAPER)
T(x+16,y+36,"300 м · один · 12 мин назад",14,MU,"m")
T(x+16,y+76,"КТО ИДЁТ ГУЛЯТЬ",28,INK,"h"); T(x+16,y+112,"С СОБАКОЙ?",28,INK,"h")
for k,l in enumerate(["В парк к восьми, беру мяч и","термос. Корги дружелюбный,","маленьких не обижает."]): T(x+16,y+152+k*24,l,17,INK,"b")
a(f'<rect x="{x+16}" y="{y+230}" width="{w-32}" height="80" fill="url(#dotOr)" stroke="{INK}" stroke-width="3"/>')
T(x+w/2,y+278,"фото",15,INK,"m","middle")
# like burst big
bx,by=W/2,610
burst(bx,by,92,fill=PK,n=14,inner=.7,sw=4); burst(bx,by,66,fill=YL,n=12,inner=.62,sw=3.5)
T(bx,by+16,"+1",44,INK,"h","middle")
for ang in (-40,-15,15,40):
    t=math.radians(ang-90); a(f'<path d="M{bx+104*math.cos(t):.0f} {by+104*math.sin(t):.0f} L{bx+128*math.cos(t):.0f} {by+128*math.sin(t):.0f}" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>')
iconbtn(30,H-150,"hide",PAPER); iconbtn(W-74,H-150,"say",TL)
tabbar(0); endphone(px,py,"КАРТОЧКА · ЛАЙК-ВЗРЫВ")
# 3 Мэтч spread
px,py=pos(2); phone(px,py,"",bg=PAPER,sunset=False)
a(f'<rect x="0" y="44" width="{W}" height="{H-44}" fill="url(#dotPk)" opacity=".35"/>')
a(f'<polygon points="14,70 {W-14},62 {W-20},350 20,360" fill="{OR}" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>')
a(f'<polygon points="20,376 {W-20},366 {W-14},640 14,652" fill="{PAPER}" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>')
# gutter lightning between
a(f'<polygon points="0,372 {W},354 {W},372 0,392" fill="{INK}"/>')
# avatars as burst circles
for cx,cy,c,nm in ((110,210,PK,"ТЫ"),(265,500,YL,"АНЯ")):
    a(f'<circle cx="{cx+5}" cy="{cy+5}" r="70" fill="{INK}"/><circle cx="{cx}" cy="{cy}" r="70" fill="{c}" stroke="{INK}" stroke-width="4"/>')
    T(cx,cy+14,nm,40,INK,"h","middle")
# speech balloons
a(f'<path d="M210 110 H350 V180 H262 L240 205 L245 180 H210Z" fill="{PAPER}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>'); sym(280,145,"heart",26)
a(f'<path d="M26 420 H170 V490 H90 L70 520 L72 490 H26Z" fill="{PAPER}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>'); sym(98,455,"heart",26)
burst(W/2,370,58,fill=YL,n=14,inner=.6,sw=4); sym(W/2,372,"star",30)
# action
a(f'<rect x="30" y="680" width="{W-60}" height="54" fill="{INK}" transform="translate(5 5)"/><rect x="30" y="680" width="{W-60}" height="54" fill="{PK}" stroke="{INK}" stroke-width="3.5"/>')
icon(W/2-46,685,"say",YL,1.0); icon(W/2+2,685,"open",WH,1.0)
endphone(px,py,"МЭТЧ · РАЗВОРОТ КОМИКСА")
# 4 Беседа
px,py=pos(3); phone(px,py,"",sunset=False,bg=SKY)
a(f'<rect x="0" y="44" width="{W}" height="{H-44}" fill="url(#dotOr)" opacity=".18"/>')
header("АНЯ",INK,"back",("end",PK))
T(W/2,140,"беседа исчезнет через 23:14",14,MU,"m","middle")
def balloon(x,y,w,lines,mine):
    h=24+len(lines)*22
    fill=TL if mine else PAPER
    if mine: tail=f"L{x+w-30} {y+h} L{x+w-6} {y+h+18} L{x+w-48} {y+h}"
    else: tail=f"L{x+48} {y+h} L{x+8} {y+h+18} L{x+30} {y+h}"
    d=f"M{x+12} {y} H{x+w-12} Q{x+w} {y} {x+w} {y+12} V{y+h-12} Q{x+w} {y+h} {x+w-12} {y+h} "
    d=f"M{x+12} {y} H{x+w-12} Q{x+w} {y} {x+w} {y+12} V{y+h-12} Q{x+w} {y+h} {x+w-12} {y+h} " + (f"H{x+w-30} L{x+w-6} {y+h+18} L{x+w-50} {y+h} " if mine else f"H{x+50} L{x+8} {y+h+18} L{x+30} {y+h} ") + f"H{x+12} Q{x} {y+h} {x} {y+h-12} V{y+12} Q{x} {y} {x+12} {y}Z"
    a(f'<path d="{d}" transform="translate(5 5)" fill="{INK}"/><path d="{d}" fill="{fill}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>')
    for k,l in enumerate(lines): T(x+16,y+30+k*22,l,16,INK,"b")
    return y+h+34
yy=170
yy=balloon(20,yy,250,["Привет! Ещё идёшь в парк?"],False)
yy=balloon(100,yy,255,["Да, у входа с фонтаном.","Через десять минут."],True)
yy=balloon(20,yy,230,["Беру мяч и корги 🐕"[:-2]],False)
yy=balloon(140,yy,215,["Отлично, до встречи!"],True)
# shout balloon
a(f'<polygon points="30,{yy+10} 70,{yy-4} 120,{yy+8} 170,{yy-6} 210,{yy+12} 200,{yy+50} 150,{yy+62} 90,{yy+52} 40,{yy+60}" fill="{YL}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>')
T(120,yy+42,"!",40,INK,"h","middle")
# composer
cy=H-84-76
a(f'<rect x="16" y="{cy+5}" width="{W-90}" height="52" fill="{INK}" transform="translate(5 0)"/><rect x="16" y="{cy}" width="{W-90}" height="52" fill="{PAPER}" stroke="{INK}" stroke-width="3.5"/>')
T(32,cy+32,"Реплика…",16,MU,"b"); iconbtn(W-62,cy+4,"send",OR)
tabbar(0); endphone(px,py,"БЕСЕДА · БАЛЛОНЫ")
# 5 Стол
px,py=pos(4); phone(px,py,"")
header("СТОЛ",INK,None,("plus",OR))
for k,(t,s,c,ic) in enumerate([("Прогулка с корги","3 лайка · 1 мэтч",PAPER,"likes"),("Английский вечером","идёт беседа · 2 мин",TL,"say"),("Кресло-мешок","скрыто модератором",PAPER,"flag")]):
    y=136+k*150; panel(24,y,W-48,118,fill=c,rot=(-0.8 if k%2 else 0.7))
    T(40,y+38,s,14,MU if c==PAPER else INK,"m"); T(40,y+74,t.upper(),18,INK,"h")
    icon(W-84,y+60,ic,YL if ic!="flag" else PK,1.0)
a(f'<g>'); burst(W/2,620,40,fill=YL,n=10,sw=3.5); icon(W/2-22,598,"dice",WH,1.0); a('</g>')
T(W/2,690,"случайный сосед",14,MU,"m","middle")
tabbar(1); endphone(px,py,"СТОЛ")
# 6 Я
px,py=pos(5); phone(px,py,"")
header("Я",INK,None,("shield",TL))
a(f'<circle cx="{W/2+6}" cy="226" r="74" fill="{INK}"/><circle cx="{W/2}" cy="220" r="74" fill="{PK}" stroke="{INK}" stroke-width="4"/>'); T(W/2,240,"ЕП",54,INK,"h","middle")
a(f'<polygon points="80,312 300,306 296,350 84,356" fill="{YL}" stroke="{INK}" stroke-width="3.5"/>'); T(W/2,343,"СОСЕД №4127",28,INK,"h","middle")
rows=[("key","ключ входа",YL),("shield","согласия",TL),("hide","скрытые",PAPER),("block","блок-лист",PK),("stand","выйти",OR)]
for k,(ic,l,c) in enumerate(rows):
    y=384+k*62
    a(f'<rect x="29" y="{y+5}" width="{W-48}" height="50" fill="url(#dotInk)" stroke="{INK}" stroke-width="2"/><rect x="24" y="{y}" width="{W-48}" height="50" fill="{PAPER}" stroke="{INK}" stroke-width="3"/>')
    icon(30,y+3,ic,c,0.9); T(84,y+32,l,17,INK,"b")
    a(f'<path d="M{W-52} {y+17} L{W-44} {y+25} L{W-52} {y+33}" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>')
tabbar(3); endphone(px,py,"Я")
# 7 Лента dark
feed(6,True)
# 8 slot: icon-in-context notes  -> legend of tab bar
px,py=pos(7)
a(f'<rect x="{px}" y="{py}" width="{W}" height="{H}" fill="{PAPER}" stroke="{INK}" stroke-width="3" stroke-dasharray="8 6"/>')
T(px+20,py+50,"ПРАВИЛА СТИЛЯ",30,INK,"h")
notes=["Панель: срез 16 px справа сверху,","наклон 0°, контур 2.5 px,","внутренняя золотая линия 1 px с отступом 4.","Тень: сдвиг 4/4, чистые чернила.","Лайк: золотой медальон с ♥ / +1,","двойной тонкий кант. Звёзд нет.","Золото фольгой: #b8893b→#e9cf8a→#b8893b","на главной кнопке, медальоне, плашке.","Кнопка: 44×44, иконка без подписи,","значение — в aria-label.","Заголовки — Russo One, +0.04em;","текст — Golos Text 500.","Ночь: #0e1324 / панели #18203a,","акцент золото, без неона.","Возгласы — только ♥ и +1;","слова — лишь в маркетинге."]
for k,l in enumerate(notes): T(px+20,py+96+k*28,l,17,INK,"b")
burst(px+W/2,py+H-170,80,fill=OR,n=12,sw=4); burst(px+W/2,py+H-170,52,fill=YL,n=12,sw=3); sym(px+W/2,py+H-170,"star",34)

# ---- brands row
BY=TOP+2*ROWH+60
a(f'<rect x="{G-16}" y="{BY-70}" width="{SW-2*G+32}" height="{ROWH+110}" fill="none" stroke="{INK}" stroke-width="3" stroke-dasharray="10 6"/>')
T(G,BY-30,"БРЕНДЫ · общая геометрия, иконки и медальон; различаются акцент и сцена",24,INK,"h")
BR={"sosed":dict(name="SOSED.PLACE",sky0="#bd4b2a",sky1="#d9b766",sky2="#f6efe2",dot="#bd4b2a",acc="#bd4b2a",acc2="#d9b766",bur=(8,.5),plate=YL,txt="СОСЕДИ РЯДОМ",
          note="двор и панельки · акцент терракота #bd4b2a (k-acc-terra) + золото"),
    "neighbro":dict(name="NEIGHBRO.PLACE",sky0="#2a1e46",sky1="#c46a4a",sky2="#e3b48a",dot="#0f6f86",acc="#d9b766",acc2="#0f6f86",bur=(20,.82),plate="#d9b766",txt="NEIGHBROS",
          note="побережье и пальмы · акцент море #0f6f86 (k-neighbro-sea-light) + золото")}
def skyline(kind,c):
    if kind=="sosed":
        for bx,bw,bh in ((0,70,120),(64,90,160),(150,60,100),(206,100,140),(300,80,110)):
            a(f'<rect x="{bx}" y="{300-bh}" width="{bw}" height="{bh}" fill="{INK}"/>')
            for wy in range(300-bh+12,292,16):
                for wx in range(bx+8,bx+bw-8,14):
                    if (wx*7+wy*3)%5==0: a(f'<rect x="{wx}" y="{wy}" width="7" height="8" fill="{YL}"/>')
        a(f'<path d="M30 300 V250 M20 260 L40 250" stroke="{INK}" stroke-width="4"/>')
    else:
        a(f'<circle cx="250" cy="210" r="70" fill="{YL}"/>')
        for k in range(5): a(f'<rect x="170" y="{190+k*16}" width="160" height="5" fill="#c46a4a"/>')
        a(f'<path d="M0 270 Q90 255 190 270 T375 268 V300 H0Z" fill="{INK}"/>')
        for px0,ph in ((50,150),(320,130),(105,105)):
            a(f'<path d="M{px0} 300 Q{px0+8} {300-ph/2} {px0+4} {300-ph}" stroke="{INK}" stroke-width="7" fill="none"/>')
            for ang in (-150,-110,-60,-20,20):
                t=math.radians(ang); ex=px0+4+48*math.cos(t); ey=300-ph+48*math.sin(t)+18
                a(f'<path d="M{px0+4} {300-ph} Q{(px0+4+ex)/2} {300-ph-20} {ex:.0f} {ey:.0f}" stroke="{INK}" stroke-width="8" fill="none" stroke-linecap="round"/>')
def bphone(i,kind,screen):
    b=BR[kind]; px=G+i*(W+G); py=BY+30
    a(f'<g clip-path="url(#ph)" transform="translate({px} {py})">')
    a(f'<linearGradient id="g{kind}{i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{b["sky0"]}"/><stop offset=".6" stop-color="{b["sky1"]}"/><stop offset="1" stop-color="{b["sky2"]}"/></linearGradient>')
    a(f'<pattern id="d{kind}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="4" cy="4" r="1.8" fill="{b["dot"]}"/></pattern>')
    a(f'<pattern id="s{kind}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="{b["acc2"]}"/><circle cx="3" cy="3" r="1.9" fill="{INK}"/></pattern>')
    a(f'<rect width="{W}" height="{H}" fill="#fff4e0"/><rect width="{W}" height="{H}" fill="url(#d{kind})" opacity=".45"/>')
    a(f'<rect width="{W}" height="300" fill="url(#g{kind}{i})"/>'); skyline(kind,b)
    a(f'<rect width="{W}" height="44" fill="{INK}"/>'); T(16,29,"9:41",14,PAPER,"b"); T(W-16,29,b["name"].lower(),12,PAPER,"b","end")
    n,inn=b["bur"]
    if screen=="feed":
        a(f'<polygon points="16,58 260,50 268,104 10,110" fill="{b["plate"]}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>'); T(26,94,b["txt"],26,INK,"h")
        heads=[("300 м · один","Гуляем с собакой",["в парк к восьми, мяч беру."],7),("1 км · компанией","Репетиция английского",["по вечерам, два раза."],12),("500 м · один","Отдам кресло-мешок",["заберите до пятницы."],3)] if kind=="sosed" else \
              [("300 m · solo","Dog walk at eight?",["meet at the park gate."],7),("1 km · group","English practice",["evenings, twice a week."],12),("500 m · solo","Free bean bag",["pick up by Friday."],3)]
        for k,(who,hd,ls,lk) in enumerate(heads):
            y=320+k*150; x=24; w=W-48; h=126; r=(-1,0.8,-0.6)[k]
            a(f'<g transform="rotate({r} {x+w/2} {y+h/2})">')
            pts=lambda dx,dy:f"{x+dx},{y+dy} {x+w-24+dx},{y+dy} {x+w+dx},{y+24+dy} {x+w+dx},{y+h+dy} {x+dx},{y+h+dy}"
            a(f'<polygon points="{pts(4,4)}" fill="url(#s{kind})" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/><polygon points="{pts(0,0)}" fill="{PAPER}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>')
            T(x+16,y+34,who,14,MU,"m"); T(x+16,y+64,hd,18,INK,"h"); T(x+16,y+90,ls[0],16,INK,"b")
            burst(x+w-34,y+h-30,24,fill=b["acc"] if kind=="neighbro" else "#d9b766",n=n,inner=inn,sw=3); T(x+w-34,y+h-24,str(lk),17,INK,"h","middle")
            a('</g>')
        # header elements overlay sky; panels start at 320 so sky band only behind header
    else:
        iconbtn(12,56,"back",PAPER)
        a(f'<polygon points="70,58 300,52 306,96 64,100" fill="{b["plate"]}" stroke="{INK}" stroke-width="3.5"/>'); T(185,89,"КАРТОЧКА" if kind=="sosed" else "POST",30,INK,"h","middle")
        x,y,w,h=24,318,W-48,190; panel(x,y,w,h,fill=PAPER,shadow=f"url(#s{kind})")
        T(x+16,y+36,"300 м · один" if kind=="sosed" else "300 m · solo",14,MU,"m")
        T(x+16,y+76,"ГУЛЯЕМ С СОБАКОЙ" if kind=="sosed" else "DOG WALK AT EIGHT",22,INK,"h")
        T(x+16,y+112,"В парк к восьми, беру мяч." if kind=="sosed" else "Meet at the park gate.",17,INK,"b")
        bx,by=W/2,640
        if kind=="sosed":
            burst(bx,by,96,fill="#bd4b2a",n=8,inner=.5,sw=4); burst(bx,by,60,fill="#d9b766",n=5,inner=.45,sw=3.5)
        else:
            burst(bx,by,96,fill="#0f6f86",n=20,inner=.82,sw=4); burst(bx,by,64,fill="#d9b766",n=20,inner=.85,sw=3.5)
        T(bx,by+14,"+1",40,INK,"h","middle")
    a('</g>')
    a(f'<rect x="{px}" y="{py}" width="{W}" height="{H}" rx="36" fill="none" stroke="{INK}" stroke-width="4"/>')
    T(px,py-10,f'{b["name"]} · {"ЛЕНТА" if screen=="feed" else "КАРТОЧКА · ВЗРЫВ"}',16,INK,"h")
bphone(0,"sosed","feed"); bphone(1,"sosed","card"); bphone(2,"neighbro","feed"); bphone(3,"neighbro","card")
T(G,BY+H+70,"sosed: "+BR["sosed"]["note"]+"",15,MU,"b")
T(G,BY+H+92,"neighbro: "+BR["neighbro"]["note"]+"",15,MU,"b")

# ---- time-of-day header strips
SY=TOP+3*ROWH+170
T(G,SY-20,"БРЕНДЫ · ШАПКА ЛЕНТЫ ПО ВРЕМЕНИ СУТОК (утро 5–11 · день 11–17 · закат 17–21 · ночь 21–5)",24,INK,"h")
SC={"sosed":[("УТРО","#f3e2d4","#e9eef3",INK),("ДЕНЬ","#cfe3ee","#f6efe2",INK),("ЗАКАТ","#a33e1f","#d9a066",PAPER),("НОЧЬ","#0e1324","#18203a",PAPER)],
    "neighbro":[("УТРО","#f3dcd4","#f3ead8",INK),("ДЕНЬ","#bfe3ea","#f3efe6",INK),("ЗАКАТ","#2a1e46","#c46a4a",PAPER),("НОЧЬ","#0e1324","#18203a",PAPER)]}
SCN=[]
def scene(x,y,kind,k,title=None,cap=True,btn=True):
    name,c0,c1,tc=SC[kind][k]; w,h=375,200
    gid=f"tod{kind}{k}"
    a(f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1"><stop offset=".42" stop-color="{c0}"/><stop offset="1" stop-color="{c1}"/></linearGradient><clipPath id="c{gid}"><rect x="{x}" y="{y}" width="{w}" height="{h}"/></clipPath></defs>')
    a(f'<g clip-path="url(#c{gid})"><rect x="{x}" y="{y}" width="{w}" height="{h}" fill="url(#{gid})"/>')
    g=lambda: None
    if kind=="sosed":
        bcol={0:"#8a93a6",1:"#e6d6bc",2:INK,3:"#141018"}[k]
        if k==3: a(f'<circle cx="{x+290}" cy="{y+86}" r="16" fill="{PAPER}" stroke="{INK}" stroke-width="3"/><circle cx="{x+297}" cy="{y+81}" r="13" fill="{c0}"/>')
        if k==0: a(f'<circle cx="{x+60}" cy="{y+150}" r="34" fill="#eadcc0"/>')
        if k==2: a(f'<circle cx="{x+300}" cy="{y+140}" r="40" fill="{YL}" stroke="{INK}" stroke-width="3"/>')
        for bx,bw,bh in ((0,70,80),(64,90,105),(150,60,70),(206,100,95),(300,80,75)):
            a(f'<rect x="{x+bx}" y="{y+h-bh}" width="{bw}" height="{bh}" fill="{bcol}" stroke="{INK}" stroke-width="{3 if k==1 else 0}"/>')
            for wy in range(y+h-bh+10,y+h-8,14):
                for wx in range(x+bx+8,x+bx+bw-8,13):
                    lit=(wx*7+wy*3)%(5 if k==3 else 9)==0
                    col=YL if (lit and k>=2) else ("#b8cfe0" if k==1 else ("#a3abbb" if k==0 else None))
                    if col and lit: a(f'<rect x="{wx}" y="{wy}" width="6" height="7" fill="{col}"/>')
        if k==0:
            for fy in (): a(f'<rect x="{x}" y="{y+fy}" width="{w}" height="14" fill="#ffffff" opacity=".55"/>')
            for px_,py_ in (): a(f'<path d="M{x+px_} {y+py_} q6 -7 12 0 q6 -7 12 0" fill="none" stroke="{INK}" stroke-width="2.5" stroke-linecap="round"/>')
        if k==1:
            pass
            for i_,c_ in enumerate(()):
                a(f'<rect x="{x+158+i_*12}" y="{y+143+(2 if i_ in (1,2) else 0)}" width="9" height="14" fill="{c_}" stroke="{INK}" stroke-width="1.5"/>')
    else:
        if k==0: a(f'<circle cx="{x+280}" cy="{y+150}" r="34" fill="#f6efe2" stroke="{INK}" stroke-width="3"/><rect x="{x}" y="{y+150}" width="{w}" height="50" fill="#cfe3e6"/>')
        if k==1: a(f'<circle cx="{x+230}" cy="{y+105}" r="22" fill="#ffffff" stroke="{INK}" stroke-width="3"/><rect x="{x}" y="{y+140}" width="{w}" height="34" fill="{SEA}"/><rect x="{x}" y="{y+174}" width="{w}" height="26" fill="#eadcc0"/>')
        if k==2:
            a(f'<circle cx="{x+250}" cy="{y+150}" r="56" fill="{YL}"/>')
            for j_ in range(4): a(f'<rect x="{x+190}" y="{y+132+j_*12}" width="120" height="5" fill="#c46a4a"/>')
            a(f'<rect x="{x}" y="{y+176}" width="{w}" height="24" fill="#18203a"/>')
        if k==3: a(f'<rect x="{x}" y="{y+172}" width="{w}" height="4" fill="{NPK}"/><rect x="{x}" y="{y+176}" width="{w}" height="24" fill="#0e1324"/>')
        pc=INK if k<3 else "#0e1324"; ps=NPK if k==3 else None
        for px0,ph in ((40,110),(330,95)):
            X=x+px0; B=y+h
            extra=f' stroke="{ps}"' if ps else ''
            for sw_,col_ in (([10,ps],[7,pc]) if ps else ([7,pc],)):
                a(f'<path d="M{X} {B} Q{X+8} {B-ph/2} {X+4} {B-ph}" stroke="{col_}" stroke-width="{sw_}" fill="none"/>')
                for ang in (-150,-110,-60,-20,20):
                    t=math.radians(ang); ex=X+4+40*math.cos(t); ey=B-ph+40*math.sin(t)+16
                    a(f'<path d="M{X+4} {B-ph} Q{(X+4+ex)/2} {B-ph-18} {ex:.0f} {ey:.0f}" stroke="{col_}" stroke-width="{sw_+1}" fill="none" stroke-linecap="round"/>')
    if title is None: title="СОСЕДИ РЯДОМ" if kind=="sosed" else "NEIGHBROS"
    if title: T(x+16,y+62,title,30,tc,"h")
    if btn: iconbtn(x+w-58,y+28,"refresh",PAPER)
    a('</g>')
    a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="{INK}" stroke-width="4"/>')
    v=cr(tc,c0); assert v>=4.5,(kind,name,v); SCN.append((kind,name,tc,c0,v))
    if cap: T(x,y+h+26,f"{name} · заголовок {tc} на {c0} — {v:.2f}:1",15,INK,"b")
for r_,kind in enumerate(("sosed","neighbro")):
    T(G,SY+20+r_*290,"SOSED.PLACE — двор и панельки" if kind=="sosed" else "NEIGHBRO.PLACE — побережье",18,MU,"h")
    for k in range(4): scene(G+k*(W+G),SY+34+r_*290,kind,k)
NY=SY+34+2*290
for i_,l in enumerate(["Правило: фаза берётся по часовому поясу места, на которое стоит фильтр ленты (Intl.DateTimeFormat с timeZone места / смещение пояса места), а не по часам устройства.",
   "Смена фазы — мгновенная подмена сцены, без анимации перехода; prefers-reduced-motion не затрагивается. Медальон лайка общий, бренд меняет акцент и сцену.",
   "Заголовок шапки стоит прямо на небе: верхние 42% градиента залиты сплошным цветом c0, контраст считан по нему."]):
    T(G,NY+i_*24,l,15,INK,"b")
# ---- icon row
T(G,ICONY+20,f"ИКОНКИ · {len(ACTIONS)} ДЕЙСТВИЙ (жирный контур 2.4 на сетке 24, заливка плоским цветом; подпись — только на листе)",24,INK,"h")
for i,(lbl,ic,c) in enumerate(ACTIONS):
    x=G+(i%6)*270; y=ICONY+50+(i//6)*110
    a(f'<rect x="{x+6}" y="{y+6}" width="72" height="72" fill="url(#dotInk)" stroke="{INK}" stroke-width="3"/><rect x="{x}" y="{y}" width="72" height="72" fill="{PAPER}" stroke="{INK}" stroke-width="3.5"/>')
    if ic=="boom": icon(x+14,y+14,"boom",YL,1.15)
    else: icon(x+14,y+14,ic,c if c!=PAPER else YL,1.15)
    T(x+86,y+42,lbl,15,INK,"b")
# ---- questions
T(G,QY+20,"РЕШЕНИЯ ВЛАДЕЛЬЦА",34,INK,"h")
Q=[("Наклон панелей 0°, срез угла 16 px","лакшери-правка владельца"),("Растр убран полностью; тень 4/4/0 чернилами","лакшери-правка владельца"),("Звёзд нет: лайк — золотой медальон с ♥ / +1","лакшери-правка владельца"),
   ("3. Шрифт заголовков — Russo One, +0.04em, на 10% мельче","решено владельцем"),("Ночь — #0e1324 / панели #18203a, акцент золото, без неона","лакшери-правка владельца"),
   ("5a. Иконки без подписей, смысл — в aria-label; ⓘ открывает баллон","решено по умолчанию"),("6a. Медальон лайка: прыжок 0→1.2→1, 220 мс, уважает reduced-motion","решено по умолчанию"),
   ("7a. Мэтч — две панели с разрывом","решено по умолчанию"),("9a. Фазы суток по часам 5 / 11 / 17 / 21 места фильтра","решено по умолчанию"),("Автор в ленте не светится: имя только с мэтча (chat_RU §8.11)","поправка владельца")]
for k,(q,v) in enumerate(Q):
    y=QY+64+k*66
    T(G,y,q,22,INK,"h"); T(G,y+28,v,17,INK,"b")
a('</svg>')
write(OUT,clean("\n".join(BUF[0])))

# ======================= PER-SCREEN SVGs (375x812) =======================
SCR=os.path.join(ROOT,"panel/design/sheets-comic")
WARN_L="#a3311f"; WARN_D="#ff9a8a"
THEMES={
 "light":dict(kind="sosed",k=2,bg=SKY,panel=PAPER,fg=INK,mu=MU,plate=YL,pri=YL,sec=PAPER,off="#ece3d2",sh=INK,warn=WARN_L,bn=0,bi=0,bf=YL,bf2=OR,tab=INK,sel=OR,selfg=PAPER),
 "dark":dict(kind="sosed",k=3,bg=NBG,panel=NPN,fg=NFG,mu=NMU,plate=YL,pri=YL,sec="#e9dfc9",off="#2a3456",sh=INK,warn=WARN_D,bn=0,bi=0,bf=YL,bf2=YL,tab="#070a14",sel=YL,selfg=INK),
 "neighbro":dict(kind="neighbro",k=2,bg="#f3f1ea",panel="#fffdf7",fg=INK,mu="#56625f",plate=YL,pri=YL,sec="#fffdf7",off="#e6e3da",sh=INK,warn=WARN_L,bn=0,bi=0,bf=YL,bf2=SEA,tab=INK,sel=SEA,selfg=PAPER),
}
for t in THEMES.values():
    for fg,bg in ((t["fg"],t["bg"]),(t["fg"],t["panel"]),(t["mu"],t["bg"]),(t["mu"],t["panel"]),(t["warn"],t["bg"]),(t["warn"],t["panel"]),(INK,t["plate"]),(INK,GOLD0),(t["selfg"],t["sel"])):
        assert cr(fg,bg)>=4.5,(fg,bg,cr(fg,bg))
TH={}
CW=0.57  # Golos avg glyph width / size
def wrap(s,size,maxw):
    out=[];cur=""
    for w_ in s.split(" "):
        t_=(cur+" "+w_).strip()
        if len(t_)*size*CW>maxw and cur: out.append(cur); cur=w_
        else: cur=t_
    if cur: out.append(cur)
    return out
def para(x,y,s,size=15,color=None,maxw=343,lh=None,cls="b"):
    lh=lh or round(size*1.4)
    for l in wrap(s,size,maxw): T(x,y+size,l,size,color or TH["fg"],cls); y+=lh
    return y
INFOS=[]
def infobtn(x,y,text,warn=False):
    INFOS.append((x,y,text,warn))
    a(f'<rect x="{x+4}" y="{y+4}" width="40" height="40" fill="{INK}"/><rect x="{x}" y="{y}" width="40" height="40" fill="{TH["warn"] if warn else TH["plate"]}" stroke="{INK}" stroke-width="3"/>')
    icon(x-2,y-2,"info",PAPER if warn else WH,0.85)
def popup():
    x,y,text,warn=INFOS[0]
    a(f'<rect width="375" height="812" fill="{INK}" opacity=".45"/>')
    lines=wrap(text,15,300); h=len(lines)*21+70; by=y+60 if y+60+h<800 else y-h-24; bx=12; bw=351
    tip=f"L{x+30} {by} L{x+20} {y+42} L{x+10} {by}" if by>y else f"L{x+10} {by+h} L{x+20} {y-2} L{x+30} {by+h}"
    if by>y: d=f"M{bx} {by} H{x+10} L{x+20} {y+44} L{x+30} {by} H{bx+bw} V{by+h} H{bx}Z"
    else: d=f"M{bx} {by} H{bx+bw} V{by+h} H{x+30} L{x+20} {y-4} L{x+10} {by+h} H{bx}Z"
    a(f'<path d="{d}" transform="translate(6 6)" fill="url(#sh)" stroke="{INK}" stroke-width="3"/><path d="{d}" fill="{PAPER}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>')
    a(f'<rect x="{bx+5}" y="{by+5}" width="{bw-10}" height="{h-10}" fill="none" stroke="url(#gold)" stroke-width="1"/>')
    icon(bx+bw-48,by+4,"close",PAPER,0.8)
    yy=by+40
    for l in lines: T(bx+16,yy,l,15,WARN_L if warn else INK,"b"); yy+=21
def scr_begin(theme,open_info=False):
    INFOS.clear()
    BUF.append([]); TH.clear(); TH.update(THEMES[theme]); TH['open']=open_info
    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="375" height="812" viewBox="0 0 375 812">')
    a(f'''<defs><style>@font-face{{font-family:"Russo One";src:url(/fonts/comic-russo-one.ttf)}}@font-face{{font-family:"Golos Text";font-weight:500;src:url(/fonts/comic-golos-500.ttf)}}
.h{{font-family:"Russo One";letter-spacing:.04em}}.b,.m{{font-family:"Golos Text";font-weight:500}}.mono{{font-family:"DejaVu Sans Mono",monospace;font-weight:700}}</style>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8893b"/><stop offset=".5" stop-color="#e9cf8a"/><stop offset="1" stop-color="#b8893b"/></linearGradient><pattern id="sh" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="{TH["sh"]}"/><circle cx="3" cy="3" r="1.9" fill="{INK}"/></pattern></defs>''')
    a(f'<rect width="375" height="812" fill="{TH["bg"]}"/>'); a('<g transform="translate(4.4 0) scale(0.9767)">'); TH['g']=True
def scr_end(name):
    if TH.get('g'): a('</g>'); TH['g']=False
    if TH.get('open') and INFOS: popup()
    a('</svg>'); write(os.path.join(SCR,name+".svg"),clean("\n".join(BUF.pop())))
def box(x,y,w,h,fill=None,cut=0,sw=2.5,shadow=True):
    fill=fill or TH["panel"]
    pts=lambda d:f"{x+d},{y+d} {x+w-cut+d},{y+d} {x+w+d},{y+cut+d} {x+w+d},{y+h+d} {x+d},{y+h+d}"
    if shadow: a(f'<polygon points="{pts(4)}" fill="{INK}" stroke="{INK}" stroke-width="{sw}" stroke-linejoin="round"/>')
    a(f'<polygon points="{pts(0)}" fill="{fill}" stroke="{INK}" stroke-width="{sw}" stroke-linejoin="round"/>')
    if w>60 and h>36: a(f'<polygon points="{x+4},{y+4} {x+w-max(cut-2,4)},{y+4} {x+w-4},{y+max(cut-2,4)} {x+w-4},{y+h-4} {x+4},{y+h-4}" fill="none" stroke="url(#gold)" stroke-width="1"/>')
def hdr(title,back=False,right=None,step=None,size=22):
    x0=64 if back else 12; x1=375-(64 if (right or step) else 12)
    while len(title)*size*0.62>x1-x0-24 and size>14: size-=1
    a(f'<polygon points="{x0},{16} {x1},{12} {x1+4},{60} {x0-4},{64}" fill="{TH["plate"]}" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>')
    T(x0+12,46,title,size,INK,"h")
    if back: iconbtn(10,16,"back",TH["sec"] if TH["sec"]!=NPN else PAPER)
    if right: iconbtn(375-54,16,right,TH["pri"])
    if step: a(f'<rect x="{375-56}" y="18" width="44" height="40" fill="{INK}"/>'); T(375-34,45,step,16,PAPER,"h","middle")
    return 84
def bicon(x,y,ic,fill=WH,s=1.0):
    if ic=="boom": icon(x,y,"boom",YL,s); return
    icon(x,y,ic,fill,s)
def wbtn(y,ic,kind="pri",x=16,w=343,h=52):
    fill={"pri":TH["pri"],"sec":TH["sec"],"off":TH["off"]}[kind]
    if kind!="off": a(f'<rect x="{x+4}" y="{y+4}" width="{w}" height="{h}" fill="{INK}"/>')
    a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{INK if kind!="off" else TH["mu"]}" stroke-width="3" {"stroke-dasharray=\"6 4\"" if kind=="off" else ""}/>')
    a(f'<g opacity="{.45 if kind=="off" else 1}">'); bicon(x+w/2-22,y+h/2-22,ic,YL if kind=="pri" else (TH["plate"] if kind=="sec" else WH)); a('</g>')
    return y+h+14
def rowbtns(y,items,x=16,w=None,gap=12):
    w=w or 64
    for i,(ic,kind) in enumerate(items): wbtn(y,ic,kind,x=x+i*(w+gap),w=w,h=48)
    return y+62
def field(y,label,value="",hint=None,right=None,h=44,select=False,mono=False,warnhint=False):
    if label:
        T(16,y+14,label,13,TH["mu"],"m")
        if right: T(359,y+14,right,13,TH["mu"],"m","end")
        y+=22
    a(f'<rect x="16" y="{y}" width="343" height="{h}" fill="{PAPER if TH["panel"]!=NPN else "#0e1324"}" stroke="{INK if TH["panel"]!=NPN else NTL}" stroke-width="3"/>')
    if value:
        yy=y+28
        for l in (wrap(value,15,310) if h>44 else [value]): T(30,yy,l,15,TH["fg"] if TH["panel"]==NPN else INK,"mono" if mono else "b"); yy+=21
    if select: a(f'<path d="M336 {y+18} L342 {y+26} L348 {y+18}" fill="none" stroke="{INK if TH["panel"]!=NPN else NTL}" stroke-width="3"/>')
    y+=h+6
    if hint: T(16,y+12,hint,13,TH["warn"] if warnhint else TH["mu"],"m"); y+=20
    return y+8
def chips(y,items,sel=None,x=16,h=34,size=14,gap=8,wfix=None):
    for it in items:
        w=wfix or len(it)*size*CW+26
        on=(it==sel)
        a(f'<rect x="{x+3}" y="{y+3}" width="{w}" height="{h}" fill="{INK}"/><rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{TH["sel"] if on else TH["panel"]}" stroke="{INK}" stroke-width="2.5"/>')
        T(x+w/2,y+h/2+5,it,size,TH["selfg"] if on else TH["fg"],"h" if on else "b","middle"); x+=w+gap
    return y+h+14
def heartn(x,y,n,size=14):
    sym(x+7,y-5,"heart",7,fill=TH["bf2"]); T(x+18,y,str(n),size,TH["fg"],"b")
def tabbar3(active):
    if TH.get('g'): a('</g>'); TH['g']=False
    y=812-72; a(f'<rect x="0" y="{y}" width="375" height="72" fill="{TH["tab"]}"/>')
    for i,ic in enumerate(("feed","say","me")):
        x=40+i*125-22+22
        if i==active: burst(x+22,y+34,30,fill=TH["plate"],n=9,sw=3,stroke=PAPER)
        a(f'<g transform="translate({x+22-12*1.1} {y+34-12*1.1}) scale(1.1)" fill="none" stroke="{INK if i==active else PAPER}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">{ICONS[ic].replace(chr(34)+"f"+chr(34),chr(34)+"x"+chr(34))}</g>')
def phrasecard(y,text,meta=None,size=17,h=None,mark=None,tag=None):
    lines=wrap(text,size,300); h=h or 34+len(lines)*round(size*1.35)+(26 if meta else 0)+(30 if tag else 0)
    box(16,y,343,h,cut=18)
    yy=y+12
    if tag:
        a(f'<rect x="30" y="{yy}" width="{len(tag)*8+20}" height="24" fill="{TH["plate"]}" stroke="{INK}" stroke-width="2"/>'); T(40,yy+17,tag,13,INK,"h"); yy+=32
    for l in lines: T(30,yy+size+4,l,size,TH["fg"],"h" if size>=18 else "b"); yy+=round(size*1.35)
    if meta: meta(30,yy+28)
    if mark: a(f'<rect x="30" y="{y+h-12}" width="300" height="4" fill="{mark}"/>')
    return y+h+16
def urlbar(path,tabs=None):
    a(f'<rect width="375" height="44" fill="{PAPER}"/><rect y="44" width="375" height="3" fill="{INK}"/>'); T(14,27,path,11,MU,"mono")
    if tabs:
        for i,(ic,on) in enumerate(tabs):
            x=375-110+i*52
            if on: burst(x+22,24,22,fill=TH["plate"],n=9,sw=2.5)
            icon(x,2,ic,YL if not on else WH,0.8)
    return 64
# ---------- screens
def s_Splash():
    for i,d in enumerate(["d_house","table","d_kettle","d_domino","d_knight","d_bike","d_cat","d_tree"]):
        cx=105+(i%2)*165; cy=130+(i//2)*120
        burst(cx,cy,46,fill=[YL,TL,PK,OR][i%4],n=12,inner=.78,sw=3) if i%3==0 else a(f'<circle cx="{cx+4}" cy="{cy+4}" r="42" fill="{INK}"/><circle cx="{cx}" cy="{cy}" r="42" fill="{[YL,TL,PK,OR][i%4]}" stroke="{INK}" stroke-width="3"/>')
        icon(cx-22,cy-22,d,PAPER,1.35)
    a(f'<rect x="300" y="14" width="56" height="40" fill="{INK}" transform="translate(4 4)"/><rect x="300" y="14" width="56" height="40" fill="{PAPER}" stroke="{INK}" stroke-width="3"/>'); T(328,41,"RU",17,INK,"h","middle")
    T(187,602,"Что говорят соседи рядом.",17,TH["fg"],"b","middle"); T(187,628,"Сказанное исчезает.",17,TH["fg"],"b","middle")
    y=652; y=wbtn(y,"play","pri"); y=rowbtns(y,[("key","sec"),("arrive","sec")],w=165)
def s_Register():
    y=hdr("Бумажный код восстановления")
    box(16,y,343,56,fill=PAPER); T(187,y+37,"X6XT 88NQ F4QJ DQ84",24,INK,"mono","middle")
    infobtn(16,y+72,"Запишите этот код на бумаге. Это единственный способ вернуть вашу личность: почты и пароля у нас нет, подсказать код мы не сможем, второй раз он показан не будет.")
    y=para(16,y+130,"Записали? Введите вторую и четвёртую группы.",17,TH["fg"])
    y=field(y+10,"вторая"); y=field(y,"четвёртая")
    wbtn(730,"check","off")
def s_Register1():
    y=hdr("Кто вы",step="1/2")
    y=field(y,"имя","Аня",hint="осталось 21"); y=field(y,"возраст","28",hint="сюда с 13 лет")
    a(f'<rect x="16" y="{y+4}" width="26" height="26" fill="{TH["pri"]}" stroke="{INK}" stroke-width="3"/><path d="M21 {y+17} L27 {y+23} L37 {y+10}" fill="none" stroke="{INK}" stroke-width="3.5"/>')
    para(54,y,"принимаю пользовательское соглашение, политику конфиденциальности и правила сообщества",15,TH["fg"],maxw=300)
    wbtn(730,"open","pri")
def s_Register2():
    y=hdr("ПИН",step="2/2")
    y=field(y,"ПИН","••••••"); y=field(y,"повторите ПИН","••••••")
    T(16,y+10,"этот ПИН легко угадать",15,TH["warn"],"b")
    wbtn(730,"open","pri")
def feedhead(title_lines):
    k=TH["k"]; scene(0,0,TH["kind"],k,title="",cap=False,btn=False)
    tc=SC[TH["kind"]][k][3]
    for i,l in enumerate(title_lines): T(16,40+i*30,l,24,tc,"h")
    a(f'<rect x="276" y="20" width="84" height="40" fill="{INK}" transform="translate(4 4)"/><rect x="276" y="20" width="84" height="40" fill="{PAPER}" stroke="{INK}" stroke-width="3"/>')
    T(292,46,"1 км",16,INK,"h"); a(f'<path d="M338 36 L344 44 L350 36" fill="none" stroke="{INK}" stroke-width="3"/>')
def s_Feed():
    feedhead(["Лента ·","рядом мало людей"])
    y=214; wbtn(y,"likes","sec",x=16,w=64,h=48); wbtn(y,"table","sec",x=92,w=64,h=48)
    y=phrasecard(282,"иду к реке mupseceg",meta=lambda x,y_:(T(x,y_,"один ·",14,TH["mu"],"m"),heartn(x+48,y_,0)),size=18)
    T(16,606,"ключи: отперто ПИНом, обёртка та же",14,TH["mu"],"m")
    burst(187,672,40,fill=TH["pri"],n=11,sw=3.5); icon(165,650,"pen",YL,1.05)
    tabbar3(0)
def s_Composer():
    y=hdr("Твоя фраза",back=True)
    y=field(y-4,"фраза","гуляю у реки, если кто рядом mupseceg",right="осталось 91",h=96)
    T(16,y+10,"режим",13,TH["mu"],"m"); y=chips(y+18,["один","компанией","вечеринка"],"один",wfix=108)
    T(16,y+10,"зона",13,TH["mu"],"m"); T(359,y+10,"схема, не карта",13,TH["mu"],"m","end")
    box(16,y+20,343,100,fill=TH["panel"],shadow=False); cx,cy=187,y+70
    for r_,c_ in ((44,TH["panel"]),(36,TH["plate"]),(26,TH["bf2"]),(16,TH["plate"]),(5,INK)): a(f'<circle cx="{cx}" cy="{cy}" r="{r_}" fill="{c_}" stroke="{INK}" stroke-width="2.5"/>')
    y=chips(y+132,["100 м","300 м","1 км","3 км","10 км"],"1 км",wfix=61,gap=9)
    infobtn(70,y-150,"та же точка и ступень свяжут ваши фразы между собой")
    a(f'<rect x="16" y="{y+6}" width="343" height="3" fill="{INK}"/>'); T(16,y+34,"предлагаю скидку",16,TH["fg"],"b"); T(359,y+34,"один оффер за раз",13,TH["mu"],"m","end"); a(f'<rect x="16" y="{y+48}" width="343" height="3" fill="{INK}"/>')
    wbtn(730,"send","pri",x=231,w=128)
def cardbase(text,n,msg=None,liked=False,match=False):
    y=hdr("один",back=True)
    yy=280 if not msg else 250
    for l in wrap(text,28,330): T(16,yy,l,28,TH["fg"],"h"); yy+=36
    heartn(16,yy+16,n,16)
    if liked or match:
        burst(290,yy+80,52,fill=TH["bf"],n=TH["bn"],inner=TH["bi"],sw=3.5); T(290,yy+90,"+1",26,INK,"h","middle")
    if match: sym(206,yy+60,"heart",20,fill=TH["bf2"])
    if msg: para(16,620,msg,15,TH["warn"])
    rowbtns(680,[("boom","off" if (liked or match) else "pri"),("hide","sec"),("block","sec")],w=100)
def s_Card(): cardbase("иду к реке mupseceg",0)
def s_Cardliked(): cardbase("иду к реке mupseceg",1,"Лайк отправлен. Если понравитесь друг другу — будет мэтч.",liked=True)
def s_Cardmatched(): cardbase("гуляю у реки, если кто рядом mupseceg",1,"Мэтч! Предложение поговорить ждёт во входящих.",match=True)
def s_Likes():
    hdr("Лайкнутое",back=True)
    T(16,400,"Пока ничего",17,TH["fg"],"h"); para(16,420,"Лайкнутые фразы соберутся здесь, пока живы.",16,TH["fg"])
def s_Inbox():
    hdr("Разговоры",right="refresh")
    T(16,108,"Предлагают поговорить",15,TH["fg"],"h"); a(f'<circle cx="214" cy="94" r="5" fill="{TH["warn"]}"/>'); T(226,108,"Беседы",15,TH["mu"],"b")
    a(f'<rect x="16" y="118" width="196" height="5" fill="{TH["pri"]}" stroke="{INK}" stroke-width="1.5"/><rect x="16" y="125" width="343" height="2" fill="{INK}"/>')
    box(16,146,343,170,cut=18); T(32,178,"Борис, 31",16,TH["fg"],"h"); a(f'<circle cx="336" cy="172" r="8" fill="{TH["warn"]}" stroke="{INK}" stroke-width="2"/>')
    T(32,210,"иду к реке mupseceg",18,TH["fg"],"b"); T(32,236,"предложение",14,TH["mu"],"m"); wbtn(252,"open","sec",x=32,w=72,h=46)
    tabbar3(1)
def matchtop(y,mine,his,tag=True):
    y=phrasecard(y,mine,size=17,mark=TH["pri"])
    def meta(x,y_): pass
    box(16,y,343,118,cut=18); T(30,y+28,"Борис, 31",16,TH["fg"],"h")
    a(f'<rect x="30" y="{y+40}" width="54" height="24" fill="{TH["plate"]}" stroke="{INK}" stroke-width="2"/>'); T(57,y+57,"один",13,INK,"h","middle")
    T(30,y+92,his,17,TH["fg"],"b"); a(f'<rect x="30" y="{y+104}" width="300" height="4" fill="{TH["bf2"]}"/>')
    return y+136
def s_Match():
    hdr("Борис, 31",back=True)
    y=matchtop(84,"гуляю у реки, если кто рядом mupseceg","иду к реке mupseceg")
    infobtn(16,y,"Поговорить — и, когда согласятся оба, откроется беседа. Ключи беседы рождаются у вас двоих, узел их не видит.")
    burst(300,y+170,34,fill=TH["bf"],n=TH["bn"],inner=TH["bi"],sw=3); sym(300,y+170,"heart",14,fill=TH["bf2"])
    y=wbtn(y+230,"say","pri"); wbtn(y,"later","sec")
def s_Matchwaiting():
    hdr("Борис, 31",back=True)
    y=phrasecard(84,"гуляю у реки, если кто рядом mupseceg",size=16,mark=TH["pri"])
    y=phrasecard(y,"иду к реке mupseceg",size=16,mark=TH["bf2"])
    box(16,y,343,40,shadow=False); sym(36,y+20,"star",10,fill=TH["plate"]); T(54,y+26,"Ждём ответа",15,TH["fg"],"b")
    infobtn(16,650,"Можно писать: строки лежат на этом устройстве и уйдут, когда согласятся.")
    wbtn(650,"say","sec",x=150,w=76,h=44); icon(170,650,"back",TH["plate"],0.6) if False else None
    a(f'<rect x="16" y="720" width="250" height="52" fill="{PAPER if TH["panel"]!=NPN else "#0e1324"}" stroke="{INK if TH["panel"]!=NPN else NTL}" stroke-width="3"/>'); T(30,752,"строка",15,TH["mu"],"b")
    wbtn(720,"queue","sec",x=278,w=81)
def chatbase(game=False):
    hdr("Аня, 28",back=True)
    box(16,80,343,170,fill=TH["panel"],shadow=False)
    T(30,104,"Понравилось, по порядку",14,TH["mu"],"h")
    T(30,128,"1. Собеседнику понравилось",13,TH["mu"],"m"); T(30,150,"«иду к реке mupseceg»",16,TH["fg"],"b")
    T(30,176,"2. Вам понравилось",13,TH["mu"],"m"); T(30,198,"«гуляю у реки, если кто рядом",16,TH["fg"],"b"); T(30,220,"mupseceg»",16,TH["fg"],"b")
    T(16,276,"на связи",13,TH["mu"],"m"); infobtn(90,256,"гаснет после 1ч ВАШЕГО молчания"); T(16,318,"свой срок",14,TH["mu"],"m")
    y=chips(334,["10 минут","30 минут","час","пока говорим"],"час",size=13,gap=6)
    rowbtns(y-4,[("end","sec"),("block","sec"),("key","sec")],w=60)
    if not game:
        box(250,486,109,58); T(266,512,"привет",16,INK if TH["panel"]!=NPN else NFG,"b"); T(266,532,"17:07",12,TH["mu"],"m")
        a(f'<path d="M330 544 L350 560 L340 544Z" fill="{TH["panel"]}" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>')
        a(f'<rect x="16" y="660" width="255" height="52" fill="{PAPER if TH["panel"]!=NPN else "#0e1324"}" stroke="{INK if TH["panel"]!=NPN else NTL}" stroke-width="3"/>'); T(30,692,"реплика",15,TH["mu"],"b")
        wbtn(660,"send","pri",x=283,w=76)
        rowbtns(736,[("dice","sec"),("shield","sec")],w=165)
    else:
        box(16,470,343,330,fill=TH["panel"],shadow=False)
        for i,g in enumerate(["dots","grid","deck","word","dice"]):
            yy=486+i*60; on=i==0
            a(f'<rect x="30" y="{yy}" width="315" height="48" fill="{TH["plate"] if on else TH["bg"]}" stroke="{INK}" stroke-width="{3 if on else 1.5}"/>')
            T(46,yy+31,g,16,INK if on or TH["panel"]!=NPN else NFG,"h" if on else "b")
def s_Chat(): chatbase(False)
def s_ChatGame(): chatbase(True)
def meitems():
    return [("me","имя Аня"),("me","возраст 28"),("hide","скрытое · 0"),("timer","отойти"),("key","сменить ПИН"),("arrive","перенести на другое устройство"),("code","новый бумажный код"),("reset","начать заново")]
def s_Me():
    hdr("я",right="back")
    for i,(ic,l) in enumerate(meitems()):
        y=82+i*72; box(16,y,343,56,shadow=True)
        icon(22,y+6,ic,TH["plate"],0.85); T(72,y+34,l,15,TH["fg"],"b")
        a(f'<path d="M336 {y+20} L344 {y+28} L336 {y+36}" fill="none" stroke="{TH["fg"]}" stroke-width="3"/>')
    tabbar3(2)
def s_Meeditname():
    y=hdr("имя"); T(16,y+10,"меняется на чистом счету",14,TH["mu"],"m")
    y=field(y+26,"имя","Аня"); y=wbtn(y,"check","off"); wbtn(y,"back","sec")
def s_Hidden():
    hdr("скрытые фразы",back=True); T(187,130,"ничего не скрыто",17,TH["mu"],"b","middle")
def s_Meaway():
    y=hdr("отойти")
    for l in ("20 минут","час","4 часа"):
        T(16,y+24,l,17,TH["fg"],"b"); a(f'<path d="M340 {y+12} L346 {y+18} L340 {y+24}" fill="none" stroke="{TH["fg"]}" stroke-width="2.5"/><rect x="16" y="{y+44}" width="343" height="3" fill="{INK if TH["panel"]!=NPN else NTL}"/>'); y+=58
    T(16,y+20,"выберите срок — посчитаем, что он стоит",14,TH["mu"],"m")
    infobtn(16,y+36,"Ваши фразы исчезнут вместе с лайками, ваши лайки на чужих фразах и столах снимутся, а предложения поговорить сгорят. Беседы живут по своим срокам: этот перерыв переживут только те, чей срок дольше перерыва с учётом вашей последней реплики, — сколько именно, сказано выше. Если вы сидите за столом — вы из-за него встанете, игра продолжится без вас. Фраза, которая ещё ждёт проверки, исчезнет вместе с остальными. Часовой предел публикаций и пауза после отказов перерыв переживут: вернувшись, вы получите четыре свободных места, но не новый час.")
    y=wbtn(y+96,"timer","off"); wbtn(y,"back","sec")
def s_Mepin():
    y=hdr("Смена ПИНа"); y=field(y-4,"текущий"); y=field(y,"новый"); y=field(y,"новый ещё раз")
    y=wbtn(y+4,"check","off"); wbtn(y,"back","sec")
def s_Departure():
    y=hdr("Перенос личности")
    infobtn(16,y,"Личность уедет на другое устройство: в другой терминал или в браузер. Здесь появится код из девяти символов — его набирают там.")
    infobtn(68,y,"Здесь личность замрёт: новые сообщения приходить перестанут, а переписка на этом устройстве станет нечитаемой навсегда — даже если вы вернёте личность сюда.",warn=True)
    y=field(y+58,"текущий"); y=wbtn(y,"code","off"); wbtn(y,"back","sec")
def s_Reissue():
    y=hdr("Новый бумажный код")
    infobtn(16,y,"Сначала — код, записанный сейчас. Он перестанет работать, как только новый будет подтверждён.")
    y=field(y+58,"код"); y=wbtn(y,"check","off"); wbtn(y,"back","sec")
def s_Mereset():
    y=hdr("Начать заново")
    infobtn(16,y,"Эта личность закрывается навсегда, и здесь начинается новая.",warn=True)
    infobtn(68,y,"Бумажный код станет бесполезен: поднять эту личность будет нечем.",warn=True)
    y=para(16,y+60,"исчезнет фраз: 1 · закончится бесед и предложений: 1",17,TH["fg"])
    y=field(y+18,"ПИН"); y=wbtn(y,"reset","off"); wbtn(y,"back","sec")
def s_Unlock():
    y=hdr("ПИН"); infobtn(16,y,"Это устройство помнит вас. Введите ПИН, чтобы продолжить.")
    field(y+56,"ПИН"); y=wbtn(670,"key","off"); wbtn(y,"forget","sec")
def s_NewTable():
    y=hdr("Новый стол",back=True)
    y=field(y-4,"игра","dots",select=True); y=field(y,"набор","3x3",select=True); y=field(y,"мест","2",select=True)
    y=field(y,"название — можно не давать","вечер mupseceg")
    infobtn(16,y,"без сквозного шифрования: узел видит доску и реплики, реплика ждёт модерации")
    y=wbtn(y+56,"table","pri"); wbtn(y,"back","sec")
def tabletop(n,seat):
    hdr("стол · «вечер mupseceg» · dots",size=17)
    T(16,104,f"играют {n} · смотрят 0 ·",14,TH["mu"],"m"); heartn(186,104,0)
    T(16,126,f"сидят: {seat}",14,TH["mu"],"m")
    infobtn(310,90,"без сквозного шифрования: узел видит доску и реплики, реплика ждёт модерации"); return 140
def sayrow(y):
    a(f'<rect x="16" y="{y}" width="255" height="48" fill="{PAPER if TH["panel"]!=NPN else "#0e1324"}" stroke="{INK if TH["panel"]!=NPN else NTL}" stroke-width="3"/>')
    wbtn(y,"say","pri",x=283,w=76,h=48); return y+64
def s_Table():
    y=tabletop(1,"вы"); T(16,y+28,"партия ещё не началась",17,TH["fg"],"b")
    y=sayrow(y+64); y=wbtn(y,"play","pri"); rowbtns(y,[("giveup","sec"),("boom","sec"),("stand","sec")],w=80)
def s_TableBoards():
    y=tabletop(2,"вы · Борис"); T(16,y+28,"ваш ход · 300 с",17,TH["fg"],"h")
    box(16,y+48,200,200,fill=TH["panel"])
    for i in range(4):
        a(f'<path d="M{40+i*50} {y+72} V{y+222} M40 {y+72+i*50} H190" stroke="{TH["mu"]}" stroke-width="2"/>')
    for i in range(4):
        for j in range(4): a(f'<circle cx="{40+i*50}" cy="{y+72+j*50}" r="6" fill="{TH["bf2"]}" stroke="{INK}" stroke-width="2"/>')
    T(16,y+284,"Борис — сыграю",14,TH["mu"],"m")
    y=sayrow(y+300); rowbtns(y,[("pass","sec"),("giveup","sec"),("boom","sec"),("stand","sec")],w=72)
def s_Blocked():
    hdr("Заблокировано: 1",back=True)
    T(16,118,"блокировка от 1 октября 2026 г.",16,TH["fg"],"b"); wbtn(92,"unblock","sec",x=299,w=60,h=44); a(f'<rect x="16" y="148" width="343" height="3" fill="{INK if TH["panel"]!=NPN else NTL}"/>')
def s_Statements():
    y=hdr("Ограничений: 1")
    rows=[("Что произошло","скрыто из ленты"),("Почему","фраза скрыта по жалобе соседа"),("Как решали","автоматическая проверка не применялась; решение принял человек"),("Основание","условия: правила сообщества, п. 3"),("Что дальше","ответить нам, обратиться к координатору цифровых услуг, обратиться в суд")]
    yy=y+20; parts=[]
    for k,v in rows: parts.append((k,wrap(v,16,300)))
    h=sum(24+len(v)*22 for k,v in parts)+50
    box(16,y,343,h,cut=18)
    for k,v in parts:
        T(32,yy+4,k,13,TH["mu"],"h"); yy+=20
        for l in v: T(32,yy+4,l,16,TH["fg"],"b"); yy+=22
        yy+=4
    T(32,yy+10,"01.10.2026",14,TH["mu"],"m")
    wbtn(y+h+22,"check","pri")
def cab(title,path,tabs=None):
    y=urlbar(path,tabs); T(16,y+40,title,28,TH["fg"],"h"); return y+66
def s_Cabinetsignin():
    y=cab("Рекламный кабинет","web-adv:4173"); infobtn(16,y-6,"Вход только по ссылке из письма.")
    y=field(y+44,"почта","shoot-mupseceg@example.test"); y=field(y,"контакт — для новой учётной записи","Мария, +357 99 000000"); wbtn(y,"link","pri")
def s_Cabinetsent():
    y=cab("Рекламный кабинет","web-adv:4173")
    box(16,y,343,64,fill=TH["plate"]); para(30,y+8,"если адрес зарегистрирован, письмо отправлено",15,INK,maxw=315)
    infobtn(16,y+86,"Ссылка одноразовая и живёт 15 минут; открывается в том же браузере, где её запросили.")
def s_Cabinetvenues():
    y=cab("Верификация","web-adv:4173/venues",[("venue",True),("offers",False)])
    box(16,y-10,343,250,cut=18); yy=y+18
    T(32,yy,"Пекарня «Колос» mupseceg",16,TH["fg"],"h"); T(32,yy+26,"Макариу 12, Лимасол",14,TH["mu"],"m")
    T(32,yy+54,"не подтверждена",16,TH["warn"],"b"); T(32,yy+80,"точка: 34.6786, 33.0413 · 1000 м",14,TH["mu"],"m")
    rowbtns(yy+100,[("pin","sec"),("mail","sec")],x=32,w=146)
    infobtn(16,y+256,"Пока точка не подтверждена, оффер опубликовать нельзя. У каждого заведения свой конверт.")
    y=field(y+306,"название",h=40); y=field(y,"адрес",h=40); T(16,y+8,"точка на карте",14,TH["fg"],"h"); y=field(y+16,"широта",h=40); field(y,"долгота",h=40)
def s_Cabinetnewoffer():
    y=cab("Новый оффер","web-adv:4173/offers/new",[("venue",False),("offers",True)])-12
    for lab,val,hint,sel in (("заведение","Пекарня «Колос» mupseceg · Макариу 1",None,True),("текст","Второй круассан за полцены",None,False),("скидка","−20 %",None,False),
        ("условия","при заказе от двух","пусто — значит без ограничений",False),("скидка до","10/08/2026, 05:08 PM","не дальше 90 дней от публикации",False),
        ("промокод","КОЛОС20",None,False),("ссылка","https://kolos.example/","сокращатели не принимаются",False)):
        y=field(y,lab,val,hint=hint,select=sel,h=38)
        y-=8
    wbtn(y+8,"eye","sec")
def s_Cabinetoffers():
    y=cab("Мои офферы","web-adv:4173/offers",[("venue",False),("offers",True)])
    wbtn(y-58,"plus","pri",x=299,w=60,h=44)
    box(16,y,343,236,cut=18); yy=y+30
    T(32,yy,"в ленте",15,TH["fg"],"b"); burst(80,yy+34,40,fill=TH["bf"],n=TH["bn"],inner=TH["bi"],sw=3); T(80,yy+41,"−20 %",17,INK,"h","middle")
    T(124,yy+42,"Второй круассан за полцены",15,TH["fg"],"b")
    T(32,yy+92,"скидка до 8 октября, 17:08",14,TH["mu"],"m"); T(32,yy+118,"переходов по ссылке 0",14,TH["mu"],"m")
    T(32,yy+146,"Ссылка:",14,TH["mu"],"m"); T(32,yy+168,"sosed.place/o/d815457d7ede06a4",14,TH["mu"],"m")
def s_Offer():
    iconbtn(10,16,"back",PAPER); T(16,130,"Вы покидаете sosed",26,TH["fg"],"h")
    box(16,156,343,74,fill=TH["plate"]); T(187,203,"ourcafe.cy",28,INK,"mono","middle")
    T(16,272,"Это ссылка автора оффера.",17,TH["fg"],"b"); T(16,298,"Мы её не проверяли.",17,TH["fg"],"b")
    y=wbtn(670,"open","pri"); wbtn(y,"close","sec")
def s_Restore():
    y=hdr("Бумажный код")
    infobtn(16,y,"Введите шестнадцать символов с бумаги. Группы можно разделять дефисом или пробелом.")
    y=field(y+56,"код"); infobtn(16,y,"Прежний ПИН перестанет работать. Истории на этом устройстве и так нет — терять нечего.")
    y=field(y+56,"новый"); y=field(y,"новый ещё раз"); y=wbtn(y+4,"key","off"); wbtn(y,"back","sec")
def s_Arrival():
    y=hdr("Перенос сюда")
    infobtn(16,y,"На устройстве, где личность живёт сейчас, откройте перенос — там появится код из девяти символов. Наберите его здесь.")
    y=field(y+56,"код"); y=wbtn(y,"open","off"); wbtn(y,"back","sec")
SCREENS=[("Splash",s_Splash),("Register",s_Register),("Register-1",s_Register1),("Register-2",s_Register2),("Feed",s_Feed),("Composer",s_Composer),("Card",s_Card),
 ("Card-liked",s_Cardliked),("Likes",s_Likes),("Card-matched",s_Cardmatched),("Inbox",s_Inbox),("Match",s_Match),("Match-waiting",s_Matchwaiting),("Chat",s_Chat),
 ("ChatGame",s_ChatGame),("Me",s_Me),("Me-edit-name",s_Meeditname),("Hidden",s_Hidden),("Me-away",s_Meaway),("Me-pin",s_Mepin),("Departure",s_Departure),
 ("Reissue",s_Reissue),("Me-reset",s_Mereset),("Unlock",s_Unlock),("NewTable",s_NewTable),("Table",s_Table),("TableBoards",s_TableBoards),("Blocked",s_Blocked),
 ("Statements",s_Statements),("Cabinet-sign-in",s_Cabinetsignin),("Cabinet-sent",s_Cabinetsent),("Cabinet-venues",s_Cabinetvenues),("Cabinet-new-offer",s_Cabinetnewoffer),
 ("Cabinet-offers",s_Cabinetoffers),("Offer",s_Offer),("Restore",s_Restore),("Arrival",s_Arrival)]
n=0
scr_begin("light",open_info=True); s_Meaway(); scr_end("Me-away-info"); n+=1
for name,fn in SCREENS:
    variants=["light","dark"]+(["neighbro"] if name in ("Feed","Card","Match","Chat") else [])
    for v in variants:
        scr_begin(v); fn(); scr_end(name+("" if v=="light" else "-"+v)); n+=1
if CHECK:
    stale=[]
    for dirpath,_,files in os.walk(STAGE):
        for f in files:
            new=os.path.join(dirpath,f); rel=os.path.relpath(new,STAGE); old=os.path.join(ROOT,rel)
            if not os.path.exists(old) or open(old).read()!=open(new).read(): stale.append(rel)
    have=set(f for f in os.listdir(SCR) if f.endswith(".svg")) if os.path.isdir(SCR) else set()
    made=set(f for f in os.listdir(os.path.join(STAGE,"panel/design/sheets-comic")))
    stale+=[f"panel/design/sheets-comic/{f} (not made by the generator)" for f in sorted(have-made)]
    for r in sorted(stale): print("  ✗ устарел:", r)
    if stale: print(f"✗ комикс-листов устарело: {len(stale)} — scripts/design/comic-sheets.py"); sys.exit(1)
    print(f"комикс-листов: {n} и обзорный лист — все собраны из текущего генератора"); sys.exit(0)
print(f"комикс-листов записано: {n} → panel/design/sheets-comic, обзорный лист → web/design/comic-2026-10-01.svg")
