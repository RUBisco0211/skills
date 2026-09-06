#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  printHelp()
  process.exit(0)
}

const projectDir = path.resolve(args.project || process.cwd())
const outputDir = path.resolve(projectDir, args.outputDir || 'demo')
const tmpDir = path.join(outputDir, 'tmp')
const scriptPath = path.resolve(projectDir, args.script || 'demo/video-script.md')
const timingPath = path.resolve(projectDir, args.timing || 'demo/tmp/narration-timing.json')
const outputBase = path.resolve(projectDir, args.outputBase || 'demo/subtitles')
const format = args.format || 'both'
const maxChars = Number(args.maxChars || 22)
const leadIn = Number(args.leadIn || 0.3)
const defaultPause = Number(args.pause || 3.7)
const cueGap = Number(args.cueGap || 0.08)

if (!['srt', 'ass', 'both'].includes(format)) throw new Error('--format 只能是 srt、ass 或 both。')
await mkdir(outputDir, { recursive: true })
await mkdir(tmpDir, { recursive: true })

const markdown = await readFile(scriptPath, 'utf8')
const segments = parseNarrationSegments(markdown)
if (!segments.length) throw new Error('没有读取到“HH:MM—HH:MM + 旁白”格式的章节。')

let timingSegments
if (await fileExists(timingPath)) {
  const timing = JSON.parse(await readFile(timingPath, 'utf8'))
  timingSegments = timing.segments
  if (!Array.isArray(timingSegments) || timingSegments.length !== segments.length) {
    throw new Error('时间报告与视频脚本的章节数不一致。')
  }
}

const cues = buildCues(segments, timingSegments)
const srtPath = `${outputBase}.srt`
const assPath = `${outputBase}.ass`
if (format === 'srt' || format === 'both') await writeFile(srtPath, renderSrt(cues), 'utf8')
if (format === 'ass' || format === 'both') await writeFile(assPath, renderAss(cues), 'utf8')

const check = validateCues(cues, segments.at(-1).end)
const checkPath = path.join(tmpDir, 'subtitle-check.json')
await writeFile(checkPath, `${JSON.stringify(check, null, 2)}\n`, 'utf8')
if (check.errors.length) {
  throw new Error(`字幕校验失败，请查看 ${checkPath}`)
}

console.log(`字幕已生成：${format === 'ass' ? assPath : srtPath}`)
console.log(`共 ${cues.length} 条；警告 ${check.warnings.length} 条；校验报告：${checkPath}`)

function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') {
      parsed.help = true
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
  console.log(`根据视频讲解脚本生成 SRT/ASS 字幕。

  node generate-subtitles.mjs --project <项目目录>

可选参数：
  --script <path>       视频脚本，默认 demo/video-script.md
  --timing <path>       旁白时间报告，默认 demo/tmp/narration-timing.json
  --output-base <path>  输出文件前缀，默认 demo/subtitles
  --format <value>      srt、ass 或 both，默认 both
  --max-chars <number>  单条字幕最大字符数，默认 22
  --pause <seconds>     无旁白报告时的默认段后停顿，默认 3.7 秒
`)
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
      text: cleanNarration(block.slice(marker + '**旁白**'.length)),
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

function buildCues(segments, timings) {
  const cues = []
  for (const segment of segments) {
    const texts = splitCaptionText(segment.text, maxChars).map(sanitizeCue).filter(Boolean)
    const timing = timings?.[segment.index]
    const reportDuration = timing && Number(
      timing.spokenDuration ?? timing.narrationDuration ??
      (timing.rawDuration && timing.tempo ? timing.rawDuration / timing.tempo : NaN),
    )
    const spokenDuration = Number.isFinite(reportDuration)
      ? Math.min(reportDuration, segment.duration - leadIn - 0.1)
      : Math.max(0.8, segment.duration - leadIn - segment.pauseAfter)
    const weights = texts.map(captionWeight)
    const totalWeight = weights.reduce((sum, value) => sum + value, 0)
    let cursor = segment.start + leadIn
    texts.forEach((text, index) => {
      const slot = spokenDuration * weights[index] / totalWeight
      const start = cursor
      const end = Math.min(segment.end - 0.05, cursor + slot - cueGap)
      cues.push({ index: cues.length + 1, start, end, text, segment: segment.range })
      cursor += slot
    })
  }
  return cues
}

