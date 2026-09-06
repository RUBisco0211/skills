#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const options = {
    input: "doc.md",
    imageDir: "images/mermaid",
    sourceDir: "images/mermaid/source",
    config: "puppeteer-config.json",
    width: "1800",
    scale: "2",
    background: "white",
    captionPrefix: "图 ",
    clean: false,
    rewrite: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return argv[i];
    };

    if (arg === "--input") options.input = next();
    else if (arg === "--image-dir") options.imageDir = next();
    else if (arg === "--source-dir") options.sourceDir = next();
    else if (arg === "--config") options.config = next();
    else if (arg === "--width") options.width = next();
    else if (arg === "--scale") options.scale = next();
    else if (arg === "--background") options.background = next();
    else if (arg === "--caption-prefix") options.captionPrefix = next();
    else if (arg === "--clean") options.clean = true;
    else if (arg === "--no-rewrite") options.rewrite = false;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  render-mermaid-figures.mjs [options]

Options:
  --input <path>            Markdown file. Default: doc.md
  --image-dir <path>        Rendered PNG directory. Default: images/mermaid
  --source-dir <path>       Mermaid source directory. Default: images/mermaid/source
  --config <path>           Puppeteer config path. Default: puppeteer-config.json
  --width <number>          Mermaid render width. Default: 1800
  --scale <number>          Mermaid render scale. Default: 2
  --background <color>      Render background. Default: white
  --caption-prefix <text>   Caption prefix after Mermaid blocks. Default: 图
  --clean                   Delete existing figure-XX PNG/MMD files before fresh extraction
  --no-rewrite              Render only, do not modify Markdown
`);
}

function ensureMmdc() {
  const result = spawnSync("mmdc", ["--version"], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error("mmdc was not found. Install @mermaid-js/mermaid-cli first.");
  }
}

function removeExistingFigures(imageDir, sourceDir) {
  for (const directory of [imageDir, sourceDir]) {
    if (!fs.existsSync(directory)) continue;
    for (const filename of fs.readdirSync(directory)) {
      if (/^figure-\d+\.(png|mmd)$/.test(filename)) {
        fs.unlinkSync(path.join(directory, filename));
      }
    }
  }
}

function extractFigures(document, options) {
  const escapedPrefix = options.captionPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("```mermaid\\n([\\s\\S]*?)\\n```\\n\\n(" + escapedPrefix + "[^\\n]+)", "g");
  const figures = [];
  let match;

  while ((match = pattern.exec(document)) !== null) {
    const index = figures.length + 1;
    const number = String(index).padStart(2, "0");
    const mermaidPath = path.join(options.sourceDir, `figure-${number}.mmd`);
    const imagePath = path.join(options.imageDir, `figure-${number}.png`);

    fs.writeFileSync(mermaidPath, `${match[1]}\n`);
    figures.push({
      fullMatch: match[0],
      caption: match[2],
      mermaidPath,
      imagePath,
      relativeImagePath: path.relative(path.dirname(options.input), imagePath).replaceAll(path.sep, "/"),
    });
  }

  return figures;
}

function loadFiguresFromSource(options) {
  if (!fs.existsSync(options.sourceDir)) return [];
  return fs
    .readdirSync(options.sourceDir)
    .sort()
    .filter((filename) => /^figure-\d+\.mmd$/.test(filename))
    .map((filename) => {
      const number = filename.match(/\d+/)[0];
      return {
        mermaidPath: path.join(options.sourceDir, filename),
        imagePath: path.join(options.imageDir, `figure-${number}.png`),
      };
    });
}

function renderFigure(figure, options) {
  const args = [
    "-i",
    figure.mermaidPath,
    "-o",
    figure.imagePath,
    "-b",
    options.background,
    "-w",
    options.width,
    "-s",
    options.scale,
  ];

  if (fs.existsSync(options.config)) {
    args.unshift("-p", options.config);
  }

  const result = spawnSync("mmdc", args, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`Failed to render ${figure.mermaidPath}`);
  }
}

const options = parseArgs(process.argv.slice(2));
options.input = path.resolve(options.input);
options.imageDir = path.resolve(options.imageDir);
options.sourceDir = path.resolve(options.sourceDir);
options.config = path.resolve(options.config);

ensureMmdc();

if (!fs.existsSync(options.input)) {
  throw new Error(`Input Markdown file does not exist: ${options.input}`);
}

fs.mkdirSync(options.imageDir, { recursive: true });
fs.mkdirSync(options.sourceDir, { recursive: true });

const document = fs.readFileSync(options.input, "utf8");

if (options.clean) {
  removeExistingFigures(options.imageDir, options.sourceDir);
}

let figures = extractFigures(document, options);
if (figures.length === 0) {
  figures = loadFiguresFromSource(options);
}

if (figures.length === 0) {
  throw new Error(`No Mermaid diagrams found in ${options.input} or ${options.sourceDir}.`);
}

for (const figure of figures) {
  renderFigure(figure, options);
}

if (options.rewrite && figures[0].fullMatch) {
  let updated = document;
  for (const figure of figures) {
    const replacement = `![${figure.caption}](${figure.relativeImagePath})\n\n${figure.caption}`;
    updated = updated.replace(figure.fullMatch, replacement);
  }
  fs.writeFileSync(options.input, updated);
}

console.log(`Rendered ${figures.length} Mermaid diagram(s).`);
if (figures[0].fullMatch && options.rewrite) {
  console.log(`Updated Markdown: ${options.input}`);
}
