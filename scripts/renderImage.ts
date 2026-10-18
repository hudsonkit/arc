import { spawn } from 'node:child_process'
import { accessSync, constants, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { generateSVG } from '../src/utils/exportUtils.ts'
import { THEMES, themeCanvas, type ThemeId } from '../src/utils/themes.ts'
import type { ArcDiagramData } from '../src/types/diagram.ts'

export type RenderMode = 'light' | 'dark'

export interface RenderSvgOptions {
  backgroundColor?: string
  includeGrid?: boolean
  padding?: number
  theme?: string
  mode?: RenderMode
  /** Render flow markers as a deterministic still at this time (seconds). */
  flowTime?: number
  /** Standalone SVG embeds animate flows by default; set false to omit SMIL. */
  animateFlows?: boolean
}

export interface RenderedSvg {
  svg: string
  width: number
  height: number
  backgroundColor: string
  theme?: ThemeId
  mode?: RenderMode
}

export interface RenderPngOptions extends RenderSvgOptions {
  chromePath?: string
  scale?: number
  runChrome?: (executable: string, args: string[]) => Promise<void>
}

export interface RenderedPng {
  png: Buffer
  width: number
  height: number
  scale: number
  chrome: string
  theme?: ThemeId
  mode?: RenderMode
}

export class RenderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly supportedFixes: string[] = [],
  ) {
    super(message)
  }
}

const DEFAULT_PADDING = 20
const DEFAULT_SCALE = 2
const MAX_SCALE = 4
const MAX_PNG_PIXELS = 64_000_000
const CHROME_TIMEOUT_MS = 15_000
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function assertNumber(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isFinite(resolved)) throw new RenderError('render/invalid-option', `${name} must be finite`, [`pass a finite ${name}`])
  return resolved
}

function assertPadding(value: number | undefined): number {
  const padding = assertNumber(value, DEFAULT_PADDING, 'padding')
  if (padding < 0) throw new RenderError('render/invalid-option', 'padding must be >= 0', ['use padding >= 0'])
  return Math.round(padding)
}

function assertScale(value: number | undefined): number {
  const scale = assertNumber(value, DEFAULT_SCALE, 'scale')
  if (scale <= 0 || scale > MAX_SCALE) {
    throw new RenderError('render/invalid-option', `scale must be > 0 and <= ${MAX_SCALE}`, [`use scale <= ${MAX_SCALE}`])
  }
  return scale
}

export function assertRenderTheme(value: string | undefined): ThemeId | undefined {
  if (value === undefined) return undefined
  if (!Object.hasOwn(THEMES, value)) {
    throw new RenderError('render/invalid-option', `Unknown theme "${value}"`, [`use one of: ${Object.keys(THEMES).join(', ')}`])
  }
  return value as ThemeId
}

export function assertRenderMode(value: string | undefined): RenderMode | undefined {
  if (value === undefined) return undefined
  if (value !== 'light' && value !== 'dark') {
    throw new RenderError('render/invalid-option', 'mode must be "light" or "dark"', ['use light or dark'])
  }
  return value
}

export function resolveRenderMode(theme: ThemeId | undefined, mode: string | undefined): RenderMode | undefined {
  return assertRenderMode(mode) ?? (theme ? THEMES[theme].defaultMode : undefined)
}

type ExportZone = { x: number; y: number; width: number; height: number }

function exportBounds(diagram: ArcDiagramData): ExportZone {
  // ArcDiagramData omits exportZone, but existing saved files may still carry it.
  const zone = (diagram as ArcDiagramData & { exportZone?: ExportZone | null }).exportZone
  if (zone == null) return { x: 0, y: 0, width: diagram.layout.width, height: diagram.layout.height }
  if (![zone.x, zone.y, zone.width, zone.height].every(Number.isFinite) || zone.width <= 0 || zone.height <= 0) {
    throw new RenderError('render/invalid-diagram', 'exportZone must contain finite x, y, width, and height values', ['remove exportZone or replace it with valid bounds'])
  }
  return zone
}

export function renderDiagramSvg(diagram: ArcDiagramData, options: RenderSvgOptions = {}): RenderedSvg {
  const padding = assertPadding(options.padding)
  const theme = assertRenderTheme(options.theme)
  const mode = resolveRenderMode(theme, options.mode)
  if (options.flowTime !== undefined && (!Number.isFinite(options.flowTime) || options.flowTime < 0)) {
    throw new RenderError('render/invalid-option', 'flowTime must be a non-negative finite number', ['use seconds, e.g. --flow-time 1.25'])
  }
  const themeBackground = theme ? themeCanvas(theme, mode ?? 'light') : undefined
  const backgroundColor = options.backgroundColor ?? themeBackground ?? '#ffffff'
  // Theme-owned CSS variable expressions are trusted; user input stays restricted.
  if (options.backgroundColor !== undefined && (typeof backgroundColor !== 'string' || !/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(backgroundColor))) {
    throw new RenderError('render/invalid-option', 'backgroundColor must be a hex or CSS named color', ['use #ffffff, #00000000, or a CSS color name'])
  }

  const bounds = exportBounds(diagram)
  return {
    svg: generateSVG(diagram, { ...options, theme, mode, backgroundColor, padding }),
    width: Math.round(bounds.width + padding * 2),
    height: Math.round(bounds.height + padding * 2),
    backgroundColor,
    theme,
    mode,
  }
}