function splitCaptionText(text, limit) {
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
  const words = [...segmenter.segment(text)].map((item) => item.segment)
  const result = []
  let current = ''
  for (const word of words) {
    if (current && current.length + word.length > limit) {
      result.push(current)
      current = ''
    }
    if (word.length > limit) {
      for (let offset = 0; offset < word.length; offset += limit) {
        const piece = word.slice(offset, offset + limit)
        if (piece.length === limit) result.push(piece)
        else current = piece
      }
    } else {
      current += word
    }
  }
  if (current) result.push(current)
  if (result.length > 1 && result.at(-1).length < 8) rebalanceTail(result, segmenter)
  return result
}

function rebalanceTail(result, segmenter) {
  const tail = result.pop()
  const previous = result.pop()
  const combined = previous + tail
  const words = [...segmenter.segment(combined)].map((item) => item.segment)
  const target = Math.ceil(combined.length / 2)
  let left = ''
  while (words.length && left.length < target) left += words.shift()
  result.push(left, words.join(''))
}

function sanitizeCue(value) {
  return value
    .trim()
    .replace(/^[，。！？；：、,.!?;:…—\-）】》”’]+/u, '')
    .replace(/[，；：、,;:…—\-（【《“‘]+$/u, '')
    .trim()
}

function captionWeight(text) {
  let weight = 0
  for (const character of text) {
    if (/[A-Za-z0-9]/.test(character)) weight += 0.55
    else if (!/\s/.test(character)) weight += 1
  }
  if (/[。！？]$/.test(text)) weight += 1.3
  return Math.max(weight, 1)
}

function validateCues(cues, totalDuration) {
  const errors = []
  const warnings = []
  const leadingJunk = /^[，。！？；：、,.!?;:…—\-）】》”’]/u
  const trailingJunk = /[，；：、,;:…—\-（【《“‘]$/u
  let previousEnd = 0
  cues.forEach((cue) => {
    const duration = cue.end - cue.start
    if (cue.start < previousEnd - 0.001) errors.push(`第 ${cue.index} 条与上一条重叠。`)
    if (cue.end <= cue.start) errors.push(`第 ${cue.index} 条结束时间不晚于开始时间。`)
    if (cue.end > totalDuration + 0.001) errors.push(`第 ${cue.index} 条超出视频总时长。`)
    if (leadingJunk.test(cue.text) || trailingJunk.test(cue.text)) {
      errors.push(`第 ${cue.index} 条仍有前后无用标点：${cue.text}`)
    }
    if (duration < 0.8) warnings.push(`第 ${cue.index} 条显示时间仅 ${duration.toFixed(2)} 秒。`)
    if (duration > 7) warnings.push(`第 ${cue.index} 条显示时间达到 ${duration.toFixed(2)} 秒。`)
    if ([...cue.text].length < 4) warnings.push(`第 ${cue.index} 条过短：${cue.text}`)
    previousEnd = cue.end
  })
  return {
    generatedAt: new Date().toISOString(),
    cues: cues.length,
    totalDuration,
    first: cues[0] ? { start: round(cues[0].start), text: cues[0].text } : null,
    last: cues.at(-1) ? { end: round(cues.at(-1).end), text: cues.at(-1).text } : null,
    errors,
    warnings,
  }
}

function renderSrt(cues) {
  return `${cues.map((cue) => [
    cue.index,
    `${srtTime(cue.start)} --> ${srtTime(cue.end)}`,
    cue.text,
  ].join('\n')).join('\n\n')}\n`
}

function renderAss(cues) {
  const font = args.font || 'PingFang SC'
  const fontSize = Number(args.fontSize || 44)
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00101010,&H78000000,0,0,0,0,100,100,0,0,3,1,0,2,80,80,48,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
  return `${header}${cues.map((cue) => (
    `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${escapeAss(cue.text)}`
  )).join('\n')}\n`
}

function srtTime(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000))
  return `${pad(Math.floor(milliseconds / 3600000))}:` +
    `${pad(Math.floor(milliseconds % 3600000 / 60000))}:` +
    `${pad(Math.floor(milliseconds % 60000 / 1000))},${String(milliseconds % 1000).padStart(3, '0')}`
}

function assTime(seconds) {
  const centiseconds = Math.max(0, Math.round(seconds * 100))
  return `${Math.floor(centiseconds / 360000)}:` +
    `${pad(Math.floor(centiseconds % 360000 / 6000))}:` +
    `${pad(Math.floor(centiseconds % 6000 / 100))}.${String(centiseconds % 100).padStart(2, '0')}`
}

function escapeAss(text) {
  return text.replace(/\\/g, '\\\\').replace(/[{}]/g, '').replace(/\n/g, '\\N')
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function round(value) {
  return Number(value.toFixed(3))
}
