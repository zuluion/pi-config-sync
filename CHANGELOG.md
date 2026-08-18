# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

## [1.1.0] - 2026-08-17

### Added
- WebDAV 备份文件名包含设备名称和时间戳（`{device}_{tz}_{timestamp}.json`）
- WebDAV 配置新增「设备名称」字段，用于区分不同设备的备份
- WebDAV 远程目录默认改为 `Pi-Config-Sync`
- 导入时列出远程 WebDAV 目录中的所有备份文件供用户选择
- 文件列表显示文件名、修改时间、大小（KB）
- `generateBackupFilename()` 函数生成带时区偏移的文件名
- `webdavList()` 函数通过 PROPFIND 列出远程目录内容

### Changed
- WebDAV `remotePath` 默认值从 `/pi-config-backup.json` 改为 `Pi-Config-Sync`
- `webdavRequest()` 重构 URL 构建逻辑，支持目录+文件名模式
- `webdavUpload()` 接受可选 `filename` 参数
- `webdavDownload()` 接受可选 `filePath` 参数

### Fixed
- 兼容旧配置（`remotePath` 为纯文件名时仍可正常工作）

## [1.0.0] - 2024-08-18

### Added
- 导出配置到本地 JSON 文件
- 从本地 JSON 导入配置
- WebDAV 云备份支持
- GitHub Gist 云备份支持
- 多云服务配置与选择
- 配置历史记录
- 自动重试机制
- 二进制文件无损备份
- 路径穿越安全防护

### Fixed
- 修复 WebDAV URL 路径拼接问题
- 修复配置覆盖问题（配置新服务时保留其他服务信息）
- 修复 select 菜单显示 object 问题

### Changed
- 重构重试机制，使用 AbortController 替代 Promise.race
- 精简错误处理逻辑
- 改进类型定义

## [0.x.x] - 早期开发版本

内部开发版本，未公开发布。

---

## 版本号说明

- **Major (X.0.0)**: 不兼容的 API 变更
- **Minor (0.X.0)**: 向后兼容的功能新增
- **Patch (0.0.X)**: 向后兼容的问题修复
