#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultEndpoint = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
const defaultModel = 'qwen3-tts-instruct-flash'
const safeTextChunkLimit = 220
const minimumTempo = 0.92
const maximumTempo = 1.15
const defaultInstruction = [
  '使用沉稳、专业、可信的科技演示旁白风格。',
  '普通话标准，吐字清晰，语速中等，停顿自然克制。',
  '准确朗读英文缩写、数字和技术术语，不使用客服腔，不加入夸张情绪。',
].join('')

const voices = [
  ['Neil', '阿闻', '男', '字正腔圆、专业新闻主持人'],
  ['Eldric Sage', '沧明子', '男', '沉稳睿智、成熟老者'],
  ['Kai', '凯', '男', '磁性、自然舒适'],
  ['Moon', '月白', '男', '率性、清晰、年轻'],
  ['Ethan', '晨煦', '男', '标准普通话、阳光温暖，略带北方口音'],
  ['Vincent', '田叔', '男', '低沉沙哑、故事感强'],
  ['Arthur', '徐大爷', '男', '质朴沧桑、不疾不徐'],
  ['Nofish', '不吃鱼', '男', '自然设计师音色，不会翘舌'],
  ['Mochi', '沙小弥', '男', '聪明伶俐、偏少年'],
  ['Pip', '顽屁小孩', '男', '调皮童声'],
  ['Elias', '墨讲师', '女', '学科严谨、擅长知识讲解'],
  ['Maia', '四月', '女', '知性温柔'],
  ['Jennifer', '詹妮弗', '女', '品牌级、电影质感'],
  ['Bellona', '燕铮莺', '女', '声音洪亮、吐字清晰'],
  ['Cherry', '芊悦', '女', '阳光积极、亲切自然'],
  ['Serena', '苏瑶', '女', '温柔自然'],
  ['Mia', '乖小妹', '女', '温顺柔和'],
  ['Seren', '小婉', '女', '温和舒缓'],
  ['Vivian', '十三', '女', '可爱、略带小暴躁'],
  ['Chelsie', '千雪', '女', '软糯、二次元'],
  ['Momo', '茉兔', '女', '撒娇搞怪'],
  ['Bella', '萌宝', '女', '活泼童声'],
  ['Bunny', '萌小姬', '女', '甜美萝莉'],
  ['Nini', '邻家妹妹', '女', '软糯甜美'],
  ['Stella', '少女阿月', '女', '甜美、表现力强'],
].map(([id, name, gender, description]) => ({ id, name, gender, description }))

const terminology = [
  [/\bGPU\b/g, 'G P U'], [/\bCPU\b/g, 'C P U'], [/\bAI\b/g, 'A I'],
  [/\bHPC\b/g, 'H P C'], [/\bCFD\b/g, 'C F D'], [/\bMPI\b/g, 'M P I'],
  [/\bMCP\b/g, 'M C P'], [/\bAPI\b/g, 'A P I'], [/\bRAG\b/g, 'R A G'],
]

const args = parseArgs(process.argv.slice(2))
if (args.help || (!args.listVoices && !args.sample && !args.all)) {
  printHelp()
  process.exit(0)
}
if ([args.listVoices, args.sample, args.all].filter(Boolean).length !== 1) {
  throw new Error('请只选择 --list-voices、--sample 或 --all 中的一种模式。')
}
if (args.listVoices) {
  console.table(voices.map(({ id, name, gender, description }) => ({ id, 中文名: name, 性别: gender, 特点: description })))
  process.exit(0)
}

const projectDir = path.resolve(args.project || process.cwd())
const outputDir = path.resolve(projectDir, args.outputDir || 'demo')
const tmpDir = path.join(outputDir, 'tmp')
const scriptPath = path.resolve(projectDir, args.script || 'demo/video-script.md')
const envPath = path.resolve(args.env || path.join(skillDir, '.env'))
const leadIn = Number(args.leadIn || 0.3)
const defaultPause = Number(args.pause || 3.7)
await mkdir(outputDir, { recursive: true })
await mkdir(tmpDir, { recursive: true })
await loadEnv(envPath)

