/* eslint-disable @next/next/no-img-element */
"use client";
import { useState } from "react";

/** Product image at a fixed size (object-fit: cover); falls back to branded initials when there's no image. */
export function FgImage({ src, name, className = "" }: { src?: string; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img src={src} alt={name} loading="lazy" className={`fg-img ${className}`} onError={() => setBroken(true)} />;
  const initials = name.replace(/ /g, " ").split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).slice(0, 2).map((w) => w.replace(/[^a-z0-9]/gi, "")[0]).join("").toUpperCase();
  return <div className={`fg-img fg-img--ph ${className}`} role="img" aria-label={name}>{initials || "?"}</div>;
}
