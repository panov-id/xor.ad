// Icon tips (owner 12.10.2026: «значки со всплывашками из слов»): a button that
// shows only an icon keeps its word in aria-label; this puts that word in a small
// bubble over the button — after a short hover with a mouse, on keyboard focus,
// and on a long press with a finger (the press then does not fire the button).
// One bubble for the page, fixed on top: a tip inside the button would be cut by
// the capsule's overflow (ui-split). Screen readers already read aria-label, so
// the bubble is aria-hidden.

const HOVER_MS = 450;
const PRESS_MS = 450;
const SHOWN_MS = 1800;

function iconOnly(t: EventTarget | null): HTMLElement | null {
  const el = t instanceof Element ? t.closest<HTMLElement>("button[aria-label], a[aria-label]") : null;
  // data-tip: a link that shows a short word and names the whole document in its bubble (sign-up, step 1).
  return el && (el.hasAttribute("data-tip") || !el.textContent?.trim()) ? el : null;
}

export function installIconTips(doc: Document = document): void {
  const tip = doc.createElement("div");
  tip.className = "ui-icon-tip";
  tip.setAttribute("aria-hidden", "true");
  tip.hidden = true;
  doc.body.append(tip);

  let timer = 0;
  let hideTimer = 0;
  let pressed: HTMLElement | null = null;
  let swallowClick = false;

  const show = (el: HTMLElement) => {
    tip.textContent = el.getAttribute("data-tip") ?? el.getAttribute("aria-label") ?? "";
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), vw - t.width - 8);
    let above = r.top - t.height - 8;
    // The button's own reason (aria-describedby) stays readable: a bubble that would lie on it
    // rises above it instead (register-3: «done» over «Not yet: enter the second…»).
    for (const id of (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)) {
      const d = doc.getElementById(id)?.getBoundingClientRect();
      if (d && d.width > 0 && above < d.bottom && above + t.height > d.top && left < d.right && left + t.width > d.left) above = d.top - t.height - 8;
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${above >= 8 ? above : r.bottom + 8}px`;
  };
  const hide = () => { clearTimeout(timer); clearTimeout(hideTimer); tip.hidden = true; };

  doc.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const el = iconOnly(e.target);
    clearTimeout(timer);
    if (el) timer = window.setTimeout(() => show(el), HOVER_MS); else tip.hidden = true;
  });
  doc.addEventListener("pointerout", (e) => { if (e.pointerType === "mouse" && iconOnly(e.target)) hide(); });

  doc.addEventListener("focusin", (e) => {
    const el = iconOnly(e.target);
    if (el && el.matches(":focus-visible")) show(el);
  });
  doc.addEventListener("focusout", hide);

  doc.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") { hide(); return; }
    pressed = iconOnly(e.target);
    swallowClick = false;
    if (!pressed) return;
    const el = pressed;
    timer = window.setTimeout(() => {
      swallowClick = true;
      show(el);
      hideTimer = window.setTimeout(hide, SHOWN_MS);
    }, PRESS_MS);
  });
  const release = () => { clearTimeout(timer); pressed = null; };
  doc.addEventListener("pointerup", release);
  doc.addEventListener("pointercancel", release);
  // A long press reads the word; it must not also press the button.
  doc.addEventListener("click", (e) => { if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  doc.addEventListener("contextmenu", (e) => { if (iconOnly(e.target)) e.preventDefault(); });
  doc.addEventListener("scroll", hide, true);
}
