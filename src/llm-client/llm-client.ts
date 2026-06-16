import {
  LLMProvider,
  type LLMStreamChunk,
  type Message,
} from '../schema/schema.js';
import type { Tool } from '../tools/index.js';
import {
  LLMClientBase,
  type ConnectionCheckResult,
} from './llm-client-base.js';
import { OpenAIClient } from './openai-client.js';
import { AnthropicClient } from './anthropic-client.js';

import type { RetryConfig } from '../config.js';

export class LLMClient {
  public apiKey: string;
  public apiBase: string;
  public provider: string;
  public model: string;
  public retryConfig: RetryConfig;

  // Internal client instance; kept private for encapsulation.
  private _client: LLMClientBase;

  constructor(
    apiKey: string,
    apiBase: string,
    provider: string,
    model: string,
    retryConfig: RetryConfig
  ) {
    this.apiKey = apiKey;
    this.provider = provider;
    this.model = model;
    this.retryConfig = retryConfig;

    let fullApiBase: string = '';

    switch (provider) {
      case LLMProvider.ANTHROPIC:
        fullApiBase = apiBase.replace(/\/+$/, '');
        this._client = new AnthropicClient(
          apiKey,
          fullApiBase,
          model,
          retryConfig
        );
        break;

      case LLMProvider.OPENAI:
        fullApiBase = apiBase.replace(/\/+$/, '');
        this._client = new OpenAIClient(
          apiKey,
          fullApiBase,
          model,
          retryConfig
        );
        break;

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    this.apiBase = fullApiBase;
  }

  async *generateStream(
    messages: Message[],
    tools?: Tool[] | null
  ): AsyncGenerator<LLMStreamChunk> {
    yield* this._client.generateStream(messages, tools);
  }

  async checkConnection(): Promise<ConnectionCheckResult> {
    const result: ConnectionCheckResult = { ok: false };

    if (!this.apiKey || this.apiKey === 'YOUR_API_KEY_HERE') {
      result.error = 'API key is missing or not configured';
      result.details =
        'Set MINI_AGENT_API_KEY or configure apiKey in config.yaml.';
      return result;
    }

    try {
      const msgs: Message[] = [{ role: 'user', content: 'ping' }];
      const generator = this._client.generateStream(msgs, null);
      await generator.next();
      return { ok: true };
    } catch (error) {
      const err = error as Error & { status?: number; code?: string };
      result.statusCode = err.status;

      if (err.status === 401 || err.status === 403) {
        result.error = 'Authentication failed';
        result.details =
          'Check that your API key is valid and has access to the chosen model.';
      } else if (err.status === 404) {
        result.error = 'Model or endpoint not found';
        result.details = `Verify the model name "${this.model}" and API base URL "${this.apiBase}".`;
      } else if (err.status === 429) {
        result.error = 'Rate limit exceeded';
        result.details = 'Too many requests; please wait and try again.';
      } else if (
        err.code === 'ECONNREFUSED' ||
        err.code === 'ENOTFOUND' ||
        err.code === 'ETIMEDOUT' ||
        err.message?.toLowerCase().includes('fetch failed') ||
        err.message?.toLowerCase().includes('network')
      ) {
        result.error = 'Network error';
        result.details = `Unable to reach ${this.apiBase}. Check your network connection and API base URL.`;
      } else {
        result.error = 'API request failed';
        result.details = err.message || String(error);
      }

      return result;
    }
  }
}
