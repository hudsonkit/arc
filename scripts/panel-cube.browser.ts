/** Browser regressions for projection, drag/keyboard/touch input, selection and motion. */
import puppeteer from 'puppeteer'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPanelCubeScene } from '../src/panel-cube/render'
import { fieldRecorderCube } from '../src/panel-cube/examples'

// Run against the local preview: bun scripts/panel-cube.browser.ts
// ARC_PREVIEW_URL and ARC_CAPTURE_DIR can select another host and artifact folder.
const output = process.env.ARC_CAPTURE_DIR || '/tmp/arc-panel-cube'
mkdirSync(output, { recursive: true })
const preview = process.env.ARC_PREVIEW_URL || 'http://127.0.0.1:5188/panel-cube'
const browser = await puppeteer.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage()
const errors: string[] = []
const checks: string[] = []
page.on('pageerror', error => errors.push(error instanceof Error ? error.message : String(error)))
page.setDefaultTimeout(10_000)

// Compare the actual projected panel paths. Neither control state nor a CSS
// transform alone proves that rotation reached the 3D geometry.
const projection = () => page.$$eval('.pc-diagram [data-panel]', panels => panels
  .map(panel => `${panel.getAttribute('data-panel')}:${panel.getAttribute('data-back')}:${panel.querySelector('path')?.getAttribute('d')}`)
  .sort()
  .join('|'))
const selectedPart = () => page.$eval('.pc-parts', parts =>
  parts.querySelector('[aria-pressed="true"] strong')?.textContent ?? null)
const rotation = () => page.$eval('.pc-diagram', cube => ({
  yaw: Number(cube.getAttribute('data-yaw')),
  pitch: Number(cube.getAttribute('data-pitch')),
}))
const pause = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))
const remember = (name: string) => { checks.push(name); console.log(`PASS ${name}`) }
type Point = { x: number; y: number }
type Axis = 'yaw' | 'pitch'
const handle = (axis: Axis) => `[role="slider"][data-rotation-axis="${axis}"]`
const grip = (axis: Axis) => `[data-rotation-grip="${axis}"]`
const ringLayers = '[data-rotation-layer]'

function expectedProjection(open: boolean, view: { yaw: number; pitch: number }) {
  const scene = createPanelCubeScene(fieldRecorderCube, { progress: Number(open), rotation: view })
  return (scene.children ?? []).flatMap(panel => {
    if (typeof panel === 'string' || !panel.attrs?.['data-panel']) return []
    const path = panel.children?.find(child => typeof child !== 'string' && child.tag === 'path')
    return [`${panel.attrs['data-panel']}:${panel.attrs['data-back']}:${typeof path === 'object' ? path.attrs?.d : undefined}`]
  }).sort().join('|')
}

async function assertExpansion(open: boolean, message: string) {
  // Read angle and geometry in one browser task, including while auto-spin runs.
  const actual = await page.$eval('.pc-diagram', cube => ({
    rotation: { yaw: Number(cube.getAttribute('data-yaw')), pitch: Number(cube.getAttribute('data-pitch')) },
    projection: Array.from(cube.querySelectorAll('[data-panel]'))
      .map(panel => `${panel.getAttribute('data-panel')}:${panel.getAttribute('data-back')}:${panel.querySelector('path')?.getAttribute('d')}`)
      .sort().join('|'),
    pressed: document.querySelector('.pc-open')?.getAttribute('aria-pressed'),
  }))
  assert.equal(actual.pressed, String(open), `${message}: button state changed`)
  assert.equal(actual.projection, expectedProjection(open, actual.rotation), `${message}: panel expansion changed`)
}

async function waitForExpansion(open: boolean) {
  const view = await rotation()
  const scene = createPanelCubeScene(fieldRecorderCube, { progress: Number(open), rotation: view })
  const shadow = scene.children?.find(child => typeof child !== 'string' && child.attrs?.['data-layer'] === 'ambient-shadow')
  const shadowRadius = typeof shadow === 'object' ? Number(shadow.attrs?.rx) : NaN
  // Panel coordinates round to 0.001, so paths can match just before the final
  // animation frame. The unrounded shadow radius also confirms it has settled.
  await page.waitForFunction(({ paths, shadowRadius }) =>
    Number(document.querySelector('[data-layer="ambient-shadow"]')?.getAttribute('rx')) === shadowRadius &&
    Array.from(document.querySelectorAll('.pc-diagram [data-panel]'))
      .map(panel => `${panel.getAttribute('data-panel')}:${panel.getAttribute('data-back')}:${panel.querySelector('path')?.getAttribute('d')}`)
      .sort().join('|') === paths, {}, { paths: expectedProjection(open, view), shadowRadius })
}

