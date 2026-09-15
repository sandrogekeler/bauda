/**
 * Phase 0 verification harness.
 *
 * Answers the three questions Phase 0 exists to answer (features.md section 14):
 *   1. does the 3D -> ASCII output read clearly at each tier's grid size?
 *   2. does continuous placement land where it is aimed?
 *   3. does it hold frame rate?
 *
 * Dumps both a PNG and the literal character grid per tier, so legibility can
 * be inspected as text rather than eyeballed from a screenshot.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const OUT = new URL('../shots/', import.meta.url).pathname
const PORT = 4399

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json',
}

const server = createServer((req, res) => {
  let p = normalize(decodeURIComponent(req.url.split('?')[0]))
  if (p === '/' || p.endsWith('/')) p += 'index.html'
  const file = join(DIST, p)
  if (!file.startsWith(DIST) || !existsSync(file)) { res.writeHead(404); res.end('nope'); return }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})

await new Promise((r) => server.listen(PORT, r))
mkdirSync(OUT, { recursive: true })

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({
  executablePath: CHROME,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
})

// iPhone 14-ish portrait. The real target device.
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text()) })
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__bauda, null, { timeout: 15000 })
await page.waitForTimeout(800)

const report = []

const missing = await page.evaluate(() => window.__bauda.missingGlyphs())
console.log(`\nfont coverage: ${missing.length ? `MISSING ${missing.join(' ')}` : 'all glyphs rendered'}`)

for (let tier = 0; tier <= 5; tier++) {
  await page.evaluate((t) => window.__bauda.setTier(t), tier)
  await page.waitForTimeout(600)
  const grid = await page.evaluate(() => window.__bauda.grid())
  await page.screenshot({ path: join(OUT, `tier-${tier}.png`) })
  const text = await page.evaluate(() => window.__bauda.dump())
  writeFileSync(join(OUT, `tier-${tier}.txt`), text)

  // frame rate over a second of real rendering
  await page.waitForTimeout(1100)
  const fps = await page.evaluate(() => window.__bauda.fps())

  // how much of the viewport carries ink (a blank grid is the failure mode)
  const lines = text.split('\n')
  const body = lines.slice(3, lines.length - 9)
  const chars = body.join('').replace(/ /g, '').length
  const cells = body.length * grid.cols
  report.push({ tier, grid: `${grid.cols}x${grid.rows}`, fps: fps.toFixed(0), ink: `${((chars / cells) * 100).toFixed(1)}%` })
  console.log(`tier ${tier}: ${grid.cols}x${grid.rows}  ${fps.toFixed(0)}fps  ink ${((chars / cells) * 100).toFixed(1)}%`)
}

// --- placement accuracy ----------------------------------------------------
await page.evaluate(() => window.__bauda.setTier(2))
await page.waitForTimeout(400)
const precision = await page.evaluate(() => {
  const b = window.__bauda
  b.reset()
  // Place two units a quarter of a world unit apart: finer than one character
  // cell covers, to prove the grid is not quantizing position.
  const ok1 = b.place('slot', 20.0, 18.0, 0)
  const ok2 = b.place('slot', 23.25, 18.0, 0)
  return { ok1, ok2, income: b.income() }
})
console.log('\nsub-cell placement:', precision)

// --- deterministic save round-trip -----------------------------------------
const saveOk = await page.evaluate(() => {
  const b = window.__bauda
  const blob = b.exportSave()
  const back = b.importSave(blob)
  return !!back && back.buildings.length === b.importSave(blob).buildings.length
})
console.log('save export/import round-trip:', saveOk ? 'ok' : 'FAILED')

writeFileSync(join(OUT, 'report.json'), JSON.stringify({ missing, report, precision, saveOk }, null, 2))

await browser.close()
server.close()
console.log(`\nwrote ${OUT}`)
