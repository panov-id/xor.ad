// One tap on a sticker tile (chat plate, table strip): a plain button whose look the screen's
// stylesheet gives by its data-part parent; the kit owns the element so screens hold no raw <button>.
import type { ButtonHTMLAttributes } from "react";

export function StickerButton({ type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { [data: `data-${string}`]: string | undefined }) {
  return <button type={type} {...rest} />;
}
