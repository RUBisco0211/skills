#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  printHelp()
  process.exit(0)
}

const projectDir = path.resolve(args.project || process.cwd())
const outputDir = path.resolve(projectDir, args.outputDir || 'demo')
const tmpDir = path.join(outputDir, 'tmp')
const planPath = path.resolve(projectDir, args.plan || 'demo/tmp/recording-plan.json')
const rawVideo = path.join(tmpDir, 'web-demo-raw.webm')
const finalVideo = path.resolve(projectDir, args.output || 'demo/web-demo.mp4')
const reportPath = path.join(tmpDir, 'recording-report.json')

await mkdir(tmpDir, { recursive: true })
const plan = JSON.parse(await readFile(planPath, 'utf8'))
validatePlan(plan)
const { chromium } = await loadPlaywright(projectDir)

if (args.smoke) {
  await runSmokeTest()
  console.log('快速操作检查通过：所有预演与时间轴操作均可执行。')
  process.exit(0)
}

await recordDemo()
console.log(`浏览器演示视频已生成：${finalVideo}`)

function parseArgs(argv) {
  const parsed = {}
  const flags = new Map([
    ['--help', 'help'],
    ['-h', 'help'],
    ['--smoke', 'smoke'],
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (flags.has(token)) {
      parsed[flags.get(token)] = true
      continue
    }
    if (!token.startsWith('--')) throw new Error(`无法识别参数：${token}`)
    const key = token.slice(2).replace(/-([a-z])/g, (_, character) => character.toUpperCase())
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`参数 ${token} 缺少取值。`)
    parsed[key] = value
    index += 1
  }
  return parsed
}

function printHelp() {
  console.log(`仅录制 Web Demo 浏览器内容，不生成或混入旁白。

先做快速操作检查：
  node record-web-demo.mjs --project <项目目录> --smoke

正式录制：
  node record-web-demo.mjs --project <项目目录>

可选参数：
  --plan <path>        操作计划，默认 demo/tmp/recording-plan.json
  --output <path>      最终视频，默认 demo/web-demo.mp4
  --output-dir <path>  输出目录，默认 demo
  --smoke              快速执行所有操作但不录制
`)
}

function validatePlan(value) {
  if (!value.url) throw new Error('操作计划缺少 url。')
  if (!Number.isFinite(Number(value.totalDuration)) || Number(value.totalDuration) <= 0) {
    throw new Error('操作计划的 totalDuration 必须是正数。')
  }
  if (!Array.isArray(value.actions)) throw new Error('操作计划缺少 actions 数组。')
  let previous = -1
  value.actions.forEach((action, index) => {
    if (!Number.isFinite(Number(action.at)) || Number(action.at) < 0) {
      throw new Error(`第 ${index + 1} 个操作的 at 无效。`)
    }
    if (Number(action.at) < previous) throw new Error('actions 必须按 at 从小到大排列。')
    if (Number(action.at) > Number(value.totalDuration)) {
      throw new Error(`操作“${action.label || index + 1}”超出 totalDuration。`)
    }
    previous = Number(action.at)
  })
}

async function loadPlaywright(root) {
  const requireFromProject = createRequire(path.join(root, 'package.json'))
  let modulePath
  for (const packageName of ['playwright', 'playwright-core']) {
    try {
      modulePath = requireFromProject.resolve(packageName)
      break
    } catch {}
  }
  if (!modulePath) {
    throw new Error('项目中缺少 playwright 或 playwright-core。请先安装 playwright-core，并在计划中配置可用浏览器。')
  }
  const loaded = await import(pathToFileURL(modulePath).href)
  return loaded.chromium ? loaded : loaded.default
}

async function runSmokeTest() {
  let server
  let browser
  try {
    server = await ensureDevServer()
    browser = await chromium.launch(browserLaunchOptions())
    const page = await browser.newPage({ viewport: viewport() })
    await openAndPrepare(page, true)
    for (const action of plan.actions) await performAction(page, action, true)
  } finally {
    await browser?.close().catch(() => {})
    await stopDevServer(server)
  }
}

