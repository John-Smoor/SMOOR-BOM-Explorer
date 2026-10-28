/* eslint-disable @next/next/no-img-element */
/** SMOOR brand logo (official artwork in /public/smoor-logo.jpg). */
export function LogoMark({ size = 40 }: { size?: number }) {
  return <img src="/smoor-logo.jpg" width={size} height={size} alt="SMOOR" className="logo-mark" />;
}

export function Logo({ sub = "BOM Explorer", compact = false }: { sub?: string; compact?: boolean }) {
  return (
    <span className={`logo ${compact ? "logo--compact" : ""}`}>
      <LogoMark size={compact ? 34 : 44} />
      <span className="logo-text">
        <span className="logo-word">SMOOR</span>
        <span className="logo-sub">{sub}</span>
      </span>
    </span>
  );
}