export function executable(file: string | undefined): string | null {
  if (!file) return null
  try {
    accessSync(file, constants.X_OK)
    return file
  } catch {
    return null
  }
}

export function findOnPath(command: string, env: Record<string, string | undefined> = process.env, platform: string = process.platform): string | null {
  const pathValue = env.PATH ?? env.Path ?? ''
  const extensions = platform === 'win32'
    ? String(env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
    : ['']

  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const suffix = command.toLowerCase().endsWith(extension.toLowerCase()) ? '' : extension
      const resolved = executable(join(directory, `${command}${suffix}`))
      if (resolved) return resolved
    }
  }
  return null
}

export function findChrome(
  env: Record<string, string | undefined> = process.env,
  platform: string = process.platform,
): string | null {
  for (const key of ['ARC_CHROME', 'CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH']) {
    const value = env[key]
    if (value && ['0', 'false', 'none', 'off'].includes(value.toLowerCase())) return null
    const resolved = executable(value)
    if (resolved) return resolved
  }

  const fixed: string[] = []
  const commands: string[] = []
  if (platform === 'darwin') {
    fixed.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    )
  } else if (platform === 'win32') {
    for (const root of [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter((value): value is string => Boolean(value))) {
      fixed.push(
        join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(root, 'Chromium', 'Application', 'chrome.exe'),
        join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      )
    }
    commands.push('chrome', 'msedge')
  } else {
    commands.push('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome')
  }

  for (const candidate of fixed) {
    const resolved = executable(candidate)
    if (resolved) return resolved
  }
  for (const command of commands) {
    const resolved = findOnPath(command, env, platform)
    if (resolved) return resolved
  }
  return null
}

type CdpMessage = {
  id?: number
  method?: string
  sessionId?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: { message?: string }
}

function captureFailure(message: string): RenderError {
  return new RenderError(
    'render/png-capture-failed',
    message,
    ['rerun the render', 'set ARC_CHROME to a different Chrome or Chromium executable'],
  )
}

/** Capture a sequence of pages in one headless Chrome process. Frames are
 *  navigated and screenshot deterministically, so callers can pre-render each
 *  animation step as a separate document. */
