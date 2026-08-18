/**
 * Type definitions and error classes for pi-config-sync
 */

// ─── Backup Data Types ───────────────────────────────────────────────────────

export interface BackupData {
  version: 1;
  exportedAt: string;
  settings: Record<string, unknown>;
  packages: string[];
  files: Record<string, string>; // base64 encoded
}

// ─── Cloud Config Types ──────────────────────────────────────────────────────

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  remotePath?: string;
}

export interface GistConfig {
  token: string;
  gistId?: string;
  filename?: string;
}

export interface CloudConfig {
  provider: 'webdav' | 'gist';
  webdav?: WebDAVConfig;
  gist?: GistConfig;
}

// ─── Backup History Types ────────────────────────────────────────────────────

export interface BackupHistoryRecord {
  id: string;
  timestamp: string;
  source: 'local' | 'webdav' | 'gist';
  status: 'success' | 'failed';
  fileCount: number;
  packageCount: number;
  checksum?: string;
  duration?: number;
  error?: string;
}

export interface BackupHistory {
  records: BackupHistoryRecord[];
  lastUpdated: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const BACKUP_TARGETS = [
  'settings.json',
  'keybindings.json',
  'models.json',
  'AGENTS.md',
  'SYSTEM.md',
  { dir: 'extensions' },
  { dir: 'skills' },
  { dir: 'prompts' },
  { dir: 'themes' },
] as const;

export const SKIP_SETTINGS_KEYS = new Set([
  'lastChangelogVersion',
  'trackingId',
  'enableAnalytics',
]);

export const ErrorCodes = {
  // File errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  FILE_PERMISSION_ERROR: 'FILE_PERMISSION_ERROR',

  // Cloud errors
  CLOUD_AUTH_FAILED: 'CLOUD_AUTH_FAILED',
  CLOUD_NOT_FOUND: 'CLOUD_NOT_FOUND',
  CLOUD_NETWORK_ERROR: 'CLOUD_NETWORK_ERROR',
  CLOUD_RATE_LIMITED: 'CLOUD_RATE_LIMITED',

  // Validation errors
  VALIDATION_INVALID_URL: 'VALIDATION_INVALID_URL',
  VALIDATION_MISSING_CONFIG: 'VALIDATION_MISSING_CONFIG',
  VALIDATION_UNSUPPORTED_VERSION: 'VALIDATION_UNSUPPORTED_VERSION',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ─── Error Classes ───────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    cause?: Error
  ) {
    super(message);
    this.name = 'AppError';
    if (cause) {
      this.cause = cause;
    }
  }
}

export class FileError extends AppError {
  constructor(message: string, code: ErrorCode, cause?: Error) {
    super(message, code, cause);
    this.name = 'FileError';
  }
}

export class CloudError extends AppError {
  constructor(message: string, code: ErrorCode, cause?: Error) {
    super(message, code, cause);
    this.name = 'CloudError';
  }
}

export class WebDAVError extends CloudError {
  constructor(message: string, code: ErrorCode, cause?: Error) {
    super(message, code, cause);
    this.name = 'WebDAVError';
  }
}

export class GistError extends CloudError {
  constructor(message: string, code: ErrorCode, cause?: Error) {
    super(message, code, cause);
    this.name = 'GistError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code: ErrorCode, cause?: Error) {
    super(message, code, cause);
    this.name = 'ValidationError';
  }
}