const apiKey = process.env.DASHSCOPE_API_KEY
if (!apiKey) throw new Error(`没有读取到 DASHSCOPE_API_KEY，请检查 ${envPath}`)
const voice = resolveVoice(args.voice || 'Neil')
const model = args.model || process.env.DASHSCOPE_TTS_MODEL || defaultModel
const endpoint = args.endpoint || process.env.DASHSCOPE_TTS_ENDPOINT || defaultEndpoint
const instruction = args.instruction || process.env.DASHSCOPE_TTS_INSTRUCTION || defaultInstruction
const workDir = path.join(tmpDir, 'qwen-tts', safeName(voice.id))
await mkdir(workDir, { recursive: true })

if (args.sample) {
  const text = prepareText(args.text || '大家好，下面开始本次网页演示。')
  const samplePath = path.join(workDir, `sample-${safeName(voice.id)}.wav`)
  await synthesizeText(text, samplePath)
  console.log(`试听已生成：${samplePath}`)
  process.exit(0)
}

const markdown = await readFile(scriptPath, 'utf8')
const segments = parseNarrationSegments(markdown)
if (!segments.length) throw new Error('没有读取到“HH:MM—HH:MM + 旁白”格式的章节。')

const warnings = []
console.log(`使用 ${voice.id}（${voice.name}）生成 ${segments.length} 段旁白。`)
for (const segment of segments) {
  await synthesizeSegment(segment)
  const gapToNext = segment.duration - segment.spokenDuration
  if (!segment.explicitPause && (gapToNext < 3 || gapToNext > 5)) {
    warnings.push(`${segment.range} 实际段间停顿约 ${gapToNext.toFixed(2)} 秒，建议修改旁白长度后重新生成。`)
  }
  console.log(
    `${segment.range} ${segment.title}：原始 ${segment.rawDuration.toFixed(2)} 秒，` +
    `发声 ${segment.spokenDuration.toFixed(2)} 秒，段间停顿约 ${gapToNext.toFixed(2)} 秒。`,
  )
}

const wavPath = path.join(outputDir, `narration-${safeName(voice.id)}.wav`)
const m4aPath = path.join(outputDir, `narration-${safeName(voice.id)}.m4a`)
await buildNarrationTrack(segments, wavPath)
await run('ffmpeg', ['-y', '-v', 'error', '-i', wavPath, '-c:a', 'aac', '-b:a', '192k', m4aPath])
await writeReport(segments, wavPath, m4aPath, warnings)
console.log(`完整旁白已生成：${wavPath}`)
if (warnings.length) console.warn(`有 ${warnings.length} 条时序警告，请查看 demo/tmp/narration-timing.json。`)