async function waitForRings(visible: boolean) {
  await page.waitForFunction(expected => {
    const layers = Array.from(document.querySelectorAll('[data-rotation-layer]'))
    return layers.length === 2 && layers.every(layer => Number(getComputedStyle(layer).opacity) === Number(expected))
  }, {}, visible)
}

async function assertRings(visible: boolean, message: string) {
  const opacity = await page.$$eval(ringLayers, layers => layers.map(layer => Number(getComputedStyle(layer).opacity)))
  assert.deepEqual(opacity, [Number(visible), Number(visible)], message)
}

async function revealRings() {
  await page.hover('.pc-diagram')
  await waitForRings(true)
}

async function assertHiddenRingsDoNotHit() {
  const intercepted = await page.$$eval('[data-rotation-grip], [data-rotation-ring]', elements =>
    elements.some(element => {
      const shape = element as SVGGeometryElement
      const matrix = shape.getScreenCTM()
      if (!matrix) return true
      const point = shape.getPointAtLength(shape.getTotalLength() / 2).matrixTransform(matrix)
      return Boolean(document.elementFromPoint(point.x, point.y)?.closest('[data-rotation-layer]'))
    }))
  assert.equal(intercepted, false, 'An invisible ring still intercepts input')
}

async function waitForOpen() {
  await page.waitForFunction(() => document.querySelector('[data-callout]')?.getAttribute('opacity') === '1')
}

async function clearInspection() {
  await page.mouse.move(2, 2)
  await page.focus('.pc-brand')
}

async function center(selector: string) {
  return page.$eval(selector, element => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  })
}

async function ringGrab(axis: Axis) {
  return page.$eval(`[data-rotation-ring="${axis}"]`, element => {
    const path = element as SVGPathElement
    const matrix = path.getScreenCTM()
    if (!matrix) throw new Error('Rotation ring has no screen transform')
    const length = path.getTotalLength()
    for (const fraction of [0.25, 0.5, 0.75]) {
      const distance = length * fraction
      const from = path.getPointAtLength(distance).matrixTransform(matrix)
      const near = path.getPointAtLength(distance + 1).matrixTransform(matrix)
      const hit = document.elementFromPoint(from.x, from.y)
      if (hit !== path) continue
      const scale = 34 / Math.hypot(near.x - from.x, near.y - from.y)
      return {
        from: { x: from.x, y: from.y },
        dx: (near.x - from.x) * scale,
        dy: (near.y - from.y) * scale,
      }
    }
    throw new Error('No exposed ring stroke found away from its grip')
  })
}

async function mouseDrag(selector: string, dx: number, dy: number) {
  const from = await center(selector)
  await mouseDragFrom(from, dx, dy)
}

async function mouseDragFrom(from: Point, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 })
  await page.mouse.up()
}

async function tabTo(selector: string, limit = 7) {
  const visited: Array<string | null> = []
  for (let step = 0; step < limit; step++) {
    await page.keyboard.press('Tab')
    if (await page.evaluate(target => document.activeElement?.matches(target), selector)) return
    visited.push(await page.evaluate(() => {
      const active = document.activeElement
      return active ? `${active.tagName}:${active.getAttribute('data-front-face') ?? active.getAttribute('aria-label') ?? active.textContent?.slice(0, 30)}` : null
    }))
  }
  assert.fail(`Tab navigation did not reach ${selector}; visited ${JSON.stringify(visited)}`)
}

