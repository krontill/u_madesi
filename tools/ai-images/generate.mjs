#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { parseMarkdown, hasImageInserted } from './parseTags.mjs';
import { loadManifest, saveManifest, needsGeneration, recordGeneration } from './manifest.mjs';
import { generateImage } from './imageClient.mjs';

const execFileAsync = promisify(execFile);
const MEDIA_DIR = path.join('technical', 'media');
const MANIFEST_PATH = path.join(MEDIA_DIR, '.ai-image-manifest.json');

function parseArgs(argv) {
  const args = { dryRun: false, files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base') args.base = argv[++i];
    else if (arg === '--head') args.head = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--file') args.files.push(argv[++i]);
  }
  return args;
}

async function getChangedMarkdownFiles(base, head) {
  const { stdout } = await execFileAsync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${base}`, `${head}`, '--', '*.md']);
  return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}

function toTitleCase(id) {
  return id.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function relativeMediaPath(fromFile, id) {
  const rel = path.relative(path.dirname(fromFile), path.join(MEDIA_DIR, `${id}.png`));
  return rel.split(path.sep).join('/');
}

async function processFile(filePath, manifest, { dryRun }, summary) {
  const original = await readFile(filePath, 'utf8');
  const tags = parseMarkdown(original);
  if (tags.length === 0) return;

  let content = original;
  // Process from the last tag to the first so earlier offsets stay valid after edits.
  for (const tag of [...tags].sort((a, b) => b.matchStart - a.matchStart)) {
    const outPath = path.join(MEDIA_DIR, `${tag.id}.png`);
    try {
      if (needsGeneration(tag, manifest)) {
        await generateImage(tag, outPath, { dryRun });
        recordGeneration(manifest, tag, outPath);
        summary.generated.push(tag.id);
      } else {
        summary.skipped.push(tag.id);
      }

      if (!hasImageInserted(content, tag)) {
        const alt = tag.alt || toTitleCase(tag.id);
        const imgPath = relativeMediaPath(filePath, tag.id);
        const insertion = `\n![${alt}](${imgPath})`;
        content = `${content.slice(0, tag.matchEnd)}${insertion}${content.slice(tag.matchEnd)}`;
      }
    } catch (err) {
      summary.failed.push({ id: tag.id, file: filePath, error: err.message });
    }
  }

  if (content !== original) await writeFile(filePath, content, 'utf8');
}

async function writeStepSummary(summary) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const lines = [
    '## ai-image generation summary',
    `- Generated: ${summary.generated.join(', ') || 'none'}`,
    `- Skipped (up to date): ${summary.skipped.join(', ') || 'none'}`,
    `- Failed: ${summary.failed.map((f) => `${f.id} (${f.error})`).join(', ') || 'none'}`,
  ];
  console.log(lines.join('\n'));
  if (summaryPath) await writeFile(summaryPath, `${lines.join('\n')}\n`, { flag: 'a' });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = args.files.length > 0 ? args.files : await getChangedMarkdownFiles(args.base ?? 'HEAD~1', args.head ?? 'HEAD');

  const manifest = await loadManifest(MANIFEST_PATH);
  const summary = { generated: [], skipped: [], failed: [] };

  for (const file of files) {
    await processFile(file, manifest, { dryRun: args.dryRun }, summary);
  }

  await saveManifest(MANIFEST_PATH, manifest);
  await writeStepSummary(summary);

  if (summary.failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
