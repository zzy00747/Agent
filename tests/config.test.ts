import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Config } from '../src/config.js';

describe('Config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('uses defaults for optional fields', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(
      configPath,
      `apiKey: 'test-key'\n`,
      'utf8'
    );

    const config = Config.fromYaml(configPath);

    expect(config.llm.apiKey).toBe('test-key');
    expect(config.llm.provider).toBe('anthropic');
    expect(config.llm.model).toBe('MiniMax-M2');
    expect(config.agent.maxSteps).toBe(50);
    expect(config.history.autoSave).toBe(true);
    expect(config.history.maxHistoryTokens).toBe(0);
    expect(config.tools.security.bash.allowDangerousCommands).toBe(false);
  });

  it('parses custom values', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(
      configPath,
      [
        "apiKey: 'test-key'",
        "apiBase: 'https://custom.example/'",
        "model: 'custom-model'",
        "provider: 'openai'",
        'enableLogging: true',
        'maxSteps: 20',
        'retry:',
        '  enabled: false',
        '  maxRetries: 1',
        'history:',
        '  autoSave: false',
        '  maxHistoryTokens: 4000',
        'tools:',
        '  security:',
        '    bash:',
        '      allowDangerousCommands: true',
      ].join('\n'),
      'utf8'
    );

    const config = Config.fromYaml(configPath);

    expect(config.llm.provider).toBe('openai');
    expect(config.llm.model).toBe('custom-model');
    expect(config.llm.apiBase).toBe('https://custom.example/');
    expect(config.logging.enableLogging).toBe(true);
    expect(config.agent.maxSteps).toBe(20);
    expect(config.llm.retry.enabled).toBe(false);
    expect(config.llm.retry.maxRetries).toBe(1);
    expect(config.history.autoSave).toBe(false);
    expect(config.history.maxHistoryTokens).toBe(4000);
    expect(config.tools.security.bash.allowDangerousCommands).toBe(true);
  });

  it('throws when apiKey is missing', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(configPath, 'provider: openai\n', 'utf8');

    expect(() => Config.fromYaml(configPath)).toThrow();
  });

  it('throws when file does not exist', () => {
    expect(() => Config.fromYaml(path.join(tempDir, 'missing.yaml'))).toThrow(
      'does not exist'
    );
  });

  it('throws when file is empty', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(configPath, '   \n', 'utf8');

    expect(() => Config.fromYaml(configPath)).toThrow('empty');
  });
});
