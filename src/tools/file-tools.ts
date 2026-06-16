import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import glob from 'fast-glob';
import { truncateTextByTokens } from '../util/truncate.js';
import type { Tool, ToolResult } from './base.js';

type ReadFileInput = {
  path?: string;
  glob?: string;
  offset?: number;
  limit?: number;
  autoChunk?: boolean;
};

const DEFAULT_MAX_READ_TOKENS = 8000;

type WriteFileInput = {
  path: string;
  content: string;
};

type EditFileInput = {
  path: string;
  old_str: string;
  new_str: string;
};

/**
 * Resolve file paths relative to the workspace directory.
 */
function resolvePath(workspaceDir: string, targetPath: string): string {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }
  return path.resolve(workspaceDir, targetPath);
}

export class ReadTool implements Tool<ReadFileInput> {
  public name = 'read_file';
  public description =
    'Read file contents from the filesystem. Output always includes line numbers ' +
    "in format 'LINE_NUMBER|LINE_CONTENT' (1-indexed). Supports reading partial content " +
    'by specifying line offset and limit for large files. ' +
    'Supports glob patterns to read multiple files at once. ' +
    'Large files are automatically chunked when no limit is specified.';
  public parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Absolute or relative path to the file (alternative to glob)',
      },
      glob: {
        type: 'string',
        description:
          'Glob pattern to read multiple files at once, e.g. "src/**/*.ts". Relative to workspace.',
      },
      offset: {
        type: 'integer',
        description:
          'Starting line number (1-indexed). Use for large files to read from specific line',
      },
      limit: {
        type: 'integer',
        description:
          'Number of lines to read. Use with offset for large files to read in chunks',
      },
      autoChunk: {
        type: 'boolean',
        description:
          'When true and no limit is set, large files are automatically truncated to ~8000 tokens. Default: true.',
        default: true,
      },
    },
    anyOf: [{ required: ['path'] }, { required: ['glob'] }],
  };

  constructor(private workspaceDir: string = '.') {}

  /**
   * Read file content with optional line slicing and numbering.
   */
  async execute(params: ReadFileInput): Promise<ToolResult> {
    if (params.glob) {
      return this.readGlob(params.glob, params);
    }

    if (!params.path) {
      return {
        success: false,
        content: '',
        error: 'Either path or glob must be provided.',
      };
    }

    return this.readSingle(params.path, params);
  }

  private async readSingle(
    targetPath: string,
    params: ReadFileInput
  ): Promise<ToolResult> {
    const resolvedPath = resolvePath(this.workspaceDir, targetPath);
    try {
      await fs.access(resolvedPath);
    } catch {
      return {
        success: false,
        content: '',
        error: `File not found: ${targetPath}`,
      };
    }

    try {
      const raw = await fs.readFile(resolvedPath, 'utf8');
      const content = this.processContent(raw, params);
      return { success: true, content };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: (error as Error).message || String(error),
      };
    }
  }

  private async readGlob(
    pattern: string,
    params: ReadFileInput
  ): Promise<ToolResult> {
    const cwd = this.workspaceDir;
    const matches = await glob(pattern, { cwd, onlyFiles: true });

    if (matches.length === 0) {
      return {
        success: false,
        content: '',
        error: `No files matched glob pattern: ${pattern}`,
      };
    }

    const parts: string[] = [];
    for (const relativePath of matches) {
      const resolved = resolvePath(cwd, relativePath);
      try {
        const raw = await fs.readFile(resolved, 'utf8');
        const content = this.processContent(raw, {
          ...params,
          path: relativePath,
        });
        parts.push(`=== file: ${relativePath} ===\n${content}`);
      } catch (error) {
        parts.push(
          `=== file: ${relativePath} ===\n[Error: ${
            (error as Error).message || String(error)
          }]`
        );
      }
    }

    return { success: true, content: parts.join('\n\n') };
  }

  private processContent(raw: string, params: ReadFileInput): string {
    const lines = raw.split('\n');

    const offset =
      typeof params.offset === 'number' && Number.isFinite(params.offset)
        ? Math.floor(params.offset)
        : undefined;
    const limit =
      typeof params.limit === 'number' && Number.isFinite(params.limit)
        ? Math.floor(params.limit)
        : undefined;

    let start = offset ? offset - 1 : 0;
    let end = limit ? start + limit : lines.length;
    if (start < 0) start = 0;
    if (end > lines.length) end = lines.length;

    const selected = lines.slice(start, end);
    const numberedLines = selected.map((line, index) => {
      const lineNumber = String(start + index + 1).padStart(6, ' ');
      return `${lineNumber}|${line}`;
    });

    const enableAutoChunk = params.autoChunk !== false;
    const maxTokens =
      enableAutoChunk && limit === undefined ? DEFAULT_MAX_READ_TOKENS : 32000;

    return truncateTextByTokens(numberedLines.join('\n'), maxTokens);
  }
}

export class WriteTool implements Tool<WriteFileInput> {
  public name = 'write_file';
  public description =
    'Write content to a file. Will overwrite existing files completely. ' +
    'For existing files, you should read the file first using read_file. ' +
    'Prefer editing existing files over creating new ones unless explicitly needed.';
  public parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file',
      },
      content: {
        type: 'string',
        description:
          'Complete content to write (will replace existing content)',
      },
    },
    required: ['path', 'content'],
  };

  constructor(private workspaceDir: string = '.') {}

  /**
   * Write full content to a file, creating parent directories if needed.
   */
  async execute(params: WriteFileInput): Promise<ToolResult> {
    const targetPath = resolvePath(this.workspaceDir, params.path);
    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, params.content ?? '', 'utf8');
      return {
        success: true,
        content: `Successfully wrote to ${targetPath}`,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: (error as Error).message || String(error),
      };
    }
  }
}

export class EditTool implements Tool<EditFileInput> {
  public name = 'edit_file';
  public description =
    'Perform exact string replacement in a file. The old_str must match exactly ' +
    'and appear uniquely in the file, otherwise the operation will fail. ' +
    'You must read the file first before editing. Preserve exact indentation from the source.';
  public parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file',
      },
      old_str: {
        type: 'string',
        description:
          'Exact string to find and replace (must be unique in file)',
      },
      new_str: {
        type: 'string',
        description: 'Replacement string (use for refactoring, renaming, etc.)',
      },
    },
    required: ['path', 'old_str', 'new_str'],
  };

  constructor(private workspaceDir: string = '.') {}

  /**
   * Replace occurrences of old_str with new_str in the target file.
   */
  async execute(params: EditFileInput): Promise<ToolResult> {
    const targetPath = resolvePath(this.workspaceDir, params.path);
    try {
      await fs.access(targetPath);
    } catch {
      return {
        success: false,
        content: '',
        error: `File not found: ${params.path}`,
      };
    }

    try {
      const content = await fs.readFile(targetPath, 'utf8');

      if (!content.includes(params.old_str)) {
        return {
          success: false,
          content: '',
          error: `Text not found in file: ${params.old_str}`,
        };
      }

      const newContent = content.split(params.old_str).join(params.new_str);
      await fs.writeFile(targetPath, newContent, 'utf8');

      return {
        success: true,
        content: `Successfully edited ${targetPath}`,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: (error as Error).message || String(error),
      };
    }
  }
}