function parseArgs(argv) {
  const parsed = {}
  const flags = new Map([
    ['--help', 'help'], ['-h', 'help'], ['--list-voices', 'listVoices'],
    ['--sample', 'sample'], ['--all', 'all'], ['--resume', 'resume'],
    ['--no-glossary', 'noGlossary'],
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
  console.log(`用 Qwen3-TTS 生成视频旁白。

查看音色（不调用 API）：
  node generate-qwen-narration.mjs --list-voices

生成一句试听：
  node generate-qwen-narration.mjs --project <项目目录> --sample --voice Neil --text "试听文字"

生成完整旁白：
  node generate-qwen-narration.mjs --project <项目目录> --all --voice Neil --resume

可选参数：
  --script <path>       默认 demo/video-script.md
  --output-dir <path>   默认 demo
  --env <path>          默认读取技能根目录 .env
  --pause <seconds>     默认段后停顿 3.7 秒
  --instruction <text>  自定义说话风格
  --no-glossary         不展开常见英文缩写
`)
}

function resolveVoice(requested) {
  const match = voices.find((item) => item.id.toLowerCase() === requested.toLowerCase())
  if (!match) throw new Error(`未知音色：${requested}。请先使用 --list-voices 查看。`)
  return match
}

async function loadEnv(filePath) {
  const source = await readFile(filePath, 'utf8')
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function parseNarrationSegments(source) {
  const heading = /^## (\d{2}):(\d{2})—(\d{2}):(\d{2})\s+(.+)$/gm
  const matches = [...source.matchAll(heading)]
  return matches.map((match, index) => {
    const blockStart = match.index + match[0].length
    const blockEnd = matches[index + 1]?.index ?? source.length
    const block = source.slice(blockStart, blockEnd)
    const marker = block.indexOf('**旁白**')
    if (marker < 0) throw new Error(`${match[0]} 缺少“旁白”。`)
    const start = Number(match[1]) * 60 + Number(match[2])
    const end = Number(match[3]) * 60 + Number(match[4])
    const pauseMatch = block.match(/\*\*段后停顿\*\*\s*[：:]?\s*(\d+(?:\.\d+)?)\s*秒?/)
    return {
      index,
      range: `${match[1]}:${match[2]}—${match[3]}:${match[4]}`,
      title: match[5].trim(),
      start,
      end,
      duration: end - start,
      pauseAfter: pauseMatch ? Number(pauseMatch[1]) : defaultPause,
      explicitPause: Boolean(pauseMatch),
      narration: cleanNarration(block.slice(marker + '**旁白**'.length)),
    }
  })
}

function cleanNarration(text) {
  return text
    .split(/\*\*段后停顿\*\*/)[0]
    .split(/^---$/m)[0]
    .replace(/^##[\s\S]*$/m, '')
    .replace(/\*\*/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, '')
    .trim()
}

function prepareText(text) {
  if (args.noGlossary) return text
  return terminology.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text)
}

async function synthesizeSegment(segment) {
  const segmentDir = path.join(workDir, String(segment.index + 1).padStart(2, '0'))
  await mkdir(segmentDir, { recursive: true })
  const prepared = prepareText(segment.narration)
  const fingerprint = createHash('sha256').update(JSON.stringify({ prepared, voice: voice.id, instruction, model })).digest('hex')
  const metaPath = path.join(segmentDir, 'meta.json')
  const rawPath = path.join(segmentDir, 'raw.wav')
  const calibratedPath = path.join(segmentDir, 'calibrated.wav')
  let reused = false

  if (args.resume && await fileExists(rawPath) && await fileExists(metaPath)) {
    const meta = JSON.parse(await readFile(metaPath, 'utf8'))
    reused = meta.fingerprint === fingerprint
  }

  if (!reused) {
    const chunks = splitText(prepared, safeTextChunkLimit)
    const chunkPaths = []
    for (let index = 0; index < chunks.length; index += 1) {
      const chunkPath = path.join(segmentDir, `chunk-${String(index + 1).padStart(2, '0')}.wav`)
      await synthesizeText(chunks[index], chunkPath)
      chunkPaths.push(chunkPath)
    }
    if (chunkPaths.length === 1) {
      await run('ffmpeg', ['-y', '-v', 'error', '-i', chunkPaths[0], '-ar', '48000', '-ac', '2', rawPath])
    } else {
      await concatAudio(chunkPaths, rawPath)
    }
    await writeFile(metaPath, `${JSON.stringify({ fingerprint, chunks: chunks.length }, null, 2)}\n`)
  }

  const rawDuration = await probeDuration(rawPath)
  const desired = segment.duration - leadIn - segment.pauseAfter
  if (desired <= 0.8) throw new Error(`${segment.range} 可用旁白时长过短，请调整章节或段后停顿。`)
  const requiredTempo = rawDuration / desired
  if (requiredTempo > maximumTempo) {
    throw new Error(
      `${segment.range} 需要 ${requiredTempo.toFixed(3)}× 语速才能保留 ${segment.pauseAfter} 秒停顿。` +
      '请缩短旁白或延长该章节，再使用 --resume 继续。',
    )
  }
  const tempo = Math.max(requiredTempo, minimumTempo)
  await run('ffmpeg', [
    '-y', '-v', 'error', '-i', rawPath,
    '-filter:a', `${atempoFilter(tempo)},aresample=48000`, '-ar', '48000', '-ac', '2', calibratedPath,
  ])
  segment.rawDuration = rawDuration
  segment.spokenDuration = await probeDuration(calibratedPath)
  segment.tempo = tempo
  segment.audioPath = calibratedPath
  segment.reused = reused
}

async function synthesizeText(text, outputPath) {
  if (text.length > safeTextChunkLimit) throw new Error(`单次文本超过 ${safeTextChunkLimit} 字符。`)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: {
        text, voice: voice.id, language_type: 'Chinese',
        instructions: instruction, optimize_instructions: true,
      },
    }),
  })
  const responseText = await response.text()
  let payload
  try {
    payload = JSON.parse(responseText)
  } catch {
    throw new Error(`Qwen3-TTS 返回非 JSON 响应（HTTP ${response.status}）。`)
  }
  if (!response.ok || payload.code || payload.status_code >= 400) {
    const requestId = payload.request_id ? `，request_id=${payload.request_id}` : ''
    throw new Error(`Qwen3-TTS 调用失败：${payload.message || payload.code || response.status}${requestId}`)
  }
  const audio = payload.output?.audio
  if (audio?.url) {
    const audioResponse = await fetch(audio.url)
    if (!audioResponse.ok) throw new Error(`音频下载失败：HTTP ${audioResponse.status}`)
    await writeFile(outputPath, Buffer.from(await audioResponse.arrayBuffer()))
    return
  }
  if (audio?.data) {
    await writeFile(outputPath, Buffer.from(audio.data, 'base64'))
    return
  }
  throw new Error(`响应中没有音频数据，request_id=${payload.request_id || 'unknown'}`)
}

