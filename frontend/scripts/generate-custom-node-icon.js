// scripts/generate-custom-node-icon.js
//
// One-time generator for public/assets/infrastructure/Custom_Node.png — run
// this script once (`node scripts/generate-custom-node-icon.js`) whenever
// the icon needs regenerating; the resulting PNG is committed and reused by
// every custom node from then on, matching every other node type's static
// icon asset. Not run per-node-creation and not run at request time.
const sharp = require('sharp')
const path = require('path')

// Rounded slate badge with a sparkle glyph — same visual language as the
// other node-type icons (boxy corners, muted slate tone), distinct enough
// to read as "user-defined / AI-analyzed" rather than a fixed infra category.
const svg = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="8" width="240" height="240" rx="24" fill="#1E2530" stroke="#94A3B8" stroke-width="4"/>
  <g fill="#7DD3FC">
    <path d="M128 60 L140 108 L188 120 L140 132 L128 180 L116 132 L68 120 L116 108 Z"/>
    <path d="M188 60 L193 76 L209 81 L193 86 L188 102 L183 86 L167 81 L183 76 Z"/>
    <path d="M76 150 L80 163 L93 167 L80 171 L76 184 L72 171 L59 167 L72 163 Z"/>
  </g>
</svg>
`.trim()

const outPath = path.join(__dirname, '..', 'public', 'assets', 'infrastructure', 'Custom_Node.png')

sharp(Buffer.from(svg))
  .png()
  .toFile(outPath)
  .then(() => console.log('Wrote', outPath))
  .catch((err) => {
    console.error('Failed to generate icon:', err)
    process.exit(1)
  })
