import { describe, it, expect } from 'vitest';
import { stripMarkdown } from '../../src/util/markdown.js';

describe('stripMarkdown', () => {
  it('removes headings', () => {
    expect(stripMarkdown('# Title')).toBe('Title');
    expect(stripMarkdown('## Subtitle')).toBe('Subtitle');
  });

  it('removes bold and italic', () => {
    expect(stripMarkdown('**bold**')).toBe('bold');
    expect(stripMarkdown('*italic*')).toBe('italic');
    expect(stripMarkdown('__bold__ and _italic_')).toBe('bold and italic');
  });

  it('removes inline code', () => {
    expect(stripMarkdown('use `npm install`')).toBe('use npm install');
  });

  it('removes fenced code blocks', () => {
    const input = '```ts\nconst x = 1;\n```';
    expect(stripMarkdown(input)).toBe('const x = 1;');
  });

  it('converts links to their text', () => {
    expect(stripMarkdown('[OpenAI](https://openai.com)')).toBe('OpenAI');
  });

  it('converts images to alt text', () => {
    expect(stripMarkdown('![logo](logo.png)')).toBe('logo');
  });

  it('removes list markers', () => {
    const input = '- first\n* second\n1. third';
    expect(stripMarkdown(input)).toBe('first\nsecond\nthird');
  });

  it('removes blockquotes', () => {
    expect(stripMarkdown('> quoted text')).toBe('quoted text');
  });

  it('returns plain text unchanged', () => {
    const input = 'Just plain text with multiple lines.\nNothing special.';
    expect(stripMarkdown(input)).toBe(input);
  });
});