function splitText(text, limit) {
  if (text.length <= limit) return [text]
  const sentences = text.match(/[^。！？；]+[。！？；]?/g) || [text]
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    if (sentence.length > limit) {
      if (current) chunks.push(current)
      for (let offset = 0; offset < sentence.length; offset += limit) chunks.push(sentence.slice(offset, offset + limit))
      current = ''
    } else if ((current + sentence).length > limit) {
      chunks.push(current)
      current = sentence
    } else current += sentence
  }
  if (current) chunks.push(current)
  return chunks
}

async function concatAudio(paths, outputPath) {
  const command = ['-y', '-v', 'error']
  for (const item of paths) command.push('-i', item)
  command.push(
    '-filter_complex', `${paths.map((_, index) => `[${index}:a]`).join('')}concat=n=${paths.length}:v=0:a=1[outa]`,
    '-map', '[outa]', '-ar', '48000', '-ac', '2', outputPath,
  )
  await run('ffmpeg', command)
}

async function buildNarrationTrack(targetSegments, outputPath) {
  const command = ['-y', '-v', 'error']
  for (const segment of targetSegments) command.push('-i', segment.audioPath)
  const filters = targetSegments.map((segment, index) => {
    const delay = Math.round(leadIn * 1000)
    return `[${index}:a]asetpts=PTS-STARTPTS,adelay=${delay}|${delay},apad,` +
      `atrim=0:${segment.duration.toFixed(3)},aresample=48000,` +
      `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[s${index}]`
  })
  filters.push(`${targetSegments.map((_, index) => `[s${index}]`).join('')}concat=n=${targetSegments.length}:v=0:a=1[outa]`)
  command.push('-filter_complex', filters.join(';'), '-map', '[outa]', '-c:a', 'pcm_s16le', outputPath)
  await run('ffmpeg', command)
}

async function writeReport(targetSegments, wavPath, m4aPath, reportWarnings) {
  const report = {
    generatedAt: new Date().toISOString(), model, voice, instruction,
    script: scriptPath, totalDuration: targetSegments.at(-1).end,
    audio: { wav: wavPath, m4a: m4aPath }, warnings: reportWarnings,
    segments: targetSegments.map((segment) => ({
      range: segment.range, title: segment.title, plannedDuration: segment.duration,
      rawDuration: round(segment.rawDuration), spokenDuration: round(segment.spokenDuration),
      tempo: round(segment.tempo), leadIn, requestedPauseAfter: segment.pauseAfter,
      gapToNext: round(segment.duration - segment.spokenDuration),
      explicitPause: segment.explicitPause, reused: segment.reused,
    })),
  }
  await writeFile(path.join(tmpDir, 'narration-timing.json'), `${JSON.stringify(report, null, 2)}\n`)
}

function atempoFilter(value) {
  const filters = []
  let remaining = value
  while (remaining > 2) { filters.push('atempo=2'); remaining /= 2 }
  while (remaining < 0.5) { filters.push('atempo=0.5'); remaining /= 0.5 }
  filters.push(`atempo=${remaining.toFixed(6)}`)
  return filters.join(',')
}

async function probeDuration(filePath) {
  const output = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
  ], true)
  const duration = Number(output.trim())
  if (!Number.isFinite(duration)) throw new Error(`无法读取音频时长：${filePath}`)
  return duration
}

async function fileExists(filePath) {
  try { await access(filePath); return true } catch { return false }
}

function run(command, commandArgs, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: projectDir,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => { stdout += chunk })
    child.stderr?.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} 运行失败：${stderr.trim()}`)))
  })
}

function safeName(value) {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '')
}

function round(value) {
  return Number(value.toFixed(3))
}
