# 更新日志

格式：每个版本一节，写新增、变更（含不兼容改动和迁移方法）、修复。版本规则见 [docs/版本与发布.md](docs/版本与发布.md)。

## v0.2.0（2026-11-19）

根据独立审查修正。**不兼容**：令牌校验更严、生成文件有变化，从 v0.1.0 升级时按下面的“迁移”处理。

- 修复：令牌描述里有 `*/` 或花括号时，生成的 CSS 无效或构建失败（CSS 改为 brand-kit 自己生成，去掉了 Style Dictionary 依赖）
- 修复：构建失败时 `build/` 被整个删掉；现在全部品牌都生成成功后才替换
- 修复：字体名没有转义；颜色 `alpha` 被悄悄丢掉（现在不支持 alpha，写了会报错）
- 修复：不同令牌生成相同的变量名不报错；名字格式不检查
- 修复：漏写 `$value` 的令牌被当成空分组；拼错的字段不报错（check 现在直接用 JSON Schema 校验）
- 修复：代码块里的占位符和禁用名字查不出；单个词的令牌简写、大写令牌名查不出；source-index.md 的占位符查不出；`assets/`、`examples/` 目录不检查
- 修复：CRLF 换行、UTF-8 BOM 误报；链接和素材路径在 Windows 上不区分大小写；格式不对的链接让 check 崩溃；带标题的链接和引用式链接不检查
- 修复：渠道和引用的规则误报，现在只约束导出到 web 的整值别名
- 新增：`tokens.dtcg.json`（给设计工具导入）；生成文件头写 brand-kit 版本；Dart 字重输出 `FontWeight.wXXX`
- 新增：确认人不能是 AI、确认日期必须真实存在、confirmed 和 pendingReason 互斥；`extraColors` 登记了没用到会报错；状态词黑名单扩充；禁用名字不分大小写
- 变更：依赖地址改用标签压缩包（`github:` 简写在锁文件里是 SSH 地址，CI 装不上）；Schema 地址指向标签
- 迁移：运行 `npx brand-kit check`，按报错修改；常见的有：删掉颜色的 `alpha`；令牌名改成小写加连字符；`print` 里没定的值删掉；`confirmed` 的令牌删掉 `pendingReason`；品牌目录补 `examples/`；然后 `npx brand-kit build`

## v0.1.0（2026-11-19）

首个版本。

- 新增：命令 `init`、`new`、`check`、`build`、`color`
- 新增：令牌格式采用 DTCG 2025.10 子集（color、dimension、fontFamily、fontWeight、number、gradient），扩展字段 `status`、`channels`、`source` 必填
- 新增：按渠道生成 `variables.css`（web）、`<品牌>_tokens.dart`（app）、`tokens.resolved.json`（全部导出渠道）
- 新增：`brand.md` 写法检查（章节、令牌名、色值、状态说法、占位符、禁用名字、变更记录、链接和锚点），对比度表自动生成
- 新增：JSON Schema（`schemas/`）、品牌库模板（`templates/`）、虚构示例品牌 Acme（`example/`）
- 新增：文档：方法论、令牌规范、品牌规范写法、维护流程、接入指南、采用指南、版本与发布
