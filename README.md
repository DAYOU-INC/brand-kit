# brand-kit

**AI 时代的品牌视觉规范：方法论、模板和工具。**

一个团队的品牌规范，往往同时给设计师、开发、运营和 AI 用。brand-kit 把规范放进 git 仓库，分成四部分：

- **规范正文**（`brand.md`）：人和 AI 都能读
- **设计令牌**（`tokens.json`，DTCG 2025.10 格式）：所有数值只在这里定义
- **生成文件**（`build/`）：网站 CSS、Flutter 常量、带说明的完整 JSON，由令牌自动生成
- **自动校验**（`brand-kit check`）：每个合并请求都检查一遍，规范写错、数值对不上、对比度不达标、生成文件过期都会报错

AI 有明确的入口（`AGENTS.md`），分两种角色：维护品牌库的 AI，和在其他项目里使用规范的 AI。

## 先看什么

| 你是 | 读 |
|---|---|
| 想了解这套做法 | [docs/方法论.md](docs/方法论.md) |
| 要给自己团队建一个品牌库 | [docs/采用指南.md](docs/采用指南.md) |
| 维护品牌库（人或 AI） | [docs/维护流程.md](docs/维护流程.md)、[docs/令牌规范.md](docs/令牌规范.md)、[docs/品牌规范写法.md](docs/品牌规范写法.md) |
| 在其他项目里使用品牌规范（人或 AI） | [docs/接入指南.md](docs/接入指南.md) |
| 想看完整例子 | [example/](example/README.md)：虚构品牌 Acme 的完整品牌库 |

## 快速开始

需要 Node.js 22 或更高版本。

```bash
npx github:DAYOU-INC/brand-kit#v0.1.0 init my-brands
cd my-brands && git init -b main && npm install
npx brand-kit new acme       # 新增品牌，按模板填写
npx brand-kit build          # 由 tokens.json 生成 build/，更新对比度表
npx brand-kit check          # 校验
npx brand-kit color #1f4e5f  # 输出 DTCG 颜色对象
```

## 仓库结构

```
brand-kit/
├── src/          命令行、校验、构建
├── schemas/      tokens.json、checks.json、brand-kit.json 的 JSON Schema
├── templates/    repo/：品牌库模板；brand/：品牌模板
├── example/      用模板生成的示例品牌库（虚构品牌 Acme）
├── docs/         方法论和各类规范
└── test/         反例测试：每条校验规则都有一个故意写错的例子
```

## 开发

```bash
npm ci
npm test                                  # 全部测试
node src/cli.mjs check --root example     # 校验示例库
node src/cli.mjs build --root example     # 改了生成逻辑或示例后重新生成
```

改动规则时，要同时改代码（`src/`）、Schema（`schemas/`）、文档（`docs/`），加一个反例测试，并在 [CHANGELOG.md](CHANGELOG.md) 里记一笔。维护本仓库的 AI 先读 [AGENTS.md](AGENTS.md)。

## 许可证

代码、文档和示例按 [MIT](LICENSE) 许可。示例品牌 Acme 是虚构的。用 brand-kit 建立的品牌库里的品牌素材（logo、商标、产品图）归各品牌所有，不受本许可证约束。
