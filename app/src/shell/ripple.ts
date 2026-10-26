// The tap wave (MOTION.md, "Нажатие"): a circle from the touch point, scale .3 -> 1.2, gone in 0.45 s. One listener on
// the document; the circle is a child of <body>, fixed, so no screen's layout or stacking holds it. Nothing is drawn when
// the person asked for reduced motion (shell.css also hides it).
const TAPPABLE = 'button, a[href], [role="button"], [role="tab"], [role="link"], summary, label';

export function watchTaps(): () => void {
  const onDown = (e: PointerEvent) => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const hit = e.target instanceof Element ? e.target.closest(TAPPABLE) : null;
    if (!hit || (hit as HTMLButtonElement).disabled || hit.getAttribute("aria-disabled") === "true") return;
    const wave = document.createElement("span");
    wave.className = "tap-ripple";
    wave.setAttribute("aria-hidden", "true");
    wave.style.left = `${e.clientX}px`;
    wave.style.top = `${e.clientY}px`;
    wave.addEventListener("animationend", () => wave.remove(), { once: true });
    document.body.appendChild(wave);
  };
  document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
  return () => document.removeEventListener("pointerdown", onDown, { capture: true });
}
