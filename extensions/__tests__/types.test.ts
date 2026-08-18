import { describe, it, expect } from 'vitest';
import {
  AppError,
  FileError,
  CloudError,
  WebDAVError,
  GistError,
  ValidationError,
  ErrorCodes,
  BACKUP_TARGETS,
  SKIP_SETTINGS_KEYS,
} from '../types';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with message and code', () => {
      const error = new AppError('Test error', ErrorCodes.FILE_NOT_FOUND);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCodes.FILE_NOT_FOUND);
      expect(error.name).toBe('AppError');
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new AppError('Test error', ErrorCodes.FILE_READ_ERROR, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('FileError', () => {
    it('should create file error with correct name', () => {
      const error = new FileError('File not found', ErrorCodes.FILE_NOT_FOUND);
      expect(error.name).toBe('FileError');
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });

    it('should preserve error code', () => {
      const error = new FileError('Permission denied', ErrorCodes.FILE_PERMISSION_ERROR);
      expect(error.code).toBe(ErrorCodes.FILE_PERMISSION_ERROR);
    });
  });

  describe('CloudError', () => {
    it('should create cloud error with correct name', () => {
      const error = new CloudError('Auth failed', ErrorCodes.CLOUD_AUTH_FAILED);
      expect(error.name).toBe('CloudError');
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('WebDAVError', () => {
    it('should create WebDAV error with correct name', () => {
      const error = new WebDAVError('Upload failed', ErrorCodes.CLOUD_NETWORK_ERROR);
      expect(error.name).toBe('WebDAVError');
      expect(error).toBeInstanceOf(CloudError);
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('GistError', () => {
    it('should create Gist error with correct name', () => {
      const error = new GistError('Create failed', ErrorCodes.CLOUD_NOT_FOUND);
      expect(error.name).toBe('GistError');
      expect(error).toBeInstanceOf(CloudError);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with correct name', () => {
      const error = new ValidationError('Invalid URL', ErrorCodes.VALIDATION_INVALID_URL);
      expect(error.name).toBe('ValidationError');
      expect(error).toBeInstanceOf(AppError);
    });
  });
});

describe('Constants', () => {
  describe('BACKUP_TARGETS', () => {
    it('should contain required files', () => {
      expect(BACKUP_TARGETS).toContain('settings.json');
      expect(BACKUP_TARGETS).toContain('keybindings.json');
      expect(BACKUP_TARGETS).toContain('models.json');
      expect(BACKUP_TARGETS).toContain('AGENTS.md');
      expect(BACKUP_TARGETS).toContain('SYSTEM.md');
    });

    it('should contain required directories', () => {
      const dirs = BACKUP_TARGETS.filter(
        (t): t is { dir: string } => typeof t === 'object' && 'dir' in t
      );
      const dirNames = dirs.map((d) => d.dir);
      expect(dirNames).toContain('extensions');
      expect(dirNames).toContain('skills');
      expect(dirNames).toContain('prompts');
      expect(dirNames).toContain('themes');
    });
  });

  describe('SKIP_SETTINGS_KEYS', () => {
    it('should skip analytics-related keys', () => {
      expect(SKIP_SETTINGS_KEYS.has('lastChangelogVersion')).toBe(true);
      expect(SKIP_SETTINGS_KEYS.has('trackingId')).toBe(true);
      expect(SKIP_SETTINGS_KEYS.has('enableAnalytics')).toBe(true);
    });

    it('should not skip other keys', () => {
      expect(SKIP_SETTINGS_KEYS.has('theme')).toBe(false);
      expect(SKIP_SETTINGS_KEYS.has('packages')).toBe(false);
    });
  });

  describe('ErrorCodes', () => {
    it('should have all file error codes', () => {
      expect(ErrorCodes.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
      expect(ErrorCodes.FILE_READ_ERROR).toBe('FILE_READ_ERROR');
      expect(ErrorCodes.FILE_WRITE_ERROR).toBe('FILE_WRITE_ERROR');
      expect(ErrorCodes.FILE_PERMISSION_ERROR).toBe('FILE_PERMISSION_ERROR');
    });

    it('should have all cloud error codes', () => {
      expect(ErrorCodes.CLOUD_AUTH_FAILED).toBe('CLOUD_AUTH_FAILED');
      expect(ErrorCodes.CLOUD_NOT_FOUND).toBe('CLOUD_NOT_FOUND');
      expect(ErrorCodes.CLOUD_NETWORK_ERROR).toBe('CLOUD_NETWORK_ERROR');
      expect(ErrorCodes.CLOUD_RATE_LIMITED).toBe('CLOUD_RATE_LIMITED');
    });

    it('should have all validation error codes', () => {
      expect(ErrorCodes.VALIDATION_INVALID_URL).toBe('VALIDATION_INVALID_URL');
      expect(ErrorCodes.VALIDATION_MISSING_CONFIG).toBe('VALIDATION_MISSING_CONFIG');
      expect(ErrorCodes.VALIDATION_UNSUPPORTED_VERSION).toBe('VALIDATION_UNSUPPORTED_VERSION');
    });
  });
});