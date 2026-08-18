/**
 * Helper functions for pi-config-sync
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import type { BackupData } from './types';
import { FileError, ErrorCodes, SKIP_SETTINGS_KEYS } from './types';

// ─── Paths ───────────────────────────────────────────────────────────────────

const HOME = homedir();
export const PI_AGENT = join(HOME, '.pi', 'agent');
export const SETTINGS_FILE = join(PI_AGENT, 'settings.json');
export const CONFIG_FILE = join(PI_AGENT, 'config-backup.json');
export const HISTORY_FILE = join(PI_AGENT, 'backup-history.json');

// ─── File Operations ─────────────────────────────────────────────────────────

export async function readJson<T>(path: string): Promise<T> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    if (err instanceof Error && 'code' in err) {
      const nodeErr = err as { code: string };
      if (nodeErr.code === 'ENOENT') {
        throw new FileError(
          `File not found: ${path}`,
          ErrorCodes.FILE_NOT_FOUND,
          err
        );
      }
      if (nodeErr.code === 'EACCES') {
        throw new FileError(
          `Permission denied: ${path}`,
          ErrorCodes.FILE_PERMISSION_ERROR,
          err
        );
      }
    }
    throw new FileError(
      `Failed to read file: ${path}`,
      ErrorCodes.FILE_READ_ERROR,
      err instanceof Error ? err : undefined
    );
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    throw new FileError(
      `Failed to write file: ${path}`,
      ErrorCodes.FILE_WRITE_ERROR,
      err instanceof Error ? err : undefined
    );
  }
}

// ─── Settings Operations ─────────────────────────────────────────────────────

export async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return await readJson<Record<string, unknown>>(SETTINGS_FILE);
  } catch (err) {
    if (err instanceof FileError && err.code === ErrorCodes.FILE_NOT_FOUND) {
      return {};
    }
    throw err;
  }
}

export function extractPackages(settings: Record<string, unknown>): string[] {
  const pkgs = settings.packages;
  if (!Array.isArray(pkgs)) return [];
  return pkgs.map((entry) => {
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object' && entry !== null && 'source' in entry) {
      return (entry as { source: string }).source;
    }
    return String(entry);
  });
}

export function filterSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (SKIP_SETTINGS_KEYS.has(key)) continue;
    result[key] = value;
  }
  return result;
}

// ─── Base64 Operations ───────────────────────────────────────────────────────

export function toBase64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

export function fromBase64(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf-8');
}

// ─── Checksum Operations ─────────────────────────────────────────────────────

export function calculateChecksum(data: BackupData): string {
  const content = JSON.stringify(data.settings) + JSON.stringify(data.packages);
  return createHash('sha256').update(content).digest('hex');
}

// ─── Retry Logic ─────────────────────────────────────────────────────────────

export interface RetryOptions {
  maxRetries?: number;
  timeout?: number;
  retryableErrors?: string[];
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    timeout = 30000,
    retryableErrors = [ErrorCodes.CLOUD_NETWORK_ERROR],
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeout)
        ),
      ]);
      return result;
    } catch (err) {
      const isLastAttempt = attempt === maxRetries;
      const isRetryable =
        err instanceof Error &&
        'code' in err &&
        retryableErrors.includes((err as { code: string }).code);

      if (isLastAttempt || !isRetryable) {
        throw err;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}