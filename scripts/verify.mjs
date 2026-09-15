/**
 * Phase 1 verification: balance pacing, determinism, and channel screenshots.
 *
 * Runs the real production bundle in a real browser, so what is measured is
 * what ships.
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const OUT = new URL('../shots/', import.meta.url).pathname
const PORT = 4400
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json',
}

const server = createServer((req, res) => {
  let p = normalize(decodeURIComponent(req.url.split('?')[0]))
  if (p === '/' || p.endsWith('/')) p += 'index.html'
  const file = join(DIST, p)
  if (!file.startsWith(DIST) || !existsSync(file)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, r))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text()) })

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__bauda, null, { timeout: 15000 })
await page.waitForTimeout(400)

// --- boot screen -----------------------------------------------------------
await page.screenshot({ path: join(OUT, 'p1-boot.png') })
await page.evaluate(() => window.__bauda.skipBoot())
await page.waitForTimeout(300)

// --- first-run screen ------------------------------------------------------
await page.screenshot({ path: join(OUT, 'p1-firstrun.png') })

// --- determinism -----------------------------------------------------------
console.log('\n── determinism ──')
const det = await page.evaluate(() => {
  const a = window.__bauda.autoplay(12345, 12)
  const b = window.__bauda.autoplay(12345, 12)
  const c = window.__bauda.autoplay(999, 12)
  return {
    same: a.rngState === b.rngState && a.totalCash === b.totalCash,
    differsBySeed: a.totalCash !== c.totalCash,
    a: a.totalCash, b: b.totalCash, c: c.totalCash,
  }
})
console.log(`  identical seed reproduces: ${det.same ? 'yes' : 'NO'}`)
console.log(`  different seed diverges:   ${det.differsBySeed ? 'yes' : 'NO'}`)

// --- pacing ----------------------------------------------------------------
console.log('\n── pacing (simulated minutes) ──')
const runs = await page.evaluate(() =>
  [1, 2, 3].map((s) => window.__bauda.autoplay(s * 7919, 180)))
const fmtN = (n) => n === null ? '—' : n.toFixed(1)
for (const r of runs) {
  console.log(
    `  seed ${String(r.seed).padStart(6)}  payout ${fmtN(r.firstPayout)}m` +
    `  1k ${fmtN(r.cash1k)}m  cashout-avail ${fmtN(r.cashoutAvailable)}m` +
    `  took ${fmtN(r.firstCashout)}m  T1 ${fmtN(r.firstTier)}m  T2 ${fmtN(r.tier2)}m`)
  console.log(
    `                total ${r.totalCash.toExponential(2)}  income ${r.income.toExponential(2)}/s` +
    `  chips ${r.chips}  cashouts ${r.cashouts}  units ${r.units}` +
    `  peakHeat ${(r.peakHeat * 100).toFixed(0)}%  meltdowns ${r.meltdowns}`)
}

// --- long horizon ----------------------------------------------------------
console.log('\n── 12 hours ──')
const long = await page.evaluate(() => window.__bauda.autoplay(4242, 720))
console.log(`  total ${long.totalCash.toExponential(2)}  income ${long.income.toExponential(2)}/s` +
  `  chips ${long.chips}  cashouts ${long.cashouts}  draws ${long.draws}` +
  `  units ${long.units}  peakHeat ${(long.peakHeat * 100).toFixed(0)}%  meltdowns ${long.meltdowns}`)

// --- channel screenshots ---------------------------------------------------
console.log('\n── channels ──')
await page.evaluate(() => {
  const b = window.__bauda
  b.skipBoot()
  b.give(400000)
  const plan = [
    ['slot3', 0, 0], ['slot2', -7, -3], ['slot1', -7.5, 2.5], ['neon', -3.5, 6],
    ['wheel2', 6.5, 3], ['wheel1', 5, -5], ['plaza', 0, -7], ['billboard', 8, -1],
    ['power', 10.5, -7], ['security', -11, -5.5], ['vault', 9, 7],
  ]
  for (const [id, x, z] of plan) b.place(id, x, z, 0.3)
  for (let i = 0; i < 26; i++) b.game.draw(true)
  // Fill the machines so the MACH panel has something real in it.
  for (const u of b.game.units) {
    for (let i = 0; i < u.slots.length; i++) {
      if (u.slots[i]) continue
      const owned = Object.keys(b.game.inventory).filter((k) => b.game.inventory[k] > 0)
      if (!owned.length) break
      b.game.install(u, i, owned[0])
    }
  }
  b.step(1200)
})
for (const [tier, channel] of [[0, 'MAP'], [2, 'MAP'], [2, 'MACH'], [2, 'OPS'], [2, 'SYS']]) {
  await page.evaluate(([t, c]) => { window.__bauda.setTier(t); window.__bauda.setChannel(c) }, [tier, channel])
  if (channel === 'MACH') {
    await page.evaluate(() => {
      const id = window.__bauda.game.units.find((u) => u.slots.length > 3)?.id
      if (id) window.__bauda.act(`mach:${id}`)
    })
  }
  await page.waitForTimeout(500)
  const name = `p1-t${tier}-${channel.toLowerCase()}`
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  writeFileSync(join(OUT, `${name}.txt`), await page.evaluate(() => window.__bauda.dump()))
  console.log(`  ${name}`)
}

// --- narrow-width control overflow ----------------------------------------
// Regions are rebuilt during the render loop, so every state change has to be
// followed by an actual frame before the result can be read.
const nextFrame = () => page.evaluate(() =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

console.log('\n\u2500\u2500 40-column layout \u2500\u2500')
await page.evaluate(() => window.__bauda.setTier(0))
await nextFrame()

const overflow = { channels: {}, buildReachable: 0, buildTotal: 0 }
let overflowClean = true
for (const c of ['MAP', 'MACH', 'OPS', 'SYS']) {
  await page.evaluate((ch) => { window.__bauda.setChannel(ch); window.__bauda.act('back') }, c)
  await nextFrame()
  const o = await page.evaluate(() => ({
    overflow: [...window.__bauda.overflow()],
    regions: window.__bauda.regions().length,
  }))
  overflow.channels[c] = o
  if (o.overflow.length) overflowClean = false
  console.log(`  ${c.padEnd(5)} ${String(o.regions).padStart(2)} controls  overflow: ${o.overflow.length ? o.overflow.join(',') : 'none'}`)
}

await page.evaluate(() => window.__bauda.setChannel('MAP'))
await nextFrame()
const ids = new Set()
for (let i = 0; i < 14; i++) {
  const page_ids = await page.evaluate(() => window.__bauda.regions().filter((r) => r.startsWith('build:')))
  for (const id of page_ids) ids.add(id)
  await page.evaluate(() => window.__bauda.act('page:+'))
  await nextFrame()
}
overflow.buildReachable = ids.size
overflow.buildTotal = await page.evaluate(() => window.__bauda.game.unlockedUnits.length)
console.log(`  build options reachable: ${overflow.buildReachable}/${overflow.buildTotal}`)
const pass = overflowClean && overflow.buildReachable === overflow.buildTotal
console.log(`  verdict: ${pass ? 'OK' : 'FAIL'}`)
await page.screenshot({ path: join(OUT, 'p1-t0-narrow.png') })

writeFileSync(join(OUT, 'phase1.json'), JSON.stringify({ det, runs, long, overflow }, null, 2))
await browser.close()
server.close()
