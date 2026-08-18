# pi-config-sync

[![CI](https://github.com/zuluion/pi-config-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/zuluion/pi-config-sync/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![GitHub release](https://img.shields.io/github/v/release/zuluion/pi-config-sync)](https://github.com/zuluion/pi-config-sync/releases) [![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

Pi coding agent 的配置迁移与云备份插件。支持在多台设备间同步 pi 的设置、插件、自定义扩展等配置。

## 功能

- **导出/导入** — 将配置打包为本地 JSON 文件
- **云端备份** — 支持 WebDAV 和 GitHub Gist 两种云端存储
- **完整迁移** — 不仅同步包列表，还包括自定义扩展、skill、prompt 模板、主题等

## 导出内容

| 类型 | 包含的文件/目录 |
|------|----------------|
| 配置 | `settings.json`、`keybindings.json`、`models.json` |
| 上下文 | `AGENTS.md`、`SYSTEM.md` |
| 扩展 | `extensions/`、`skills/`、`prompts/`、`themes/` |
| 包列表 | 所有通过 `pi install` 安装的包 |

## 安装

```bash
pi install git:github.com/zuluion/pi-config-sync
```

## 命令

| 命令 | 说明 |
|------|------|
| `/export-config [file]` | 导出到本地 JSON 文件 |
| `/import-config <file>` | 从本地 JSON 导入 |
| `/import-config webdav` | 从 WebDAV 导入 |
| `/import-config gist` | 从 GitHub Gist 导入 |
| `/import-config` | 从已配置的云源导入 |
| `/config-backup` | 上传备份到云端 |
| `/config-cloud-setup` | 配置 WebDAV 或 GitHub Gist 凭据 |
| `/config-cloud-status` | 查看当前云配置 |

## 快速开始

### 本地导出/导入

```bash
# 旧设备
/export-config ~/pi-backup.json

# 新设备
/import-config ~/pi-backup.json
```

### 云端备份

```bash
# 首次配置（选择 WebDAV 或 GitHub Gist）
/config-cloud-setup

# 备份
/config-backup

# 恢复
/import-config
```

## 使用 WebDAV

支持任何 WebDAV 服务（坚果云、NextCloud 等）。

配置时需要提供：
- WebDAV URL（如 `https://dav.jianguoyun.com/dav/`）
- 用户名
- 密码（坚果云中生成应用专用密码）
- 远程路径（默认 `/pi-config-backup.json`）

## 使用 GitHub Gist

需要一个 GitHub Personal Access Token（`gist` scope）。

- 首次备份会自动创建 Gist
- 后续备份更新同一个 Gist
- Gist 为私有

## 凭据存储

云服务凭据存储在 `~/.pi/agent/config-backup.json`，不会同步到云端。

## 开发

### 设计文档

详细的改进设计方案请参考：[docs/DESIGN.md](docs/DESIGN.md)

该文档包含：
- 模块化拆分设计
- 测试策略
- 错误处理机制
- 备份历史功能
- 重试机制
- 开发顺序和实施计划

## License

MIT
