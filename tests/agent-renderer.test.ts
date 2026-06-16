import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TerminalAgentRenderer } from '../src/util/agent-renderer.js';

describe('TerminalAgentRenderer', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('writes markdown chunks unchanged in markdown mode', () => {
    const renderer = new TerminalAgentRenderer(false, 'markdown');
    renderer.onResponseStart(false);
    renderer.onResponseChunk('**bold** and `code`');

    expect(writeSpy).toHaveBeenCalledWith('**bold** and `code`');
  });

  it('strips markdown in text mode', () => {
    const renderer = new TerminalAgentRenderer(false, 'text');
    renderer.onResponseStart(false);
    renderer.onResponseChunk('**bold** and `code`');

    expect(writeSpy).toHaveBeenCalledWith('bold and code');
  });
});
