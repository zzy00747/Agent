import { Logger } from '../../util/logger.js';
import {
  type Tool,
  type ToolInput,
  type ToolResult,
  type JsonSchema,
} from '../base.js';
import { type Closable, type ConnectionType, type McpClient } from './types.js';
import {
  getMcpTimeoutConfig,
  loadClientConstructor,
  loadSseTransportConstructor,
  loadStdioTransportConstructor,
  loadStreamableHttpTransportConstructor,
  normalizeContent,
  normalizeToolDescription,
  normalizeToolSchema,
  toSecondsLabel,
  withTimeout,
} from './utils.js';

export class MCPTool implements Tool {
  public name: string;
  public description: string;
  public parameters: JsonSchema;

  private session: McpClient;
  private connection: MCPServerConnection;
  private executeTimeoutSec: number;

  constructor(options: {
    name: string;
    description: string;
    parameters: JsonSchema;
    session: McpClient;
    connection: MCPServerConnection;
    executeTimeoutSec: number;
  }) {
    this.name = options.name;
    this.description = options.description;
    this.parameters = options.parameters;
    this.session = options.session;
    this.connection = options.connection;
    this.executeTimeoutSec = options.executeTimeoutSec;
  }

  async execute(params: ToolInput): Promise<ToolResult> {
    const timeoutMs = this.executeTimeoutSec * 1000;

    // [Debug] Log Request
    Logger.debug('MCP DEBUG', `Calling '${this.name}' with args:`, params);

    const run = async (): Promise<ToolResult> => {
      try {
        const result = await withTimeout(
          this.session.callTool({
            name: this.name,
            arguments: params,
          }),
          timeoutMs,
          `MCP tool execution timed out after ${toSecondsLabel(
            this.executeTimeoutSec
          )}. The remote server may be slow or unresponsive.`
        );

        // [Debug] Log Response
        Logger.debug('MCP DEBUG', `Result from '${this.name}':`, result);

        const content = normalizeContent(result.content);
        const isError = Boolean(result.isError ?? result.is_error ?? false);

        return {
          success: !isError,
          content,
          error: isError ? 'Tool returned error' : null,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const timedOut = message.includes('timed out');
        const isConnectionError =
          !timedOut && isConnectionFailureError(message);
        return {
          success: false,
          content: '',
          error: timedOut ? message : `MCP tool execution failed: ${message}`,
          retriable: isConnectionError,
        };
      }
    };

    // Ensure the underlying connection is alive before calling.
    if (!this.connection.isConnected()) {
      const reconnected = await this.connection.reconnect();
      if (!reconnected) {
        return {
          success: false,
          content: '',
          error: `MCP server '${this.connection.name}' is disconnected and could not be reconnected.`,
          retriable: true,
        };
      }
    }

    const result = await run();

    // If the call failed due to a connection error, try reconnecting once.
    if (!result.success && result.retriable) {
      const reconnected = await this.connection.reconnect();
      if (reconnected) {
        return run();
      }
    }

    return result;
  }
}

function isConnectionFailureError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('connection') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('socket') ||
    lower.includes('disconnect') ||
    lower.includes('closed')
  );
}

export class MCPServerConnection {
  public name: string;
  public connectionType: ConnectionType;
  public command?: string;
  public args: string[];
  public cwd?: string;
  public env: Record<string, string>;
  public url?: string;
  public headers: Record<string, string>;
  public connectTimeoutSec?: number;
  public executeTimeoutSec?: number;
  public sseReadTimeoutSec?: number;
  public heartbeatIntervalSec: number;
  public maxReconnectAttempts: number;
  public reconnectDelayMs: number;

  public tools: MCPTool[] = [];

  private session: McpClient | null = null;
  private transport: Closable | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isReconnecting = false;
  private disconnected = false;

  constructor(options: {
    name: string;
    connectionType: ConnectionType;
    command?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    connectTimeoutSec?: number;
    executeTimeoutSec?: number;
    sseReadTimeoutSec?: number;
    heartbeatIntervalSec?: number;
    maxReconnectAttempts?: number;
    reconnectDelayMs?: number;
  }) {
    this.name = options.name;
    this.connectionType = options.connectionType;
    this.command = options.command;
    this.args = options.args ?? [];
    this.cwd = options.cwd;
    this.env = options.env ?? {};
    this.url = options.url;
    this.headers = options.headers ?? {};
    this.connectTimeoutSec = options.connectTimeoutSec;
    this.executeTimeoutSec = options.executeTimeoutSec;
    this.sseReadTimeoutSec = options.sseReadTimeoutSec;
    this.heartbeatIntervalSec = options.heartbeatIntervalSec ?? 30.0;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 3;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1000;
  }

  private getConnectTimeoutSec(): number {
    return this.connectTimeoutSec ?? getMcpTimeoutConfig().connectTimeout;
  }

  private getExecuteTimeoutSec(): number {
    return this.executeTimeoutSec ?? getMcpTimeoutConfig().executeTimeout;
  }

