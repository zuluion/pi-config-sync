/**
 * WebDAV adapter for pi-config-sync
 */

import type { CloudConfig, WebDAVConfig } from '../types';
import { WebDAVError, ErrorCodes } from '../types';
import { withRetry } from '../helpers';

// ─── WebDAV Operations ───────────────────────────────────────────────────────

export async function webdavRequest(
  config: WebDAVConfig,
  method: string,
  path: string,
  body?: string
): Promise<Response> {
  const base = config.url.replace(/\/+$/, '');
  let remotePath = (config.remotePath || 'Pi-Config-Sync').replace(/^\/+/, '');

  // Build full URL: directory + filename (path param)
  let url: string;
  if (remotePath.includes('.') && !remotePath.includes('/')) {
    // Legacy: remotePath is a bare filename
    url = `${base}/${remotePath}`;
  } else if (path) {
    // remotePath is a directory, path is the filename
    url = `${base}/${remotePath}/${path}`;
  } else if (remotePath.includes('.')) {
    url = `${base}/${remotePath}`;
  } else {
    url = `${base}/${remotePath}/pi-config-backup.json`;
  }

  const headers: Record<string, string> = {
    Authorization:
      'Basic ' +
      Buffer.from(`${config.username}:${config.password}`).toString('base64'),
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
  }

  try {
    const res = await fetch(url, { method, headers, body });

    // 将 HTTP 错误转换为可重试的异常
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new WebDAVError(
          `Authentication failed: ${res.status} ${res.statusText}`,
          ErrorCodes.CLOUD_AUTH_FAILED
        );
      }
      if (res.status === 404) {
        throw new WebDAVError(
          `File not found: ${res.statusText}`,
          ErrorCodes.CLOUD_NOT_FOUND
        );
      }
      // 5xx 和 429 为可重试错误
      throw new WebDAVError(
        `Request failed: ${res.status} ${res.statusText}`,
        ErrorCodes.CLOUD_NETWORK_ERROR
      );
    }

    return res;
  } catch (err) {
    if (err instanceof WebDAVError) throw err;
    throw new WebDAVError(
      `Network error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      ErrorCodes.CLOUD_NETWORK_ERROR,
      err instanceof Error ? err : undefined
    );
  }
}

export async function webdavUpload(
  config: WebDAVConfig,
  data: string,
  filename?: string
): Promise<void> {
  // Ensure remote directory exists (MKCOL)
  let remoteDir = (config.remotePath || 'Pi-Config-Sync').replace(/^\/+/, '');
  // Strip any trailing file extension from dir path
  if (remoteDir.includes('.') && remoteDir.includes('/')) {
    remoteDir = remoteDir.replace(/\/[^/]+$/, '');
  } else if (remoteDir.includes('.') && !remoteDir.includes('/')) {
    remoteDir = '';
  }

  if (remoteDir) {
    const base = config.url.replace(/\/+$/, '');
    const dirUrl = `${base}/${remoteDir}`;
    try {
      await fetch(dirUrl, {
        method: 'MKCOL',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${config.username}:${config.password}`).toString(
              'base64'
            ),
        },
      });
    } catch {
      // directory may already exist
    }
  }

  const targetFile = filename || 'pi-config-backup.json';
  await withRetry(() => webdavRequest(config, 'PUT', targetFile, data));
}

export async function webdavDownload(
  config: WebDAVConfig,
  filePath?: string
): Promise<string> {
  const res = await withRetry(() =>
    webdavRequest(config, 'GET', filePath || '')
  );
  return res.text();
}

// ─── WebDAV Directory Listing ───────────────────────────────────────────────

export interface WebDAVFileInfo {
  name: string;
  path: string;
  lastModified?: string;
  size?: number;
}

