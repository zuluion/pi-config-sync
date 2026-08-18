import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectFiles, restoreFiles } from '../file-collector';
import { PI_AGENT, toBase64 } from '../helpers';

// Mock PI_AGENT to use test directory
vi.mock('../helpers', async () => {
  const actual = await vi.importActual('../helpers');
  return {
    ...actual,
    PI_AGENT: join(tmpdir(), 'pi-test-agent'),
  };
});

describe('File Collector', () => {
  const testAgentDir = join(tmpdir(), 'pi-test-agent');

  beforeEach(() => {
    mkdirSync(testAgentDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testAgentDir, { recursive: true, force: true });
  });

  describe('collectFiles', () => {
    it('should collect existing files', async () => {
      // Create test files
      const settingsFile = join(testAgentDir, 'settings.json');
      writeFileSync(settingsFile, JSON.stringify({ theme: 'dark' }), 'utf-8');

      const files = await collectFiles();
      expect(files['settings.json']).toBeDefined();
      const content = Buffer.from(files['settings.json'], 'base64').toString('utf-8');
      expect(JSON.parse(content)).toEqual({ theme: 'dark' });
    });

    it('should skip missing files', async () => {
      const files = await collectFiles();
      expect(files['settings.json']).toBeUndefined();
      expect(files['keybindings.json']).toBeUndefined();
    });

    it('should collect files from directories', async () => {
      const extensionsDir = join(testAgentDir, 'extensions');
      mkdirSync(extensionsDir, { recursive: true });
      writeFileSync(join(extensionsDir, 'test.ts'), 'export default {}', 'utf-8');

      const files = await collectFiles();
      expect(files['extensions/test.ts']).toBeDefined();
      const content = Buffer.from(files['extensions/test.ts'], 'base64').toString('utf-8');
      expect(content).toBe('export default {}');
    });

    it('should recursively collect directories', async () => {
      const nestedDir = join(testAgentDir, 'skills', 'nested');
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(join(nestedDir, 'skill.md'), '# Skill', 'utf-8');

      const files = await collectFiles();
      expect(files['skills/nested/skill.md']).toBeDefined();
    });
  });

  describe('restoreFiles', () => {
    it('should restore files to correct locations', async () => {
      const files = {
        'settings.json': toBase64(JSON.stringify({ theme: 'dark' })),
        'extensions/test.ts': toBase64('export default {}'),
      };

      const count = await restoreFiles(files);
      expect(count).toBe(2);

      // Verify files were created
      const settingsPath = join(testAgentDir, 'settings.json');
      expect(existsSync(settingsPath)).toBe(true);
      const content = readFileSync(settingsPath, 'utf-8');
      expect(JSON.parse(content)).toEqual({ theme: 'dark' });

      const extPath = join(testAgentDir, 'extensions', 'test.ts');
      expect(existsSync(extPath)).toBe(true);
      expect(readFileSync(extPath, 'utf-8')).toBe('export default {}');
    });

    it('should return count of restored files', async () => {
      const files = {
        'file1.txt': toBase64('content1'),
        'file2.txt': toBase64('content2'),
        'file3.txt': toBase64('content3'),
      };

      const count = await restoreFiles(files);
      expect(count).toBe(3);
    });

    it('should handle empty files object', async () => {
      const count = await restoreFiles({});
      expect(count).toBe(0);
    });
  });
});