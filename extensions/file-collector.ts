/**
 * File collection and restoration for pi-config-sync
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PI_AGENT, toBase64, fromBase64 } from './helpers';
import { BACKUP_TARGETS } from './types';
import { FileError, ErrorCodes } from './types';

// ─── File Collection ─────────────────────────────────────────────────────────

export async function collectFiles(): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  // Process targets in parallel
  const promises = BACKUP_TARGETS.map(async (target) => {
    if (typeof target === 'string') {
      // Single file
      const fullPath = join(PI_AGENT, target);
      try {
        const content = await readFile(fullPath); // 不指定编码，返回 Buffer
        files[target] = toBase64(content);
      } catch {
        // skip missing files
      }
    } else if (target.dir) {
      // Directory — recursively collect
      const dirPath = join(PI_AGENT, target.dir);
      try {
        await collectDir(dirPath, target.dir, files);
      } catch {
        // skip missing dirs
      }
    }
  });

  await Promise.all(promises);
  return files;
}

async function collectDir(
  absDir: string,
  relPrefix: string,
  files: Record<string, string>
): Promise<void> {
  const entries = await readdir(absDir, { withFileTypes: true });
  
  // Process entries in parallel
  const promises = entries.map(async (entry) => {
    const absPath = join(absDir, entry.name);
    const relPath = `${relPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectDir(absPath, relPath, files);
    } else if (entry.isFile()) {
      try {
        const content = await readFile(absPath); // 不指定编码，返回 Buffer
        files[relPath] = toBase64(content);
      } catch {
        // skip unreadable
      }
    }
  });

  await Promise.all(promises);
}

// ─── File Restoration ────────────────────────────────────────────────────────

export async function restoreFiles(
  files: Record<string, string>,
  excludePaths: string[] = []
): Promise<number> {
  let count = 0;
  
  // Process files in parallel
  const promises = Object.entries(files).map(async ([relPath, b64Content]) => {
    // 跳过排除的文件
    if (excludePaths.includes(relPath)) {
      return;
    }
    
    const absPath = join(PI_AGENT, relPath);
    const normalizedPath = resolve(absPath);
    const normalizedBase = resolve(PI_AGENT);
    
    // 校验路径是否逃逸出 PI_AGENT 目录
    if (!normalizedPath.startsWith(normalizedBase) || 
        (normalizedPath.length > normalizedBase.length && 
         normalizedPath[normalizedBase.length] !== '/' && 
         normalizedPath[normalizedBase.length] !== '\\')) {
      throw new FileError(
        `Invalid path traversal detected: ${relPath}`,
        ErrorCodes.FILE_PERMISSION_ERROR
      );
    }
    
    try {
      await mkdir(join(absPath, '..'), { recursive: true });
      await writeFile(absPath, fromBase64(b64Content)); // Buffer 直接写入，不指定编码
      count++;
    } catch (err) {
      throw new FileError(
        `Failed to restore file: ${relPath}`,
        ErrorCodes.FILE_WRITE_ERROR,
        err instanceof Error ? err : undefined
      );
    }
  });

  await Promise.all(promises);
  return count;
}