async function recordDemo() {
  let server
  let browser
  let context
  const events = []
  try {
    server = await ensureDevServer()
    browser = await chromium.launch(browserLaunchOptions())
    context = await browser.newContext({
      viewport: viewport(),
      recordVideo: { dir: tmpDir, size: viewport() },
    })
    const page = await context.newPage()
    const video = page.video()
    const videoEpoch = Date.now()
    await openAndPrepare(page, false)
    const recordingStart = Date.now()
    const preRoll = (recordingStart - videoEpoch) / 1000

    for (const action of plan.actions) {
      const scheduledAt = recordingStart + Number(action.at) * 1000
      await waitUntil(scheduledAt)
      const actualAt = (Date.now() - recordingStart) / 1000
      await performAction(page, action, false)
      events.push({
        at: Number(action.at),
        actualAt: round(actualAt),
        lateBy: round(Math.max(0, actualAt - Number(action.at))),
        label: action.label || action.type,
      })
    }
    await waitUntil(recordingStart + Number(plan.totalDuration) * 1000)
    await context.close()
    context = undefined
    if (!video) throw new Error('浏览器没有创建录制视频对象。')
    await video.saveAs(rawVideo)
    await encodeFinalVideo(preRoll)
    await writeFile(reportPath, `${JSON.stringify({
      plan: planPath,
      output: finalVideo,
      totalDuration: Number(plan.totalDuration),
      generatedAt: new Date().toISOString(),
      events,
    }, null, 2)}\n`)
  } finally {
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
    await stopDevServer(server)
  }
}

function browserLaunchOptions() {
  const browser = plan.browser || {}
  const options = {
    headless: browser.headless !== false,
    args: browser.args || ['--no-first-run'],
  }
  if (browser.channel) options.channel = browser.channel
  if (browser.executablePath) {
    options.executablePath = path.isAbsolute(browser.executablePath)
      ? browser.executablePath
      : path.resolve(projectDir, browser.executablePath)
  }
  return options
}

function viewport() {
  return {
    width: Number(plan.viewport?.width || 1920),
    height: Number(plan.viewport?.height || 1080),
  }
}

async function openAndPrepare(page, quick) {
  await page.goto(plan.url, { waitUntil: plan.waitUntil || 'networkidle' })
  if (plan.zoom && Number(plan.zoom) !== 1) {
    await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom) }, Number(plan.zoom))
  }
  await installRecordingPointer(page)
  for (const action of plan.preflight || []) await performAction(page, action, quick)
  await page.waitForTimeout(quick ? 100 : Number(plan.readyDelay || 800))
}

async function performAction(page, action, quick) {
  const locator = action.locator ? makeLocator(page, action.locator) : null
  const settle = quick ? 80 : Number(action.settle ?? 450)
  switch (action.type) {
    case 'click':
      await pointAndClick(page, locator, quick)
      break
    case 'point':
    case 'hover':
      await pointAndClick(page, locator, quick, false)
      break
    case 'scrollIntoView':
      await locator.scrollIntoViewIfNeeded()
      await pointAndClick(page, locator, quick, false)
      break
    case 'fill':
      await pointAndClick(page, locator, quick, false)
      await locator.fill(String(action.value ?? ''))
      break
    case 'press':
      if (locator) await locator.press(action.key)
      else await page.keyboard.press(action.key)
      break
    case 'waitFor':
      await locator.waitFor({ state: action.state || 'visible', timeout: Number(action.timeout || 10000) })
      break
    case 'scrollPage':
      await page.evaluate(({ top, left, behavior }) => window.scrollTo({ top, left, behavior }), {
        top: Number(action.top || 0),
        left: Number(action.left || 0),
        behavior: quick ? 'instant' : (action.behavior || 'smooth'),
      })
      break
    case 'wait':
      await page.waitForTimeout(quick ? Math.min(100, Number(action.duration || 500)) : Number(action.duration || 500))
      return
    default:
      throw new Error(`未知操作类型：${action.type}`)
  }
  await page.waitForTimeout(settle)
}