export async function captureChromeScreenshots(executablePath: string, dir: string, urls: string[], width: number, height: number, scale: number): Promise<Buffer[]> {
  if (typeof WebSocket !== 'function') {
    throw new RenderError('render/chrome-unavailable', 'WebSocket is required for Chrome PNG capture', ['run with Node 22+ or a Bun runtime with WebSocket'])
  }

  const child = spawn(executablePath, [
    '--headless',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-extensions',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-sandbox',
    '--remote-debugging-port=0',
    `--user-data-dir=${join(dir, 'chrome-profile')}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  let stderr = ''
  const wsUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new RenderError('render/chrome-timeout', `Chrome did not expose DevTools within ${CHROME_TIMEOUT_MS}ms`, ['rerun the render', 'set ARC_CHROME to a different Chrome or Chromium executable']))
    }, CHROME_TIMEOUT_MS)
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('exit', () => {
      clearTimeout(timer)
      reject(captureFailure(`Chrome exited before DevTools was ready${stderr ? `: ${stderr.trim()}` : ''}`))
    })
  }).catch((err) => {
    child.kill('SIGKILL')
    throw err
  })

  const ws = new WebSocket(wsUrl)
  let nextId = 0
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (err: Error) => void }>()
  const eventWaiters = new Map<string, Set<() => void>>()

  ws.onmessage = (event) => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data as ArrayBuffer).toString('utf8')
    const message = JSON.parse(raw) as CdpMessage
    if (message.id !== undefined) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (message.error) request.reject(captureFailure(message.error.message || 'Chrome DevTools request failed'))
      else request.resolve(message.result || {})
      return
    }
    if (message.method) {
      const waiters = eventWaiters.get(message.method)
      if (waiters) {
        eventWaiters.delete(message.method)
        for (const resolve of waiters) resolve()
      }
    }
  }
  ws.onclose = () => {
    const err = captureFailure('Chrome DevTools disconnected')
    for (const request of pending.values()) request.reject(err)
    pending.clear()
  }

  function send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const id = ++nextId
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  }

  function waitForEvent(method: string): Promise<void> {
    return new Promise((resolve) => {
      const waiters = eventWaiters.get(method) || new Set<() => void>()
      waiters.add(resolve)
      eventWaiters.set(method, waiters)
    })
  }

  try {
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = () => reject(captureFailure('Could not connect to Chrome DevTools'))
    })

    const target = await send('Target.createTarget', { url: 'about:blank' })
    const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    const sessionId = String(attached.sessionId)
    await send('Page.enable', {}, sessionId)
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }, sessionId)
    const frames: Buffer[] = []
    for (const url of urls) {
      const loaded = waitForEvent('Page.loadEventFired')
      await send('Page.navigate', { url }, sessionId)
      await Promise.race([
        loaded,
        new Promise<void>((_, reject) => setTimeout(() => reject(new RenderError('render/chrome-timeout', `Chrome did not finish loading within ${CHROME_TIMEOUT_MS}ms`, ['rerun the render'])), CHROME_TIMEOUT_MS)),
      ])
      // Webfonts fetch lazily once SVG text lays out — wait for them so branded
      // faces land in the PNG. Bounded: an offline env still renders fallbacks.
      await Promise.race([
        send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true, returnByValue: true }, sessionId).catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 6000)),
      ])
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId)
      frames.push(Buffer.from(String(screenshot.data), 'base64'))
    }
    try {
      ws.send(JSON.stringify({ id: ++nextId, method: 'Browser.close' }))
    } catch {
      // Browser.close races with the socket closing; killing below is the fallback.
    }
    return frames
  } finally {
    ws.close()
    if (child.exitCode === null) child.kill('SIGKILL')
  }
}

export async function renderDiagramPng(diagram: ArcDiagramData, options: RenderPngOptions = {}): Promise<RenderedPng> {
  const rendered = renderDiagramSvg(diagram, { ...options, animateFlows: false, flowTime: options.flowTime ?? 0 })
  const scale = assertScale(options.scale)
  const pixelCount = rendered.width * rendered.height * scale * scale
  if (pixelCount > MAX_PNG_PIXELS) {
    throw new RenderError(
      'render/png-too-large',
      `PNG would be ${Math.round(rendered.width * scale)}x${Math.round(rendered.height * scale)} (${Math.round(pixelCount)}px), above the ${MAX_PNG_PIXELS}px cap`,
      ['lower --scale', 'use a smaller layout or exportZone'],
    )
  }

  const chrome = options.chromePath ? executable(options.chromePath) : findChrome()
  if (!chrome) {
    throw new RenderError(
      'render/chrome-unavailable',
      'Chrome or Chromium is unavailable for PNG rasterization',
      ['install Chrome or Chromium', 'set ARC_CHROME to a Chrome or Chromium executable'],
    )
  }

  const dir = mkdtempSync(join(tmpdir(), 'arc-render-'))
  const svgPath = join(dir, 'diagram.svg')
  const htmlPath = join(dir, 'diagram.html')
  const pngPath = join(dir, 'diagram.png')
  try {
    writeFileSync(svgPath, rendered.svg, 'utf8')
    // Brand fonts ride the document <link> — inline SVG text inherits document
    // fonts, and the embedded @import in the SVG is the standalone-view fallback.
    const fontLink = rendered.theme && THEMES[rendered.theme].brand?.fontImport
      ? `<link rel="stylesheet" href="${THEMES[rendered.theme].brand!.fontImport}">`
      : ''
    writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${rendered.backgroundColor}}svg{display:block}</style>${fontLink}${rendered.svg}`, 'utf8')
    const png = options.runChrome
      ? await (async () => {
          const args = [
            '--headless',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-background-networking',
            '--disable-sync',
            '--disable-extensions',
            '--hide-scrollbars',
            '--mute-audio',
            '--no-first-run',
            '--no-sandbox',
            '--run-all-compositor-stages-before-draw',
            // Virtual time lets the stylesheet + font fetches settle before the shot.
            '--virtual-time-budget=8000',
            `--force-device-scale-factor=${scale}`,
            `--window-size=${rendered.width},${rendered.height}`,
            `--screenshot=${pngPath}`,
            pathToFileURL(htmlPath).href,
          ]
          await options.runChrome!(chrome, args)
          return readFileSync(pngPath)
        })()
      : (await captureChromeScreenshots(chrome, dir, [pathToFileURL(htmlPath).href], rendered.width, rendered.height, scale))[0]
    if (png.length < PNG_SIGNATURE.length || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new RenderError(
        'render/png-empty',
        'Chrome did not produce a PNG',
        ['rerun the render', 'set ARC_CHROME to a different Chrome or Chromium executable'],
      )
    }
    return { png, width: rendered.width, height: rendered.height, scale, chrome, theme: rendered.theme, mode: rendered.mode }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
