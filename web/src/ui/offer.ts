// The discount is the author's free text: "20 %", "-20 %" and "−20%" all
// arrive. The card adds its own minus, so any leading one is dropped first.
export function offerLabel(discount: string): string {
  return "−" + discount.trim().replace(/^[-−–—‒﹣－]+\s*/u, "");
}