  private getSseReadTimeoutSec(): number {
    return this.sseReadTimeoutSec ?? getMcpTimeoutConfig().sseReadTimeout;
  }

  isConnected(): boolean {
    return (
      !this.disconnected && this.session !== null && this.transport !== null
    );
  }

  private async createTransport(): Promise<Closable> {
    if (this.connectionType === 'stdio') {
      if (!this.command) {
        throw new Error('Missing command for stdio transport');
      }
      const transportCtor = await loadStdioTransportConstructor();
      return new transportCtor({
        command: this.command,
        args: this.args,
        cwd: this.cwd,
        env: Object.keys(this.env).length > 0 ? this.env : undefined,
      });
    }

    if (!this.url) {
      throw new Error('Missing url for remote transport');
    }

    if (this.connectionType === 'sse') {
      const sseCtor = await loadSseTransportConstructor();
      return new sseCtor({
        url: this.url,
        headers:
          Object.keys(this.headers).length > 0 ? this.headers : undefined,
        sseReadTimeout: this.getSseReadTimeoutSec() * 1000,
      });
    }

    const httpCtor = await loadStreamableHttpTransportConstructor();
    return new httpCtor({
      url: this.url,
      headers: Object.keys(this.headers).length > 0 ? this.headers : undefined,
    });
  }

  async connect(): Promise<boolean> {
    this.disconnected = false;
    this.isReconnecting = false;
    const connectTimeoutMs = this.getConnectTimeoutSec() * 1000;

    try {
      const transport = await this.createTransport();
      const ClientCtor = await loadClientConstructor();
      const client = new ClientCtor({
        name: 'mini-agent-ts',
        version: '1.0.0',
      }) as unknown as McpClient;

      const toolsList = await withTimeout(
        (async () => {
          await client.connect(transport);
          return await client.listTools();
        })(),
        connectTimeoutMs,
        `Connection to MCP server '${
          this.name
        }' timed out after ${toSecondsLabel(this.getConnectTimeoutSec())}.`
      );

      this.session = client;
      this.transport = transport;
      this.tools = [];

      const executeTimeout = this.getExecuteTimeoutSec();
      for (const tool of toolsList.tools ?? []) {
        const rawParameters = tool.inputSchema ?? tool.input_schema ?? {};
        const normalizedParameters = normalizeToolSchema(rawParameters);
        const normalizedDescription = normalizeToolDescription(
          tool.description ?? ''
        );

        this.tools.push(
          new MCPTool({
            name: tool.name,
            description: normalizedDescription,
            parameters: normalizedParameters,
            session: client,
            connection: this,
            executeTimeoutSec: executeTimeout,
          })
        );
      }

      this.startHeartbeat();

      const connectedMsg = `✅ Connected to MCP server '${this.name}' (${this.connectionType}) - loaded ${this.tools.length} tools`;
      console.log(connectedMsg);
      Logger.log('startup', connectedMsg);

      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const msg = `✗ Failed to connect to MCP server '${this.name}': ${message}`;
      console.log(msg);
      Logger.log('startup', msg);
      await this.disconnect();
      return false;
    }
  }

  async reconnect(): Promise<boolean> {
    if (this.isReconnecting) {
      return this.isConnected();
    }

    this.isReconnecting = true;
    try {
      await this.disconnect();

      for (let attempt = 1; attempt <= this.maxReconnectAttempts; attempt++) {
        const connectedMsg = `🔄 Reconnecting to MCP server '${this.name}' (attempt ${attempt}/${this.maxReconnectAttempts})...`;
        Logger.log('MCP', connectedMsg);

        const success = await this.connect();
        if (success) {
          return true;
        }

        if (attempt < this.maxReconnectAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.reconnectDelayMs)
          );
        }
      }

      return false;
    } finally {
      this.isReconnecting = false;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    if (
      this.heartbeatIntervalSec <= 0 ||
      !this.session ||
      typeof this.session.ping !== 'function'
    ) {
      return;
    }

    const intervalMs = this.heartbeatIntervalSec * 1000;
    this.heartbeatTimer = setInterval(() => {
      if (!this.session || this.disconnected) {
        this.stopHeartbeat();
        return;
      }

      void (async () => {
        try {
          if (typeof this.session?.ping === 'function') {
            await this.session.ping();
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          Logger.log(
            'MCP',
            `Heartbeat failed for '${this.name}': ${message}. Triggering reconnect.`
          );
          this.stopHeartbeat();
          await this.reconnect();
        }
      })();
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async disconnect(): Promise<void> {
    this.disconnected = true;
    this.stopHeartbeat();

    const session = this.session;
    const transport = this.transport;
    this.session = null;
    this.transport = null;
    this.tools = [];

    if (session?.close) {
      try {
        await session.close();
      } catch (error: unknown) {
        Logger.log(
          'MCP',
          `Error closing MCP session '${this.name}':`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
    if (transport?.close) {
      try {
        await transport.close();
      } catch (error: unknown) {
        Logger.log(
          'MCP',
          `Error closing MCP transport '${this.name}':`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }
}