async function assertOnlyAxisChanged(axis: Axis, before: Awaited<ReturnType<typeof rotation>>, beforeProjection: string) {
  await waitForProjectionChange(beforeProjection)
  const after = await rotation()
  const other = axis === 'yaw' ? 'pitch' : 'yaw'
  assert.notEqual(after[axis], before[axis], `${axis} handle did not rotate its own axis`)
  assert.equal(after[other], before[other], `${axis} handle also changed ${other}`)
  assert.equal(await selectedPart(), 'Storage', `${axis} handle accidentally activated a face`)
}

async function waitForProjectionChange(before: string) {
  await page.waitForFunction(previous => {
    const current = Array.from(document.querySelectorAll('.pc-diagram [data-panel]'))
      .map(panel => `${panel.getAttribute('data-panel')}:${panel.getAttribute('data-back')}:${panel.querySelector('path')?.getAttribute('d')}`)
      .sort().join('|')
    return current.length > 0 && current !== previous && !/NaN|Infinity/.test(current)
  }, {}, before)
}

async function expectStationary(message: string) {
  const before = await projection()
  await pause(220)
  assert.equal(await projection(), before, message)
}

async function resetView(baseline: string) {
  await page.click('.pc-reset')
  await page.waitForFunction(() => {
    const cube = document.querySelector('.pc-diagram')
    return Number(cube?.getAttribute('data-yaw')) === 0 && Number(cube?.getAttribute('data-pitch')) === 0
  })
  assert.equal(await projection(), baseline, 'Reset view did not restore the original projected geometry')
  assert.equal(await page.$eval('.pc-spin', el => el.getAttribute('aria-pressed')), 'false')
}

async function touchDrag(selector: string, dx: number, dy: number) {
  await touchDragFrom(await center(selector), dx, dy)
}

async function touchDragFrom(from: Point, dx: number, dy: number) {
  const session = await page.target().createCDPSession()
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }],
    })
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: from.x + dx * step / 8, y: from.y + dy * step / 8, id: 1 }],
      })
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await session.detach()
  }
}

