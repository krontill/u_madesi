import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';
const DEFAULT_MODEL = 'gpt-image-1';
const DEFAULT_SIZE = '1024x1024';
const MAX_RETRIES = 1;

function buildPrompt({ kind, style, instruction, contextParagraph }) {
  const parts = [];
  parts.push(`Create a ${style || 'clean flat vector diagram'} style ${kind || 'illustration'} for a technical book.`);
  if (contextParagraph) parts.push(`Context from the book: """${contextParagraph}"""`);
  if (instruction) parts.push(`Specific instruction: ${instruction}`);
  parts.push('No text or letters in the image.');
  return parts.join('\n');
}

async function requestImage(prompt, apiKey) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(OPENAI_IMAGES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: DEFAULT_MODEL, prompt, size: DEFAULT_SIZE, n: 1 }),
    });
    if (response.ok) {
      const data = await response.json();
      return data.data[0].b64_json;
    }
    lastError = new Error(`OpenAI image request failed (${response.status}): ${await response.text()}`);
    if (response.status !== 429 && response.status < 500) break;
  }
  throw lastError;
}

/**
 * Generates (or, in dry-run mode, fakes) an image for a tag and writes it to `outPath`.
 * @returns {Promise<{path: string}>}
 */
export async function generateImage(tag, outPath, { dryRun = false } = {}) {
  await mkdir(path.dirname(outPath), { recursive: true });

  if (dryRun) {
    await writeFile(outPath, `placeholder for ${tag.id}\n${buildPrompt(tag)}\n`, 'utf8');
    return { path: outPath };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const prompt = buildPrompt(tag);
  const b64 = await requestImage(prompt, apiKey);
  await writeFile(outPath, Buffer.from(b64, 'base64'));
  return { path: outPath };
}
