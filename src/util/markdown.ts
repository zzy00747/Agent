/**
 * Lightweight Markdown-to-plain-text stripper.
 *
 * Uses regexes only (no external parser). The goal is to make LLM output
 * readable as plain text in a terminal, not to produce perfect Markdown
 * rendering.
 */

/**
 * Remove common Markdown formatting from a string while preserving paragraph
 * structure and normal whitespace.
 */
export function stripMarkdown(text: string): string {
  if (!text) {
    return text;
  }

  let plain = text;

  // Fenced code blocks: ```lang\n...\n```
  plain = plain.replace(/```[\s\S]*?```/g, (match) => {
    const inner = match.slice(3, -3).replace(/^\w*\n/, '');
    return inner ? `\n${inner.trim()}\n` : '\n';
  });

  // Inline code: `code`
  plain = plain.replace(/`([^`]+)`/g, '$1');

  // Images: ![alt](url) -> alt
  plain = plain.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Links: [text](url) -> text
  plain = plain.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Bare URLs in angle brackets: <url> -> url
  plain = plain.replace(/<([^>\s]+)>/g, '$1');

  // Headings: # ... -> ...
  plain = plain.replace(/^#{1,6}\s+/gm, '');

  // Blockquotes: > ... -> ...
  plain = plain.replace(/^>\s?/gm, '');

  // Bold/italic: **text**, __text__, *text*, _text_
  plain = plain.replace(/(\*\*|__)(.*?)\1/g, '$2');
  plain = plain.replace(/(\*|_)(.*?)\1/g, '$2');

  // Strikethrough: ~~text~~
  plain = plain.replace(/~~(.*?)~~/g, '$1');

  // Horizontal rules
  plain = plain.replace(/\n(?:-{3,}|\*{3,}|_{3,})\s*\n/g, '\n');

  // Unordered list markers at line start
  plain = plain.replace(/^[\*\-+]\s+/gm, '');

  // Ordered list markers at line start
  plain = plain.replace(/^\d+\.\s+/gm, '');

  // Task list markers: [x], [ ]
  plain = plain.replace(/^\[([ xX])\]\s+/gm, '$1 ');

  // Collapse multiple blank lines to a single blank line
  plain = plain.replace(/\n{3,}/g, '\n\n');

  return plain.trim();
}
