/**
 * Config Migration & Cloud Backup Extension
 *
 * Commands:
 *   /export-config [file]       — Export to local JSON (settings + packages + custom files)
 *   /import-config <file>       — Restore from local JSON
 *   /import-config webdav       — Restore from WebDAV
 *   /import-config gist         — Restore from GitHub Gist
 *   /import-config              — Restore from configured cloud provider
 *   /config-backup              — Backup to cloud (WebDAV or Gist)
 *   /config-cloud-setup         — Configure WebDAV or Gist credentials
 *   /config-cloud-status        — Show current cloud config
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { homedir } from "node:os";

// ─── Paths ───────────────────────────────────────────────────────────────────

const HOME = homedir();
const PI_AGENT = join(HOME, ".pi", "agent");
const SETTINGS_FILE = join(PI_AGENT, "settings.json");
const CONFIG_FILE = join(PI_AGENT, "config-backup.json");

// Files and directories to include in backup
const BACKUP_TARGETS = [
  "settings.json",
  "keybindings.json",
  "models.json",
  "AGENTS.md",
  "SYSTEM.md",
  { dir: "extensions" },
  { dir: "skills" },
  { dir: "prompts" },
  { dir: "themes" },
];

const SKIP_SETTINGS_KEYS = new Set([
  "lastChangelogVersion",
  "trackingId",
  "enableAnalytics",
]);

// ─── Types ───────────────────────────────────────────────────────────────────

interface CloudConfig {
  provider: "webdav" | "gist";
  webdav?: {
    url: string;
    username: string;
    password: string;
    remotePath?: string;
  };
  gist?: {
    token: string;
    gistId?: string;
    filename?: string;
  };
}

interface BackupData {
  version: 1;
  exportedAt: string;
  settings: Record<string, unknown>;
  packages: string[];
  files: Record<string, string>; // base64 encoded
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}

async function readSettings(): Promise<Record<string, unknown>> {
  return (await readJson<Record<string, unknown>>(SETTINGS_FILE)) ?? {};
}

function extractPackages(settings: Record<string, unknown>): string[] {
  const pkgs = settings.packages;
  if (!Array.isArray(pkgs)) return [];
  return pkgs.map((entry) => {
    if (typeof entry === "string") return entry;
    if (typeof entry === "object" && entry !== null && "source" in entry)
      return (entry as { source: string }).source;
    return String(entry);
  });
}

function filterSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (SKIP_SETTINGS_KEYS.has(key)) continue;
    result[key] = value;
  }
  return result;
}

function toBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

function fromBase64(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf-8");
}

async function collectFiles(): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  for (const target of BACKUP_TARGETS) {
    if (typeof target === "string") {
      // Single file
      const fullPath = join(PI_AGENT, target);
      try {
        const content = await readFile(fullPath, "utf-8");
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
  }

  return files;
}

async function collectDir(
  absDir: string,
  relPrefix: string,
  files: Record<string, string>,
): Promise<void> {
  const entries = await readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = join(absDir, entry.name);
    const relPath = `${relPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectDir(absPath, relPath, files);
    } else if (entry.isFile()) {
      try {
        const content = await readFile(absPath, "utf-8");
        files[relPath] = toBase64(content);
      } catch {
        // skip unreadable
      }
    }
  }
}

async function restoreFiles(files: Record<string, string>): Promise<number> {
  let count = 0;
  for (const [relPath, b64Content] of Object.entries(files)) {
    const absPath = join(PI_AGENT, relPath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, fromBase64(b64Content), "utf-8");
    count++;
  }
  return count;
}

// ─── Cloud: WebDAV ───────────────────────────────────────────────────────────

async function webdavRequest(
  config: NonNullable<CloudConfig["webdav"]>,
  method: string,
  path: string,
  body?: string,
): Promise<Response> {
  const base = config.url.replace(/\/+$/, "");
  const remotePath = (config.remotePath || "/pi-config-backup.json").replace(/^\/+/, "");
  const url = `${base}/${remotePath}${path ? `/${path}` : ""}`;

  const headers: Record<string, string> = {
    Authorization: "Basic " + Buffer.from(`${config.username}:${config.password}`).toString("base64"),
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json; charset=utf-8";
  }

  return fetch(url, { method, headers, body });
}

async function webdavUpload(
  config: NonNullable<CloudConfig["webdav"]>,
  data: string,
): Promise<void> {
  // Ensure remote directory exists (MKCOL)
  const remoteDir = (config.remotePath || "/pi-config-backup.json")
    .replace(/\/[^/]+$/, "")
    .replace(/^\/+/, "");
  if (remoteDir) {
    const base = config.url.replace(/\/+$/, "");
    const dirUrl = `${base}/${remoteDir}`;
    try {
      await fetch(dirUrl, {
        method: "MKCOL",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${config.username}:${config.password}`).toString("base64"),
        },
      });
    } catch {
      // directory may already exist
    }
  }

  const res = await webdavRequest(config, "PUT", "", data);
  if (!res.ok) {
    throw new Error(`WebDAV upload failed: ${res.status} ${res.statusText}`);
  }
}

async function webdavDownload(
  config: NonNullable<CloudConfig["webdav"]>,
): Promise<string> {
  const res = await webdavRequest(config, "GET", "");
  if (!res.ok) {
    throw new Error(`WebDAV download failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

// ─── Cloud: GitHub Gist ──────────────────────────────────────────────────────

async function gistHeaders(token: string): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json; charset=utf-8",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function gistUpload(config: NonNullable<CloudConfig["gist"]>, data: string): Promise<string> {
  const headers = await gistHeaders(config.token);
  const filename = config.filename || "pi-config-backup.json";

  if (config.gistId) {
    // Update existing gist
    const res = await fetch(`https://api.github.com/gists/${config.gistId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        description: `Pi config backup — ${new Date().toISOString()}`,
        files: { [filename]: { content: data } },
      }),
    });
    if (!res.ok) {
      throw new Error(`Gist update failed: ${res.status}`);
    }
    return config.gistId;
  }

  // Create new gist
  const res = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers,
    body: JSON.stringify({
      description: "Pi coding agent config backup",
      public: false,
      files: { [filename]: { content: data } },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gist create failed: ${res.status}`);
  }
  const result = (await res.json()) as { id: string };
  return result.id;
}

async function gistDownload(config: NonNullable<CloudConfig["gist"]>): Promise<string> {
  const headers = await gistHeaders(config.token);
  const res = await fetch(`https://api.github.com/gists/${config.gistId}`, { headers });
  if (!res.ok) {
    throw new Error(`Gist fetch failed: ${res.status}`);
  }
  const result = (await res.json()) as {
    files: Record<string, { content: string }>;
  };
  const filename = config.filename || "pi-config-backup.json";
  const file = result.files[filename];
  if (!file) {
    throw new Error(`File "${filename}" not found in gist`);
  }
  return file.content;
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ─── /export-config ────────────────────────────────────────────────
  pi.registerCommand("export-config", {
    description: "Export settings + packages + custom files to local JSON",
    handler: async (args, ctx) => {
      const settings = await readSettings();
      const packages = extractPackages(settings);
      const files = await collectFiles();

      const data: BackupData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: filterSettings(settings),
        packages,
        files,
      };

      const outputPath = args?.trim() || join(HOME, "pi-config-backup.json");
      await writeJson(outputPath, data);

      const fileCount = Object.keys(files).length;
      ctx.ui.notify(
        [
          `✓ Exported to: ${outputPath}`,
          ``,
          `Packages: ${packages.length}`,
          `Custom files: ${fileCount}`,
          ...Object.keys(files).map((f) => `  • ${f}`),
          ``,
          `On new device: /import-config ${outputPath}`,
        ].join("\n"),
        "info",
      );
    },
  });

  // ─── /import-config ────────────────────────────────────────────────
  pi.registerCommand("import-config", {
    description: "Restore from local file or cloud (webdav/gist)",
    handler: async (args, ctx) => {
      const source = args?.trim();
      let data: BackupData | null = null;
      let sourceLabel = "";

      // Determine source
      if (!source || source === "webdav" || source === "gist") {
        // Cloud source
        const cfg = await readJson<CloudConfig>(CONFIG_FILE);
        const provider = source as "webdav" | "gist" | undefined;

        if (!cfg?.provider && !provider) {
          ctx.ui.notify(
            "Usage: /import-config <file>\nor: /import-config webdav\nor: /import-config gist",
            "error",
          );
          return;
        }

        const useProvider = provider || cfg!.provider;
        if (useProvider === "webdav" && cfg?.webdav) {
          sourceLabel = "WebDAV";
          ctx.ui.setStatus("import", "Downloading from WebDAV...");
          try {
            const json = await webdavDownload(cfg.webdav);
            data = JSON.parse(json);
          } catch (err: unknown) {
            ctx.ui.notify(`WebDAV download failed: ${err instanceof Error ? err.message : err}`, "error");
            return;
          } finally {
            ctx.ui.setStatus("import", undefined);
          }
        } else if (useProvider === "gist" && cfg?.gist) {
          sourceLabel = "GitHub Gist";
          ctx.ui.setStatus("import", "Downloading from Gist...");
          try {
            const json = await gistDownload(cfg.gist);
            data = JSON.parse(json);
          } catch (err: unknown) {
            ctx.ui.notify(`Gist download failed: ${err instanceof Error ? err.message : err}`, "error");
            return;
          } finally {
            ctx.ui.setStatus("import", undefined);
          }
        } else {
          ctx.ui.notify(`No ${useProvider} configuration found. Run /config-cloud-setup first.`, "error");
          return;
        }
      } else {
        // Local file
        sourceLabel = source;
        try {
          data = JSON.parse(await readFile(source, "utf-8"));
        } catch (err: unknown) {
          ctx.ui.notify(`Read failed: ${err instanceof Error ? err.message : err}`, "error");
          return;
        }
      }

      if (!data || data.version !== 1) {
        ctx.ui.notify(`Unsupported version: ${data?.version}`, "error");
        return;
      }

      const fileCount = Object.keys(data.files ?? {}).length;
      const confirmed = await ctx.ui.confirm(
        "Import Config",
        `Restore ${data.packages.length} package(s) and ${fileCount} file(s)\nfrom ${sourceLabel} (${data.exportedAt})?`,
      );
      if (!confirmed) return;

      // Merge settings
      const current = await readSettings();
      const merged = { ...data.settings };
      for (const [key, value] of Object.entries(current)) {
        if (!(key in merged)) merged[key] = value;
      }
      await writeJson(SETTINGS_FILE, merged);
      ctx.ui.notify("Settings merged.", "info");

      // Restore files
      if (data.files && Object.keys(data.files).length > 0) {
        const count = await restoreFiles(data.files);
        ctx.ui.notify(`Restored ${count} file(s).`, "info");
      }

      // Install packages
      let installed = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const pkg of data.packages) {
        try {
          ctx.ui.setStatus("import", `Installing ${pkg}...`);
          const result = await pi.exec("pi", ["install", pkg], { timeout: 120_000 });
          if (result.code === 0) installed++;
          else {
            failed++;
            errors.push(`${pkg}: ${result.stderr.trim() || "exit " + result.code}`);
          }
        } catch (err: unknown) {
          failed++;
          errors.push(`${pkg}: ${err instanceof Error ? err.message : err}`);
        }
      }

      ctx.ui.setStatus("import", undefined);
      ctx.ui.notify(
        [
          `✓ Import done: ${installed} installed, ${failed} failed`,
          ...errors.map((e) => `  ✗ ${e}`),
          ``,
          `Restart pi or /reload to apply.`,
        ].join("\n"),
        failed > 0 ? "warning" : "info",
      );
    },
  });

  // ─── /config-backup ────────────────────────────────────────────────
  pi.registerCommand("config-backup", {
    description: "Backup config to WebDAV or GitHub Gist",
    handler: async (_args, ctx) => {
      const cfg = await readJson<CloudConfig>(CONFIG_FILE);
      if (!cfg?.provider) {
        ctx.ui.notify("No cloud provider configured. Run /config-cloud-setup first.", "error");
        return;
      }

      const settings = await readSettings();
      const data: BackupData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: filterSettings(settings),
        packages: extractPackages(settings),
        files: await collectFiles(),
      };
      const json = JSON.stringify(data, null, 2);

      try {
        ctx.ui.setStatus("backup", "Uploading...");
        if (cfg.provider === "webdav" && cfg.webdav) {
          await webdavUpload(cfg.webdav, json);
          ctx.ui.notify("✓ Backed up to WebDAV.", "info");
        } else if (cfg.provider === "gist" && cfg.gist) {
          const gistId = await gistUpload(cfg.gist, json);
          // Persist the gist ID for future updates
          if (!cfg.gist.gistId) {
            cfg.gist.gistId = gistId;
            await writeJson(CONFIG_FILE, cfg);
          }
          ctx.ui.notify(`✓ Backed up to Gist: ${gistId}`, "info");
        }
      } catch (err: unknown) {
        ctx.ui.notify(`Backup failed: ${err instanceof Error ? err.message : err}`, "error");
      } finally {
        ctx.ui.setStatus("backup", undefined);
      }
    },
  });



  // ─── /config-cloud-setup ───────────────────────────────────────────
  pi.registerCommand("config-cloud-setup", {
    description: "Configure WebDAV or GitHub Gist cloud backup",
    handler: async (_args, ctx) => {
      const provider = await ctx.ui.select("Select cloud provider:", [
        { label: "WebDAV", value: "webdav" },
        { label: "GitHub Gist", value: "gist" },
      ]);
      if (!provider) return;

      if (provider === "webdav") {
        const url = await ctx.ui.input("WebDAV URL:", "https://dav.example.com/dav/");
        if (!url) return;
        const username = await ctx.ui.input("Username:", "");
        if (!username) return;
        const password = await ctx.ui.input("Password:", "");
        if (!password) return;
        const remotePath = await ctx.ui.input("Remote path:", "/pi-config-backup.json");

        const cfg: CloudConfig = {
          provider: "webdav",
          webdav: { url, username, password, remotePath: remotePath || "/pi-config-backup.json" },
        };
        await writeJson(CONFIG_FILE, cfg);
        ctx.ui.notify("✓ WebDAV configured.", "info");
      } else {
        const token = await ctx.ui.input("GitHub token:", "ghp_...");
        if (!token) return;

        const cfg: CloudConfig = {
          provider: "gist",
          gist: { token, filename: "pi-config-backup.json" },
        };
        await writeJson(CONFIG_FILE, cfg);
        ctx.ui.notify(
          "✓ Gist configured.\nRun /config-backup to create the gist.",
          "info",
        );
      }
    },
  });

  // ─── /config-cloud-status ──────────────────────────────────────────
  pi.registerCommand("config-cloud-status", {
    description: "Show current cloud backup configuration",
    handler: async (_args, ctx) => {
      const cfg = await readJson<CloudConfig>(CONFIG_FILE);
      if (!cfg?.provider) {
        ctx.ui.notify("No cloud provider configured.\nRun /config-cloud-setup to set up.", "info");
        return;
      }

      const lines: string[] = [`Provider: ${cfg.provider}`];
      if (cfg.provider === "webdav" && cfg.webdav) {
        lines.push(`URL: ${cfg.webdav.url}`);
        lines.push(`Username: ${cfg.webdav.username}`);
        lines.push(`Remote path: ${cfg.webdav.remotePath}`);
        lines.push(`Password: ${"*".repeat(cfg.webdav.password.length)}`);
      } else if (cfg.provider === "gist" && cfg.gist) {
        lines.push(`Token: ${cfg.gist.token.slice(0, 4)}${"*".repeat(6)}`);
        lines.push(`Gist ID: ${cfg.gist.gistId || "(not yet created)"}`);
        lines.push(`Filename: ${cfg.gist.filename}`);
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
