// Parses <!-- ai-image ... --> comment tags out of Markdown text.
const TAG_RE = /<!--\s*ai-image([\s\S]*?)-->/g;
const HEADING_RE = /^#{1,6}\s/;
const KEY_LINE_RE = /^([a-zA-Z_-]+):\s*(.*)$/;
const IMAGE_ONLY_LINE_RE = /^!\[[^\]]*\]\([^)]*\)\s*$/;

function parseTagBody(rawBody) {
  const trimmed = rawBody.trim();
  const singleLine = trimmed.match(/^:\s*(.+)$/);
  if (singleLine && !trimmed.includes('\n')) {
    return { id: singleLine[1].trim(), kind: undefined, style: undefined, instruction: undefined, alt: undefined };
  }

  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  const fields = {};
  let currentKey = null;
  for (const line of lines) {
    const match = line.match(KEY_LINE_RE);
    if (match) {
      currentKey = match[1].toLowerCase();
      fields[currentKey] = match[2];
    } else if (currentKey) {
      fields[currentKey] = `${fields[currentKey]} ${line}`.trim();
    }
  }
  return { id: fields.id, kind: fields.kind, style: fields.style, instruction: fields.instruction, alt: fields.alt };
}

// Nearest non-blank prose above `index`, transparently skipping over other ai-image tags and
// their generated images so those don't get treated as "context" for the current tag.
function getPrecedingParagraph(content, index, tagLineRanges) {
  const lines = content.slice(0, index).split('\n');
  const isInsideAnotherTag = (lineIdx) =>
    tagLineRanges.some(([start, end]) => lineIdx + 1 >= start && lineIdx + 1 <= end);

  let i = lines.length - 1;
  const paraLines = [];
  let collecting = false;
  while (i >= 0) {
    const line = lines[i];
    const isBlank = line.trim() === '';
    const isHeading = HEADING_RE.test(line);
    const isTransparent = IMAGE_ONLY_LINE_RE.test(line.trim()) || isInsideAnotherTag(i);

    if (isBlank || isHeading || (isTransparent && collecting)) {
      if (collecting) break;
      i -= 1;
      continue;
    }
    if (isTransparent) {
      i -= 1;
      continue;
    }
    paraLines.unshift(line);
    collecting = true;
    i -= 1;
  }
  return paraLines.join('\n').trim();
}

/**
 * @param {string} content full Markdown file content
 * @returns {Array<{id: string, kind?: string, style?: string, instruction?: string, alt?: string,
 *   matchStart: number, matchEnd: number, raw: string, contextParagraph: string, line: number}>}
 */
export function parseMarkdown(content) {
  const rawMatches = [];
  let match;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(content)) !== null) {
    const startLine = content.slice(0, match.index).split('\n').length;
    const endLine = content.slice(0, match.index + match[0].length).split('\n').length;
    rawMatches.push({ match, startLine, endLine });
  }

  const tagLineRanges = rawMatches.map((m) => [m.startLine, m.endLine]);

  const tags = [];
  for (const { match: m, startLine } of rawMatches) {
    const fields = parseTagBody(m[1]);
    if (!fields.id) continue;
    tags.push({
      ...fields,
      matchStart: m.index,
      matchEnd: m.index + m[0].length,
      raw: m[0],
      contextParagraph: getPrecedingParagraph(content, m.index, tagLineRanges),
      line: startLine,
    });
  }
  return tags;
}

// True if a Markdown image referencing this tag's id already follows the tag.
export function hasImageInserted(content, tag) {
  const after = content.slice(tag.matchEnd);
  const nextNonBlankLine = after.split('\n').find((l) => l.trim() !== '');
  if (!nextNonBlankLine) return false;
  const imgRe = new RegExp(`!\\[[^\\]]*\\]\\([^)]*${tag.id}[^)]*\\)`);
  return imgRe.test(nextNonBlankLine);
}