try {
  await page.setViewport({ width: 1440, height: 1160, deviceScaleFactor: 1 })
  await page.goto(preview, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.pc-diagram svg')
  await page.evaluate(async () => { await document.fonts.ready })
  await waitForRings(false)
  await assertHiddenRingsDoNotHit()
  assert.equal(await page.$$eval('button', buttons => buttons.some(button => button.textContent?.trim() === 'Tools')), false)
  await page.screenshot({ path: join(output, 'page-closed.png'), fullPage: true })
  await page.hover('.pc-object')
  await waitForRings(true)
  await assertExpansion(false, 'Hover opened the cube')
  await page.screenshot({ path: join(output, 'page-hover-closed.png'), fullPage: true })
  remember('Hover reveals rings while the cube stays closed')
  remember('Desktop rings are hidden and non-intercepting while idle, then reveal on hover')

  const closedBaseline = await projection()
  await page.click('[data-front-face="capture"]')
  await clearInspection()
  await assertExpansion(false, 'Face selection opened the cube')
  assert.equal(await selectedPart(), 'Capture')
  await page.click('.pc-parts button:nth-child(2)')
  await assertExpansion(false, 'Part selection opened the cube')
  assert.equal(await selectedPart(), 'Storage')
  remember('Face clicks and part selection preserve the closed cube')

  await page.focus('.pc-view-switch button:nth-child(2)')
  await page.keyboard.press('Tab')
  await waitForRings(true)
  await assertExpansion(false, 'Keyboard focus opened the cube')
  await page.keyboard.press('ArrowRight')
  await waitForProjectionChange(closedBaseline)
  await assertExpansion(false, 'Keyboard rotation opened the cube')
  await page.keyboard.press('Home')
  await resetView(closedBaseline)
  remember('Keyboard focus and rotation preserve the closed cube')

  await mouseDrag('[data-front-face="capture"]', 70, -20)
  await waitForProjectionChange(closedBaseline)
  await assertExpansion(false, 'Free dragging opened the cube')
  await page.mouse.move(2, 2)
  await waitForRings(false)
  await page.screenshot({ path: join(output, 'page-rotated-closed.png'), fullPage: true })
  await resetView(closedBaseline)
  await revealRings()
  await mouseDrag(grip('yaw'), 0, 30)
  await assertExpansion(false, 'Turn ring dragging opened the cube')
  await mouseDrag(grip('pitch'), 30, 0)
  await assertExpansion(false, 'Tilt ring dragging opened the cube')
  await resetView(closedBaseline)
  remember('Free and axis drags rotate the closed cube without expansion')

  await page.click('.pc-spin')
  await waitForProjectionChange(closedBaseline)
  await assertExpansion(false, 'Auto-spin opened the cube')
  await page.click('.pc-spin')
  await resetView(closedBaseline)
  remember('Auto-spin preserves the closed cube')

  await page.click('.pc-open')
  await waitForOpen()
  await assertExpansion(true, 'Open cube did not expand the panels')
  await page.screenshot({ path: join(output, 'page-open.png'), fullPage: true })
  remember('Open cube explicitly expands the panels')

  await page.click('[data-front-face="capture"]')
  await clearInspection()
  await waitForRings(false)
  assert.equal(await page.$eval('.pc-open', el => el.getAttribute('aria-pressed')), 'true')
  assert.equal(await selectedPart(), 'Capture', 'Direct face selection did not persist')
  await page.screenshot({ path: join(output, 'page-selected.png'), fullPage: true })
  remember('Ordinary face click selects and persists')

  const baseline = await projection()
  await page.click('.pc-parts button:nth-child(2)')
  await mouseDrag('[data-front-face="capture"]', 84, -26)
  await waitForProjectionChange(baseline)
  await assertExpansion(true, 'Rotation changed the explicitly open state')
  assert.equal(await page.$eval('.pc-diagram', el => el.getAttribute('data-dragging')), 'false')
  await page.mouse.move(2, 2)
  await waitForRings(false)
  assert.equal(await page.evaluate(() => document.activeElement?.matches('.pc-diagram')), true,
    'Expected the free-drag wrapper to retain mouse focus for the idle visibility check')
  await assertHiddenRingsDoNotHit()
  assert.equal(await selectedPart(), 'Storage', 'Dragging Capture accidentally selected it on pointer release')
  await page.screenshot({ path: join(output, 'page-rotated.png'), fullPage: true })
  remember('Mouse drag rotates the projected panels without click selection')
  remember('Rings fade after leaving even while the free-drag wrapper retains mouse focus')

  await resetView(baseline)
  remember('Reset view restores the exact original projection')
  await revealRings()
  const beforeTurn = await rotation()
  const turnGrip = await center(grip('yaw'))
  await page.mouse.move(turnGrip.x, turnGrip.y)
  await page.mouse.down()
  assert.deepEqual(await rotation(), beforeTurn, 'Grabbing the Turn handle jumped to an absolute angle')
  await page.mouse.move(turnGrip.x, turnGrip.y + 42, { steps: 12 })
  await page.mouse.up()
  await assertOnlyAxisChanged('yaw', beforeTurn, baseline)
  assert.ok((await rotation()).yaw > beforeTurn.yaw, 'Dragging the left Turn grip down did not increase yaw')
  remember('Turn grip mouse drag changes only yaw without activating a face')

  const turnedProjection = await projection()
  const beforeTilt = await rotation()
  await mouseDrag(grip('pitch'), 42, 0)
  await assertOnlyAxisChanged('pitch', beforeTilt, turnedProjection)
  assert.ok((await rotation()).pitch > beforeTilt.pitch, 'Dragging the bottom Tilt grip right did not increase pitch')
  remember('Tilt grip mouse drag changes only pitch without activating a face')

  // Use real Tab input to reach both SVG sliders, including their visible focus.
  await page.mouse.move(2, 2)
  await waitForRings(false)
  await page.focus('.pc-diagram')
  await tabTo(handle('yaw'))
  await waitForRings(true)
  const beforeTurnKey = await rotation()
  const beforeTurnKeyProjection = await projection()
  await page.keyboard.press('ArrowRight')
  await assertOnlyAxisChanged('yaw', beforeTurnKey, beforeTurnKeyProjection)
  assert.ok((await rotation()).yaw > beforeTurnKey.yaw, 'Turn right arrow did not increase yaw')
  await page.keyboard.press('Home')
  assert.deepEqual(await rotation(), { yaw: 0, pitch: beforeTurnKey.pitch }, 'Turn Home reset the wrong axes')
  await tabTo(handle('pitch'))
  const beforeTiltKey = await rotation()
  const beforeTiltKeyProjection = await projection()
  await page.keyboard.press('ArrowUp')
  await assertOnlyAxisChanged('pitch', beforeTiltKey, beforeTiltKeyProjection)
  assert.ok((await rotation()).pitch > beforeTiltKey.pitch, 'Tilt up arrow did not increase pitch')
  await page.screenshot({ path: join(output, 'page-handle-focus.png'), fullPage: true })
  await page.keyboard.press('Home')
  assert.deepEqual(await rotation(), { yaw: 0, pitch: 0 }, 'Tilt Home did not reset its axis')
  remember('Tab reaches both axis handles; arrows and Home change only the focused axis')
  await resetView(baseline)

  await revealRings()
  const captureGrip = await center(grip('yaw'))
  await page.mouse.move(captureGrip.x, captureGrip.y)
  await page.mouse.down()
  await page.mouse.move(2, 2, { steps: 12 })
  // Hold outside longer than the fade so an accidentally fading layer cannot pass.
  const fadeDuration = await page.$eval(ringLayers, layer =>
    Math.max(...getComputedStyle(layer).transitionDuration.split(',').map(value => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000))))
  await pause(fadeDuration + 50)
  await assertRings(true, 'Active ring capture faded when the pointer left the cube')
  await page.mouse.up()
  await waitForRings(false)
  assert.equal(await page.evaluate(target => document.activeElement?.matches(target), handle('yaw')), true,
    'Expected the handle to retain mouse focus after release')
  await assertHiddenRingsDoNotHit()
  remember('Active ring capture stays visible outside the cube, then fades after release despite mouse focus')
  await resetView(baseline)

  await page.click('.pc-spin')
  await waitForProjectionChange(baseline)
  await revealRings()
  const ring = await ringGrab('yaw')
  const beforeRing = await rotation()
  const beforeRingProjection = await projection()
  await mouseDragFrom(ring.from, ring.dx, ring.dy)
  await assertOnlyAxisChanged('yaw', beforeRing, beforeRingProjection)
  assert.equal(await page.$eval('.pc-spin', el => el.getAttribute('aria-pressed')), 'false',
    'Grabbing the ring stroke did not stop auto-spin')
  await expectStationary('Auto-spin continued after ring input')
  remember('Exposed ring stroke accepts mouse dragging and stops auto-spin')
  await resetView(baseline)

  await page.click('[data-front-face="capture"]')
  await clearInspection()
  assert.equal(await selectedPart(), 'Capture', 'A normal face click stopped working after a drag')
  remember('Ordinary face click still works after dragging')

  // Real Tab navigation reaches the rotation group before its face buttons.
  await page.focus('.pc-view-switch button:nth-child(2)')
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() =>
    document.activeElement?.matches('.pc-diagram[role="group"]')), true, 'Rotation group is not reachable by Tab')
  await waitForRings(true)
  await page.keyboard.press('ArrowRight')
  await waitForProjectionChange(baseline)
  const horizontal = await projection()
  await page.keyboard.press('ArrowUp')
  await waitForProjectionChange(horizontal)
  await page.keyboard.press('Home')
  assert.equal(await projection(), baseline, 'Home did not reset keyboard rotation')
  remember('Tab, horizontal/vertical arrows and Home operate rotation')
  remember('Keyboard focus reveals the rings without requiring pointer hover')
  await tabTo('[data-front-face]')
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.evaluate(() => document.activeElement?.matches('.pc-diagram')), true,
    'Rotating from a face left focus on geometry that can become hidden')
  await page.keyboard.press('Home')
  remember('Arrow rotation from a face moves focus to the stable rotation group')

  await page.click('.pc-open')
  await waitForExpansion(false)
  await page.focus('.pc-view-switch button:nth-child(2)')
  await page.keyboard.press('Tab')
  await assertExpansion(false, 'Focus reopened an explicitly closed cube')
  await tabTo('[data-front-face="storage"]')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await clearInspection()
  await assertExpansion(false, 'Keyboard face selection reopened the cube')
  assert.equal(await selectedPart(), 'Storage', 'Keyboard selection did not persist')
  remember('Tab/Enter face selection survives blur without reopening the cube')
  await page.click('.pc-open')
  await waitForOpen()

  await resetView(baseline)
  await page.click('.pc-spin')
  await waitForProjectionChange(baseline)
  assert.equal(await page.$eval('.pc-spin', el => el.getAttribute('aria-pressed')), 'true')
  await page.click('.pc-spin')
  await expectStationary('Stop spin left the cube rotating')
  remember('Auto-spin changes projection and Stop spin halts it')

  await page.click('.pc-spin')
  await waitForProjectionChange(await projection())
  await mouseDrag('.pc-diagram', 52, 18)
  assert.equal(await page.$eval('.pc-spin', el => el.getAttribute('aria-pressed')), 'false',
    'Dragging did not stop auto-spin')
  await expectStationary('Auto-spin continued after dragging')
  remember('Dragging stops auto-spin')

  await resetView(baseline)
  await page.click('.pc-spin')
  await waitForProjectionChange(baseline)
  const heldPointer = await center('.pc-diagram')
  await page.mouse.move(heldPointer.x, heldPointer.y)
  await page.mouse.down()
  await pause(450)
  const yawBeforeDrag = await page.$eval('.pc-diagram', el => Number(el.getAttribute('data-yaw')))
  await page.mouse.move(heldPointer.x + 8, heldPointer.y)
  await page.mouse.up()
  const yawAfterDrag = await page.$eval('.pc-diagram', el => Number(el.getAttribute('data-yaw')))
  assert.ok(yawAfterDrag > yawBeforeDrag, 'Delayed drag snapped backward to the pointer-down orientation')
  await expectStationary('Delayed drag left auto-spin running')
  remember('Holding before dragging preserves the current spinning orientation')

  await page.click('.pc-spin')
  await waitForProjectionChange(await projection())
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.waitForFunction(() => {
    const spin = document.querySelector<HTMLButtonElement>('.pc-spin')
    return spin?.disabled && spin.getAttribute('aria-pressed') === 'false'
  })
  await expectStationary('Reduced motion did not stop an already-running spin')
  remember('Reduced motion stops auto-spin and disables its control')

  await resetView(baseline)
  await page.click('.pc-open')
  await clearInspection()
  await page.waitForFunction(() => !document.querySelector('[data-callout]'))
  await waitForRings(false)
  const reducedDurations = await page.$$eval(ringLayers, layers => layers.flatMap(layer =>
    getComputedStyle(layer).transitionDuration.split(',').map(value => parseFloat(value))))
  assert.ok(reducedDurations.every(duration => duration === 0), 'Reduced motion leaves a ring fade transition')
  await page.hover('.pc-diagram')
  await assertRings(true, 'Reduced-motion hover did not immediately reveal rings')
  await page.mouse.move(2, 2)
  await assertRings(false, 'Reduced-motion pointer leave did not immediately hide rings')
  remember('Reduced motion makes ring visibility changes immediate')
  await page.click('.pc-open')
  await waitForOpen()
  remember('Reduced motion retains immediate open/close feedback')

  // Reversing motion should remain bounded, including the first rAF timestamp.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  for (let i = 0; i < 6; i++) {
    await page.click('.pc-open')
    await pause(25)
  }
  await waitForOpen()
  assert.doesNotMatch(await projection(), /NaN|Infinity/)
  remember('Rapid reveal reversal keeps valid geometry')

  await page.click('.pc-view-switch button:nth-child(2)')
  const source = await page.$eval('.pc-source', el => JSON.parse(el.textContent || '{}'))
  assert.equal(source.kind, 'panel-cube')
  assert.equal(source.faces.length, 3)
  assert.equal(await page.$eval('.pc-spin', el => (el as HTMLButtonElement).disabled), true)
  remember('Source shows valid data and disables auto-spin')
  await page.click('.pc-view-switch button:first-child')

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
  await page.goto(preview, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.pc-diagram svg')
  assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true)
  await waitForRings(true)
  remember('Coarse-pointer rings remain available without hover')
  await page.tap('.pc-parts button:nth-child(2)')
  await assertExpansion(false, 'Touch part selection opened the cube')
  const mobileBaseline = await projection()
  await page.evaluate(() => document.querySelector('.pc-diagram')?.scrollIntoView({ block: 'center' }))
  const scrollBefore = await page.evaluate(() => window.scrollY)
  await touchDrag('[data-front-face="capture"]', 64, -28)
  await waitForProjectionChange(mobileBaseline)
  await assertExpansion(false, 'Touch free drag opened the cube')
  assert.equal(await page.evaluate(() => window.scrollY), scrollBefore, 'Touch drag scrolled instead of rotating')
  await page.focus('.pc-brand')
  assert.equal(await selectedPart(), 'Storage', 'Touch drag accidentally changed the selected face')
  await page.screenshot({ path: join(output, 'page-mobile-rotated.png'), fullPage: true })
  remember('Touch drag rotates without selection or page scroll')

  await page.tap('.pc-reset')
  assert.equal(await projection(), mobileBaseline, 'Touch reset did not restore projection')
  await page.evaluate(() => document.querySelector('.pc-diagram')?.scrollIntoView({ block: 'center' }))
  const beforeTouchTurn = await rotation()
  const touchScroll = await page.evaluate(() => window.scrollY)
  await touchDrag(grip('yaw'), 0, 30)
  await assertOnlyAxisChanged('yaw', beforeTouchTurn, mobileBaseline)
  await assertExpansion(false, 'Touch Turn grip opened the cube')
  assert.ok((await rotation()).yaw > beforeTouchTurn.yaw, 'Touch Turn drag moved in the wrong direction')
  assert.equal(await page.evaluate(() => window.scrollY), touchScroll, 'Turn grip touch drag scrolled the page')
  const touchTurnedProjection = await projection()
  const beforeTouchTilt = await rotation()
  await touchDrag(grip('pitch'), 30, 0)
  await assertOnlyAxisChanged('pitch', beforeTouchTilt, touchTurnedProjection)
  await assertExpansion(false, 'Touch Tilt grip opened the cube')
  assert.ok((await rotation()).pitch > beforeTouchTilt.pitch, 'Touch Tilt drag moved in the wrong direction')
  assert.equal(await page.evaluate(() => window.scrollY), touchScroll, 'Tilt grip touch drag scrolled the page')
  await page.screenshot({ path: join(output, 'page-mobile-handles.png'), fullPage: true })
  remember('Touch grips lock rotation to their own axis without selection or page scroll')

  await page.tap('.pc-reset')
  assert.equal(await projection(), mobileBaseline, 'Reset after touch handle input did not restore projection')
  await assertRings(true, 'Rings disappeared on a coarse pointer after leaving the diagram')
  await page.tap('.pc-parts button:first-child')
  assert.equal(await selectedPart(), 'Capture', 'Part selection stopped working after touch drag')
  await assertExpansion(false, 'Touch part selection reopened the cube')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  const mobileCallouts = await page.$$eval('[data-callout]', elements => elements.length)
  await page.screenshot({ path: join(output, 'page-mobile.png'), fullPage: true })
  assert.equal(overflow, false, 'Mobile layout overflows horizontally')
  assert.equal(mobileCallouts, 0, 'Desktop callouts remain visible on mobile')
  remember('Mobile reset, part selection and layout remain usable')
  await page.tap('.pc-open')
  await waitForExpansion(true)
  await assertExpansion(true, 'Touch Open cube did not expand the panels')
  await page.screenshot({ path: join(output, 'page-mobile-open.png'), fullPage: true })
  await page.tap('.pc-open')
  await waitForExpansion(false)
  await assertExpansion(false, 'Touch Close cube did not close the panels')
  remember('Touch Open and Close buttons explicitly control expansion')

  assert.deepEqual(errors, [], 'Page errors were emitted')
  const result = { checks, errors, overflow, mobileCallouts, sourceKind: source.kind }
  writeFileSync(join(output, 'browser-results.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} catch (error) {
  await page.screenshot({ path: join(output, 'page-failure.png'), fullPage: true }).catch(() => {})
  writeFileSync(join(output, 'browser-results.json'), JSON.stringify({
    checks, errors, failure: error instanceof Error ? error.message : String(error),
  }, null, 2))
  throw error
} finally { await browser.close() }
