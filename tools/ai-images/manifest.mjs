import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const MANIFEST_VERSION = 1;

export async function loadManifest(manifestPath) {
  try {
    const raw = await readFile(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return { version: MANIFEST_VERSION, images: {} };
    throw err;
  }
}

export async function saveManifest(manifestPath, manifest) {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  const serialized = JSON.stringify({ version: MANIFEST_VERSION, images: manifest.images }, null, 2);
  await writeFile(manifestPath, `${serialized}\n`, 'utf8');
}

// Hash covers everything that affects the generated image, so edits to the tag trigger regeneration.
export function computeHash(tag) {
  const normalized = JSON.stringify({
    kind: tag.kind ?? '',
    style: tag.style ?? '',
    instruction: tag.instruction ?? '',
    contextParagraph: tag.contextParagraph ?? '',
  });
  return createHash('sha256').update(normalized).digest('hex');
}

export function needsGeneration(tag, manifest) {
  const entry = manifest.images[tag.id];
  if (!entry) return true;
  return entry.hash !== computeHash(tag);
}

export function recordGeneration(manifest, tag, file) {
  manifest.images[tag.id] = { hash: computeHash(tag), file, generatedAt: new Date().toISOString() };
}
