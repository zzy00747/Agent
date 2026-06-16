import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Message } from '../schema/index.js';

const HISTORY_VERSION = 1;
const HISTORY_DIR_NAME = '.mini-agent-ts';
const HISTORY_SUBDIR = 'history';

export interface SessionData {
  version: number;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export interface SessionSummary {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

function getHistoryDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, HISTORY_DIR_NAME, HISTORY_SUBDIR);
}

function ensureHistoryDir(): string {
  const dir = getHistoryDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSessionPath(sessionId: string): string {
  const dir = ensureHistoryDir();
  const safeId = path.basename(sessionId);
  return path.join(dir, `${safeId}.json`);
}

export function generateSessionId(): string {
  const now = new Date();
  const iso = now.toISOString();
  // Replace characters that are awkward in file names.
  return iso.replace(/[:.]/g, '-');
}

export function saveSession(
  sessionId: string,
  messages: Message[],
  existingData?: SessionData
): string {
  const filePath = getSessionPath(sessionId);
  const now = new Date().toISOString();

  const data: SessionData = {
    version: HISTORY_VERSION,
    createdAt: existingData?.createdAt ?? now,
    updatedAt: now,
    messages,
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return filePath;
}

export function loadSession(sessionId: string): SessionData | null {
  const filePath = getSessionPath(sessionId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (!isSessionData(parsed)) {
      throw new Error('Invalid session file format');
    }

    return parsed;
  } catch (error) {
    throw new Error(
      `Failed to load session ${sessionId}: ${(error as Error).message}`
    );
  }
}

export function listSessions(): SessionSummary[] {
  const dir = getHistoryDir();
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir);
  const sessions: SessionSummary[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;

    const sessionId = entry.slice(0, -'.json'.length);
    const filePath = path.join(dir, entry);
    try {
      const stat = fs.statSync(filePath);
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      const messageCount = isSessionData(parsed) ? parsed.messages.length : 0;

      sessions.push({
        sessionId,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        messageCount,
      });
    } catch {
      // Skip unreadable session files.
    }
  }

  // Most recent first.
  return sessions.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function isSessionData(value: unknown): value is SessionData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;

  return (
    typeof data['version'] === 'number' &&
    typeof data['createdAt'] === 'string' &&
    typeof data['updatedAt'] === 'string' &&
    Array.isArray(data['messages'])
  );
}
