import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdown, hasImageInserted } from './parseTags.mjs';

test('simple tag: extracts id and preceding paragraph', () => {
  const content = `Some paragraph about event loops.\n\n<!-- ai-image: event-loop -->\n`;
  const tags = parseMarkdown(content);
  assert.equal(tags.length, 1);
  assert.equal(tags[0].id, 'event-loop');
  assert.equal(tags[0].kind, undefined);
  assert.equal(tags[0].contextParagraph, 'Some paragraph about event loops.');
});

test('complex tag: extracts all fields', () => {
  const content = `Context paragraph here.\n\n<!-- ai-image\nid: event-loop\nkind: architecture\nstyle: hand-drawn\ninstruction: emphasize the boundary between JS runtime and browser APIs\n-->\n`;
  const tags = parseMarkdown(content);
  assert.equal(tags.length, 1);
  const [tag] = tags;
  assert.equal(tag.id, 'event-loop');
  assert.equal(tag.kind, 'architecture');
  assert.equal(tag.style, 'hand-drawn');
  assert.equal(tag.instruction, 'emphasize the boundary between JS runtime and browser APIs');
  assert.equal(tag.contextParagraph, 'Context paragraph here.');
});

test('tag at top of file has empty context', () => {
  const content = `<!-- ai-image: event-loop -->\n\nSome text after.\n`;
  const tags = parseMarkdown(content);
  assert.equal(tags[0].contextParagraph, '');
});

test('stops context at heading boundary', () => {
  const content = `# Heading\n\nParagraph text.\n<!-- ai-image: id1 -->\n`;
  const tags = parseMarkdown(content);
  assert.equal(tags[0].contextParagraph, 'Paragraph text.');
});

test('multiple tags in one file', () => {
  const content = `Para one.\n<!-- ai-image: id-one -->\n\nPara two.\n<!-- ai-image: id-two -->\n`;
  const tags = parseMarkdown(content);
  assert.equal(tags.length, 2);
  assert.equal(tags[0].id, 'id-one');
  assert.equal(tags[1].id, 'id-two');
});

test('hasImageInserted detects existing image reference', () => {
  const content = `Para.\n<!-- ai-image: id-one -->\n![Id one](./technical/media/id-one.png)\n`;
  const tags = parseMarkdown(content);
  assert.equal(hasImageInserted(content, tags[0]), true);
});

test('hasImageInserted false when no image follows', () => {
  const content = `Para.\n<!-- ai-image: id-one -->\n\nMore text.\n`;
  const tags = parseMarkdown(content);
  assert.equal(hasImageInserted(content, tags[0]), false);
});

test('context skips over a preceding tag + its generated image', () => {
  const content = `Real prose paragraph.\n\n<!-- ai-image: id-one -->\n![Id One](./technical/media/id-one.png)\n\n\n<!-- ai-image: id-two -->\n`;
  const tags = parseMarkdown(content);
  assert.equal(tags[1].id, 'id-two');
  assert.equal(tags[1].contextParagraph, 'Real prose paragraph.');
});

