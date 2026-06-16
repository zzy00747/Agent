/**
 * Load configuration overrides from environment variables.
 *
 * Supports variables prefixed with MINI_AGENT_.
 * Nested config keys use double underscore separator.
 *
 * Examples:
 *   MINI_AGENT_API_KEY=sk-xxx        -> { apiKey: 'sk-xxx' }
 *   MINI_AGENT_RETRY__ENABLED=false  -> { retry: { enabled: false } }
 */

const ENV_PREFIX = 'MINI_AGENT_';

function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === '') return '';

  const num = Number(value);
  if (!Number.isNaN(num) && String(num) === value) {
    return num;
  }

  return value;
}

function setNestedValue(
  target: Record<string, unknown>,
  keys: string[],
  value: unknown
): void {
  const [head, ...rest] = keys;
  if (!head) return;

  if (rest.length === 0) {
    target[head] = value;
    return;
  }

  if (
    typeof target[head] !== 'object' ||
    target[head] === null ||
    Array.isArray(target[head])
  ) {
    target[head] = {};
  }

  setNestedValue(target[head] as Record<string, unknown>, rest, value);
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Read MINI_AGENT_* environment variables and build a config object.
 */
export function loadEnvConfig(
  env: Record<string, string | undefined> = process.env
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(ENV_PREFIX) || value === undefined) continue;

    const configKey = key.slice(ENV_PREFIX.length);
    if (!configKey) continue;

    const keys = configKey.split('__').map((part) => {
      // Convert UPPER_SNAKE_CASE to camelCase.
      return part
        .toLowerCase()
        .replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
    });

    setNestedValue(config, keys, parseValue(value));
  }

  return config;
}

/**
 * Deep merge a base config object with environment variable overrides.
 */
export function mergeWithEnv(
  base: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env
): Record<string, unknown> {
  return deepMerge(base, loadEnvConfig(env));
}
