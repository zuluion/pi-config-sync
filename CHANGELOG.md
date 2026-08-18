# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

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
