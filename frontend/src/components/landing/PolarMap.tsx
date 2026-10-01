// A polar azimuthal map centred on the South Pole: graticule, the Antarctic
// Circle, Maitri, Bharati and HQ in Goa, joined by the satellite links. Pure
// SVG, real coordinates — it is the project's one-picture explanation.

const R = 230
const CX = 260
const CY = 260
const LAT_MAX = -36 // map edge latitude (degrees); HQ in India sits beyond it, drawn on the rim

function project(lat: number, lon: number): [number, number] {
  const r = ((lat + 90) / (90 + LAT_MAX)) * R
  const a = (lon * Math.PI) / 180
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)]
}

const STATIONS = [
  { id: 'maitri', name: 'Maitri', lat: -70.77, lon: 11.73, dx: -12, dy: -14, anchor: 'end' as const },
  { id: 'bharati', name: 'Bharati', lat: -69.4, lon: 76.18, dx: 14, dy: 4, anchor: 'start' as const },
]
const HQ = { name: 'NCPOR · Goa', lat: 15.5, lon: 73.8 }

function arc(from: [number, number], to: [number, number], lift: number): string {
  const mx = (from[0] + to[0]) / 2
  const my = (from[1] + to[1]) / 2
  // pull the control point toward the map edge (outward from centre) for a satellite-hop look
  const dx = mx - CX
  const dy = my - CY
  const len = Math.hypot(dx, dy) || 1
  const cx = mx + (dx / len) * lift
  const cy = my + (dy / len) * lift
  return `M${from[0].toFixed(1)},${from[1].toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${to[0].toFixed(1)},${to[1].toFixed(1)}`
}

export function PolarMap({ className = '' }: { className?: string }) {
  const hq = project(LAT_MAX, HQ.lon)
  const lats = [-80, -70, -60, -50, -40]
  const lons = Array.from({ length: 12 }, (_, i) => i * 30)
  const acRadius = ((-66.5 + 90) / (90 + LAT_MAX)) * R

  return (
    <svg viewBox="0 0 520 520" className={className} role="img" aria-label="Polar map: Maitri and Bharati stations linked to NCPOR, Goa">
      <defs>
        <radialGradient id="pm-ice" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFEFB" />
          <stop offset="100%" stopColor="#F3EFE6" />
        </radialGradient>
        <filter id="pm-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#1C1F33" floodOpacity="0.12" />
        </filter>
      </defs>

      <circle cx={CX} cy={CY} r={R + 14} fill="url(#pm-ice)" filter="url(#pm-soft)" stroke="#DDD5C2" />
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#DDD5C2" />

      {/* graticule */}
      {lats.map((lat) => (
        <circle key={lat} cx={CX} cy={CY} r={((lat + 90) / (90 + LAT_MAX)) * R} fill="none" stroke="#DDD5C2" strokeWidth="1" strokeDasharray={lat === 0 ? '0' : '2 5'} />
      ))}
      {lons.map((lon) => {
        const [x, y] = project(LAT_MAX, lon)
        return <line key={lon} x1={CX} y1={CY} x2={x} y2={y} stroke="#DDD5C2" strokeWidth="1" strokeDasharray="2 6" />
      })}

      {/* continent (Antarctic Circle, softly filled) */}
      <circle cx={CX} cy={CY} r={acRadius} fill="#ECE6D8" stroke="#C7BDA5" strokeWidth="1.2" />
      <text x={CX} y={CY + 4} textAnchor="middle" fill="#8A8576" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em' }}>
        ANTARCTICA
      </text>

      {/* links */}
      {STATIONS.map((s, i) => {
        const p = project(s.lat, s.lon)
        return (
          <path key={s.id} d={arc(hq, p, -30 + i * 55)} fill="none" stroke="#3A3AB8" strokeWidth="1.6" strokeDasharray="5 6" className="animate-[flow_1.4s_linear_infinite]" opacity="0.85" />
        )
      })}

      {/* stations */}
      {STATIONS.map((s) => {
        const [x, y] = project(s.lat, s.lon)
        return (
          <g key={s.id}>
            <circle cx={x} cy={y} r="14" fill="#F2A71B" opacity="0.18">
              <animate attributeName="r" values="8;18;8" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx={x} cy={y} r="5.5" fill="#1C1F33" stroke="#FFFEFB" strokeWidth="2" />
            <text x={x + s.dx} y={y + s.dy} textAnchor={s.anchor} fill="#1C1F33" style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>
              {s.name}
            </text>
          </g>
        )
      })}

      {/* HQ */}
      <g>
        <circle cx={hq[0]} cy={hq[1]} r="7" fill="#3A3AB8" stroke="#FFFEFB" strokeWidth="2" />
        <text x={hq[0] - 4} y={hq[1] - 30} textAnchor="end" fill="#3A3AB8" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em' }}>
          {HQ.name.toUpperCase()}
        </text>
        <text x={hq[0] - 4} y={hq[1] - 18} textAnchor="end" fill="#8A8576" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5 }}>
          15.5°N · ~11,000 km →
        </text>
      </g>

      {/* ring labels */}
      {[{ lat: -70, t: '70°S' }, { lat: -60, t: '60°S' }, { lat: -50, t: '50°S' }, { lat: -40, t: '40°S' }].map((l) => (
        <text key={l.t} x={CX + 4} y={CY - ((l.lat + 90) / (90 + LAT_MAX)) * R - 3} fill="#B7B09B" style={{ fontFamily: 'var(--font-mono)', fontSize: 8 }}>
          {l.t}
        </text>
      ))}
    </svg>
  )
}
