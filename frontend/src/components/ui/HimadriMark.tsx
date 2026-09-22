// src/components/ui/HimadriMark.tsx
//
// HIMADRI's logomark — replaces a generic lucide "Snowflake" icon dropped
// into a colored box (read as a placeholder/default icon rather than a
// deliberate brand mark). Custom-drawn, not a stock icon: twin overlapping
// peaks (Himadri = "snow-capped mountain" in Sanskrit; the ghosted rear peak
// doubles as the literal "digital twin" — a real structure and its virtual
// replica) with a small satellite arc + node over the summit, standing in
// for the platform's remote-monitoring/remote-management angle. Single-color
// (currentColor) so it inherits whatever accent color wraps it, same as the
// icon it replaces.
export function HimadriMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      {/* Rear peak — the "twin": a fainter echo of the front peak */}
      <path d="M3.5 24.5L11 12L18.5 24.5H3.5Z" fill="currentColor" fillOpacity="0.28" />
      {/* Front peak */}
      <path d="M11.5 24.5L21 7.5L30.5 24.5H11.5Z" fill="currentColor" />
      {/* Snow-cap notch on the front peak, cut from the base surface color
          via mix-blend so it reads correctly on either surface, not a hard-
          coded white */}
      <path d="M21 7.5L24.6 13.9H17.4L21 7.5Z" fill="currentColor" fillOpacity="0.35" style={{ mixBlendMode: 'screen' }} />
      {/* Satellite arc + node over the summit — remote monitoring */}
      <path d="M23.4 6.2a5.4 5.4 0 0 1 3.6 4.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="27.3" cy="11.4" r="1.35" fill="currentColor" />
    </svg>
  )
}
