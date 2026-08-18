/**
 * GitHub Gist adapter for pi-config-sync
 */

import type { GistConfig } from '../types';
import { GistError, ErrorCodes } from '../types';
import { withRetry } from '../helpers';

// ─── Gist Operations ─────────────────────────────────────────────────────────

export async function gistHeaders(
  token: string
): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json; charset=utf-8',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function gistUpload(
  config: GistConfig,
  data: string
): Promise<string> {
  const headers = await gistHeaders(config.token);
  const filename = config.filename || 'pi-config-backup.json';

  if (config.gistId) {
    // Update existing gist
    const res = await withRetry(
      () =>
        fetch(`https://api.github.com/gists/${config.gistId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            description: `Pi config backup — ${new Date().toISOString()}`,
            files: { [filename]: { content: data } },
          }),
        }),
      { retryableErrors: [ErrorCodes.CLOUD_NETWORK_ERROR] }
    );

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new GistError(
          `Authentication failed: ${res.status}`,
          ErrorCodes.CLOUD_AUTH_FAILED
        );
      }
      if (res.status === 404) {
        throw new GistError(
          `Gist not found: ${config.gistId}`,
          ErrorCodes.CLOUD_NOT_FOUND
        );
      }
      throw new GistError(
        `Gist update failed: ${res.status}`,
        ErrorCodes.CLOUD_NETWORK_ERROR
      );
    }
    return config.gistId;
  }

  // Create new gist
  const res = await withRetry(
    () =>
      fetch('https://api.github.com/gists', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          description: 'Pi coding agent config backup',
          public: false,
          files: { [filename]: { content: data } },
        }),
      }),
    { retryableErrors: [ErrorCodes.CLOUD_NETWORK_ERROR] }
  );

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new GistError(
        `Authentication failed: ${res.status}`,
        ErrorCodes.CLOUD_AUTH_FAILED
      );
    }
    throw new GistError(
      `Gist create failed: ${res.status}`,
      ErrorCodes.CLOUD_NETWORK_ERROR
    );
  }

  const result = (await res.json()) as { id: string };
  return result.id;
}

export async function gistDownload(config: GistConfig): Promise<string> {
  const headers = await gistHeaders(config.token);

  const res = await withRetry(
    () =>
      fetch(`https://api.github.com/gists/${config.gistId}`, { headers }),
    { retryableErrors: [ErrorCodes.CLOUD_NETWORK_ERROR] }
  );

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new GistError(
        `Authentication failed: ${res.status}`,
        ErrorCodes.CLOUD_AUTH_FAILED
      );
    }
    if (res.status === 404) {
      throw new GistError(
        `Gist not found: ${config.gistId}`,
        ErrorCodes.CLOUD_NOT_FOUND
      );
    }
    throw new GistError(
      `Gist fetch failed: ${res.status}`,
      ErrorCodes.CLOUD_NETWORK_ERROR
    );
  }

  const result = (await res.json()) as {
    files: Record<string, { content: string }>;
  };
  const filename = config.filename || 'pi-config-backup.json';
  const file = result.files[filename];
  if (!file) {
    throw new GistError(
      `File "${filename}" not found in gist`,
      ErrorCodes.CLOUD_NOT_FOUND
    );
  }
  return file.content;
}

// ─── Validate Gist Config ────────────────────────────────────────────────────

export function validateGistConfig(config: unknown): config is GistConfig {
  if (!config || typeof config !== 'object') return false;
  const cfg = config as Record<string, unknown>;
  return (
    typeof cfg.token === 'string' &&
    cfg.token.length > 0 &&
    (cfg.gistId === undefined || typeof cfg.gistId === 'string')
  );
}