export async function webdavList(
  config: WebDAVConfig
): Promise<WebDAVFileInfo[]> {
  const base = config.url.replace(/\/+$/, '');
  let remoteDir = (config.remotePath || 'Pi-Config-Sync').replace(/^\/+/, '');
  // Strip trailing filename if present
  if (remoteDir.includes('.') && remoteDir.includes('/')) {
    remoteDir = remoteDir.replace(/\/[^/]+$/, '');
  } else if (remoteDir.includes('.') && !remoteDir.includes('/')) {
    remoteDir = '';
  }
  const dirUrl = remoteDir ? `${base}/${remoteDir}` : base;

  const headers: Record<string, string> = {
    Authorization:
      'Basic ' +
      Buffer.from(`${config.username}:${config.password}`).toString('base64'),
    Depth: '1',
  };

  const res = await fetch(dirUrl, { method: 'PROPFIND', headers });
  if (!res.ok) {
    throw new WebDAVError(
      `Failed to list directory: ${res.status} ${res.statusText}`,
      ErrorCodes.CLOUD_NETWORK_ERROR
    );
  }

  const xml = await res.text();
  return parsePROPFIND(xml, remoteDir);
}

function parsePROPFIND(xml: string, dirPrefix: string): WebDAVFileInfo[] {
  const results: WebDAVFileInfo[] = [];
  // Match each <d:response> block
  const responseRegex = /<d:response[^>]*>([\s\S]*?)<\/d:response>/gi;
  let match;

  while ((match = responseRegex.exec(xml)) !== null) {
    const block = match[1];

    // Extract href
    const hrefMatch = block.match(/<d:href[^>]*>([\s\S]*?)<\/d:href>/i);
    if (!hrefMatch) continue;
    const href = decodeURIComponent(hrefMatch[1].trim());

    // Extract filename from href
    const hrefClean = href.replace(/\/$/, '');
    const name = hrefClean.split('/').pop() || '';
    if (!name || name === '.' || name === '..') continue;

    // Skip if this is the directory itself
    const hrefDir = hrefClean.replace(/\/[^/]*$/, '').replace(/\/$/, '');
    const expectedDir = dirPrefix ? `/${dirPrefix}` : '';
    if (
      hrefDir === expectedDir ||
      hrefDir === expectedDir.replace(/^\/+/, '')
    ) {
      if (name === dirPrefix.split('/').pop()) continue;
    }

    // Extract last modified
    const lastModMatch = block.match(
      /<d:getlastmodified[^>]*>([\s\S]*?)<\/d:getlastmodified>/i
    );
    const lastModified = lastModMatch?.[1]?.trim();

    // Extract content length
    const sizeMatch = block.match(
      /<d:getcontentlength[^>]*>([\s\S]*?)<\/d:getcontentlength>/i
    );
    const size = sizeMatch?.[1]
      ? parseInt(sizeMatch[1].trim(), 10)
      : undefined;

    // Only include .json files
    if (name.endsWith('.json')) {
      results.push({
        name,
        path: dirPrefix ? `${dirPrefix}/${name}` : name,
        lastModified,
        size,
      });
    }
  }

  // Sort by name descending (newest timestamp first)
  results.sort((a, b) => b.name.localeCompare(a.name));
  return results;
}

// ─── Filename Generation ────────────────────────────────────────────────────

export function generateBackupFilename(deviceName?: string): string {
  const name = deviceName || 'pi-config';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `pi-config-backup_${name}_${y}-${m}-${d}_${hh}-${mm}-${ss}.json`;
}

// ─── Validate WebDAV Config ──────────────────────────────────────────────────

export function validateWebDAVConfig(config: unknown): config is WebDAVConfig {
  if (!config || typeof config !== 'object') return false;
  const cfg = config as Record<string, unknown>;
  return (
    typeof cfg.url === 'string' &&
    typeof cfg.username === 'string' &&
    typeof cfg.password === 'string' &&
    cfg.url.length > 0 &&
    cfg.username.length > 0 &&
    cfg.password.length > 0
  );
}
