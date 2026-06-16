import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Config } from '../src/config.js';

describe('Config', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    // Restore environment variables.
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('MINI_AGENT_')) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
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
    expect(config.tools.maxToolResultTokens).toBe(8000);
    expect(config.tools.security.bash.allowDangerousCommands).toBe(false);
    expect(config.logging.verbose).toBe(false);
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
        'verbose: true',
        'maxSteps: 20',
        'retry:',
        '  enabled: false',
        '  maxRetries: 1',
        'history:',
        '  autoSave: false',
        '  maxHistoryTokens: 4000',
        'tools:',
        '  maxToolResultTokens: 2000',
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
    expect(config.logging.verbose).toBe(true);
    expect(config.agent.maxSteps).toBe(20);
    expect(config.llm.retry.enabled).toBe(false);
    expect(config.llm.retry.maxRetries).toBe(1);
    expect(config.history.autoSave).toBe(false);
    expect(config.history.maxHistoryTokens).toBe(4000);
    expect(config.tools.maxToolResultTokens).toBe(2000);
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

  it('loads config from environment variables only', () => {
    process.env['MINI_AGENT_API_KEY'] = 'env-key';
    process.env['MINI_AGENT_MODEL'] = 'env-model';
    process.env['MINI_AGENT_PROVIDER'] = 'openai';

    const config = Config.load();

    expect(config.llm.apiKey).toBe('env-key');
    expect(config.llm.model).toBe('env-model');
    expect(config.llm.provider).toBe('openai');
  });

  it('environment variables override YAML config', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(
      configPath,
      [
        "apiKey: 'yaml-key'",
        "model: 'yaml-model'",
        "provider: 'anthropic'",
      ].join('\n'),
      'utf8'
    );

    process.env['MINI_AGENT_MODEL'] = 'env-model';

    const config = Config.load(configPath);

    expect(config.llm.apiKey).toBe('yaml-key');
    expect(config.llm.model).toBe('env-model');
    expect(config.llm.provider).toBe('anthropic');
  });

  it('supports nested environment variables with double underscore', () => {
    process.env['MINI_AGENT_API_KEY'] = 'env-key';
    process.env['MINI_AGENT_RETRY__ENABLED'] = 'false';
    process.env['MINI_AGENT_RETRY__MAX_RETRIES'] = '1';
    process.env['MINI_AGENT_HISTORY__MAX_HISTORY_TOKENS'] = '4000';

    const config = Config.load();

    expect(config.llm.retry.enabled).toBe(false);
    expect(config.llm.retry.maxRetries).toBe(1);
    expect(config.history.maxHistoryTokens).toBe(4000);
  });

  it('converts boolean and numeric env values', () => {
    process.env['MINI_AGENT_API_KEY'] = 'env-key';
    process.env['MINI_AGENT_ENABLE_LOGGING'] = 'true';
    process.env['MINI_AGENT_VERBOSE'] = 'true';
    process.env['MINI_AGENT_MAX_STEPS'] = '42';

    const config = Config.load();

    expect(config.logging.enableLogging).toBe(true);
    expect(config.logging.verbose).toBe(true);
    expect(config.agent.maxSteps).toBe(42);
  });
});
