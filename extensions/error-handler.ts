/**
 * Error handling utilities for pi-config-sync
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { AppError, FileError, CloudError, ValidationError, ErrorCodes } from './types';

// ─── Error Message Templates ─────────────────────────────────────────────────

export const ErrorMessages = {
  // File errors
  [ErrorCodes.FILE_NOT_FOUND]: (path: string) =>
    `File not found: ${path}. Please check if the file exists.`,
  [ErrorCodes.FILE_READ_ERROR]: (path: string) =>
    `Failed to read file: ${path}. Please check file permissions.`,
  [ErrorCodes.FILE_WRITE_ERROR]: (path: string) =>
    `Failed to write file: ${path}. Please check disk space and permissions.`,
  [ErrorCodes.FILE_PERMISSION_ERROR]: (path: string) =>
    `Permission denied: ${path}. Please check file permissions.`,

  // Cloud errors
  [ErrorCodes.CLOUD_AUTH_FAILED]: (provider: string) =>
    `Authentication failed with ${provider}. Please check your credentials.`,
  [ErrorCodes.CLOUD_NOT_FOUND]: (resource: string) =>
    `Resource not found: ${resource}. Please check the configuration.`,
  [ErrorCodes.CLOUD_NETWORK_ERROR]: (operation: string) =>
    `Network error during ${operation}. Please check your internet connection.`,
  [ErrorCodes.CLOUD_RATE_LIMITED]: (provider: string) =>
    `Rate limited by ${provider}. Please wait a few minutes and try again.`,

  // Validation errors
  [ErrorCodes.VALIDATION_INVALID_URL]: (url: string) =>
    `Invalid URL: ${url}. Please provide a valid URL.`,
  [ErrorCodes.VALIDATION_MISSING_CONFIG]: (config: string) =>
    `Missing configuration: ${config}. Please run /config-cloud-setup first.`,
  [ErrorCodes.VALIDATION_UNSUPPORTED_VERSION]: (version: number) =>
    `Unsupported backup version: ${version}. Please use a compatible backup file.`,
} as const;

// ─── Error Handler ───────────────────────────────────────────────────────────

export function handleCommandError(
  ctx: { ui: ExtensionAPI['ui'] },
  error: unknown,
  context?: string
): void {
  if (error instanceof AppError) {
    const message = getErrorMessage(error);
    ctx.ui.notify(message, 'error');
  } else if (error instanceof Error) {
    ctx.ui.notify(
      `Unexpected error${context ? ` during ${context}` : ''}: ${error.message}`,
      'error'
    );
  } else {
    ctx.ui.notify(
      `Unexpected error${context ? ` during ${context}` : ''}: ${String(error)}`,
      'error'
    );
  }
}

function getErrorMessage(error: AppError): string {
  // 直接使用错误消息，不再尝试提取
  return error.message;
}

// ─── User-Friendly Error Suggestions ─────────────────────────────────────────

export function getErrorSuggestion(error: AppError): string | null {
  switch (error.code) {
    case ErrorCodes.FILE_NOT_FOUND:
      return 'Try running /export-config to create a backup first.';
    case ErrorCodes.FILE_PERMISSION_ERROR:
      return 'Check file permissions and try again.';
    case ErrorCodes.CLOUD_AUTH_FAILED:
      return 'Run /config-cloud-setup to reconfigure credentials.';
    case ErrorCodes.CLOUD_NOT_FOUND:
      return 'Check if the resource exists and try again.';
    case ErrorCodes.CLOUD_NETWORK_ERROR:
      return 'Check your internet connection and try again.';
    case ErrorCodes.VALIDATION_MISSING_CONFIG:
      return 'Run /config-cloud-setup to configure cloud backup.';
    case ErrorCodes.VALIDATION_UNSUPPORTED_VERSION:
      return 'Use a backup file from a compatible version.';
    default:
      return null;
  }
}