function makeLocator(page, spec) {
  let locator
  const exact = spec.exact !== false
  switch (spec.kind) {
    case 'role':
      locator = page.getByRole(spec.role, { name: spec.name, exact })
      break
    case 'text':
      locator = page.getByText(spec.text, { exact })
      break
    case 'testId':
      locator = page.getByTestId(spec.value)
      break
    case 'label':
      locator = page.getByLabel(spec.text, { exact })
      break
    case 'placeholder':
      locator = page.getByPlaceholder(spec.text, { exact })
      break
    case 'css':
      locator = page.locator(spec.selector)
      break
    default:
      throw new Error(`未知定位方式：${spec.kind}`)
  }
  if (spec.hasText) locator = locator.filter({ hasText: spec.hasText })
  return spec.index === undefined ? locator.first() : locator.nth(Number(spec.index))
}

async function pointAndClick(page, locator, quick, shouldClick = true) {
  if (!locator) throw new Error('该操作缺少 locator。')
  await locator.waitFor({ state: 'visible', timeout: 10000 })
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error('无法获取目标控件位置。')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.evaluate(({ x, y }) => {
    const pointer = document.querySelector('#web-demo-recording-pointer')
    if (pointer) pointer.style.transform = `translate(${x}px, ${y}px)`
  }, { x, y })
  await page.waitForTimeout(quick ? 30 : 650)
  if (shouldClick) await locator.click()
}

async function installRecordingPointer(page) {
  await page.evaluate(() => {
    document.querySelector('#web-demo-recording-pointer')?.remove()
    const pointer = document.createElement('div')
    pointer.id = 'web-demo-recording-pointer'
    Object.assign(pointer.style, {
      position: 'fixed', left: '0', top: '0', width: '28px', height: '28px',
      marginLeft: '-14px', marginTop: '-14px', border: '3px solid #ef4444',
      borderRadius: '50%', background: 'rgba(239,68,68,.12)',
      boxShadow: '0 0 0 5px rgba(255,255,255,.72)', zIndex: '2147483647',
      pointerEvents: 'none', transform: 'translate(960px,540px)',
      transition: 'transform 650ms cubic-bezier(.22,.8,.24,1)',
    })
    document.body.appendChild(pointer)
  })
}

async function ensureDevServer() {
  if (await isReachable(plan.url)) return { started: false }
  const server = plan.server
  if (!server?.command) throw new Error(`无法访问 ${plan.url}，且计划中没有 server.command。`)
  const logPath = path.join(tmpDir, 'dev-server.log')
  const log = createWriteStream(logPath, { flags: 'w' })
  const child = spawn(server.command, server.args || [], {
    cwd: path.resolve(projectDir, server.cwd || '.'),
    env: { ...process.env, ...(server.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.pipe(log)
  child.stderr.pipe(log)
  const deadline = Date.now() + Number(server.timeout || 30000)
  while (Date.now() < deadline) {
    if (await isReachable(plan.url)) return { started: true, child, log }
    if (child.exitCode !== null) break
    await delay(250)
  }
  child.kill('SIGTERM')
  throw new Error(`开发服务未能启动，请查看 ${logPath}`)
}

async function stopDevServer(server) {
  if (!server?.started) return
  server.child.kill('SIGTERM')
  await Promise.race([onceExit(server.child), delay(2000)])
  server.log.end()
}

async function isReachable(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

async function encodeFinalVideo(preRoll) {
  await run('ffmpeg', [
    '-y', '-v', 'error', '-ss', preRoll.toFixed(3), '-i', rawVideo,
    '-t', Number(plan.totalDuration).toFixed(3),
    '-vf', `scale=${viewport().width}:${viewport().height}:force_original_aspect_ratio=decrease,` +
      `pad=${viewport().width}:${viewport().height}:(ow-iw)/2:(oh-ih)/2:black,` +
      `tpad=stop_mode=clone:stop_duration=1,trim=duration=${Number(plan.totalDuration).toFixed(3)},` +
      'setpts=PTS-STARTPTS',
    '-an', '-c:v', 'libx264', '-preset', plan.encoding?.preset || 'medium',
    '-crf', String(plan.encoding?.crf || 18), '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', finalVideo,
  ])
}

async function run(command, commandArgs) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: projectDir, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} 运行失败：${stderr.trim()}`)))
  })
}

async function waitUntil(timestamp) {
  const remaining = timestamp - Date.now()
  if (remaining > 0) await delay(remaining)
}

function onceExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode)
  return new Promise((resolve) => child.once('exit', resolve))
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function round(value) {
  return Number(value.toFixed(3))
}
