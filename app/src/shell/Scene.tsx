// The prototype's scenes (feed.html: the band 150 tall, radius 28; splash.html: the yard filling the panel) with whatever
// lies over their foot (the place panel, the brand's glass card). The pictures are the prototype's (proto-art.gen.ts).
import type { ReactNode } from "react";
import { PROTO_ART } from "./proto-art.gen";

export function Scene({ kind = "feed", children }: { kind?: "feed" | "splash"; children?: ReactNode }) {
  const art = PROTO_ART[`scene-${kind}`];
  return (
    <div className="k-scene" data-kind={kind}>
      <svg aria-hidden="true" viewBox={art.viewBox} preserveAspectRatio="xMidYMid slice" dangerouslySetInnerHTML={{ __html: art.body }} />
      {children && <div className="k-scene-over">{children}</div>}
    </div>
  );
}

/** The brand's mark as the prototype draws it (splash.html, loading.html). */
export function Logo({ size, label }: { size: number; label?: string }) {
  const art = PROTO_ART.logo;
  return <svg className="k-logo" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} width={size} height={size} viewBox={art.viewBox} dangerouslySetInnerHTML={{ __html: art.body }} />;
}
