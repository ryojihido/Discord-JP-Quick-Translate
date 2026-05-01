import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Discord blurple globe — represents translation/international
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- Blurple rounded-square background -->
  <rect width="128" height="128" rx="22" ry="22" fill="#5865F2"/>

  <!-- Globe circle -->
  <circle cx="64" cy="64" r="36"
    fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/>

  <!-- Center vertical meridian (ellipse) -->
  <ellipse cx="64" cy="64" rx="16" ry="36"
    fill="none" stroke="white" stroke-width="5" stroke-linecap="round"/>

  <!-- Equator -->
  <line x1="28" y1="64" x2="100" y2="64"
    stroke="white" stroke-width="5" stroke-linecap="round"/>

  <!-- Upper latitude -->
  <line x1="36" y1="45" x2="92" y2="45"
    stroke="white" stroke-width="4" stroke-linecap="round"/>

  <!-- Lower latitude -->
  <line x1="36" y1="83" x2="92" y2="83"
    stroke="white" stroke-width="4" stroke-linecap="round"/>
</svg>`

const SIZES = [16, 48, 128]
const OUT_DIRS = [
  join(__dirname, '../icons'),
  join(__dirname, '../dist/icons'),
]

for (const dir of OUT_DIRS) {
  mkdirSync(dir, { recursive: true })
}

for (const size of SIZES) {
  const buf = await sharp(Buffer.from(SVG))
    .resize(size, size)
    .png()
    .toBuffer()

  for (const dir of OUT_DIRS) {
    writeFileSync(join(dir, `icon${size}.png`), buf)
  }
  console.log(`✓ icon${size}.png (${size}x${size})`)
}

console.log('\nDone — icons/ and dist/icons/ updated.')
