# 更新日志

格式：每个版本一节，写新增、变更（含不兼容改动和迁移方法）、修复。版本规则见 [docs/版本与发布.md](docs/版本与发布.md)。

## v0.1.0（2026-11-19）

首个版本。

- 新增：命令 `init`、`new`、`check`、`build`、`color`
- 新增：令牌格式采用 DTCG 2025.10 子集（color、dimension、fontFamily、fontWeight、number、gradient），扩展字段 `status`、`channels`、`source` 必填
- 新增：按渠道生成 `variables.css`（web）、`<品牌>_tokens.dart`（app）、`tokens.resolved.json`（全部导出渠道）
- 新增：`brand.md` 写法检查（章节、令牌名、色值、状态说法、占位符、禁用名字、变更记录、链接和锚点），对比度表自动生成
- 新增：JSON Schema（`schemas/`）、品牌库模板（`templates/`）、虚构示例品牌 Acme（`example/`）
- 新增：文档：方法论、令牌规范、品牌规范写法、维护流程、接入指南、采用指南、版本与发布
