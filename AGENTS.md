# 给 AI 的说明（维护 brand-kit 本身）

本仓库是 brand-kit 工具和方法论，不是某个品牌的品牌库。

- 如果你是要**使用或维护某个品牌库**，去读那个品牌库的 `AGENTS.md`。本仓库的 [`templates/repo/AGENTS.md`](templates/repo/AGENTS.md) 就是它的模板。
- 如果你要**改 brand-kit 本身**（规则、命令、模板、文档），按下面做。

## 改动规则

1. 一条规则对应四个地方，改一处就要同步其他三处：
   - 代码：`src/`
   - Schema：`schemas/`（结构类规则）
   - 文档：`docs/令牌规范.md` 或 `docs/品牌规范写法.md`
   - 测试：`test/check.test.mjs` 里加一个故意写错的例子，确认会报错
2. 模板（`templates/`）和示例（`example/`）必须一直能通过校验：`npm test` 会检查。
3. 改了生成逻辑或示例，运行 `node src/cli.mjs build --root example`，把 `example/build/` 一起提交。
4. 不兼容的改动按 [`docs/版本与发布.md`](docs/版本与发布.md) 升版本号，在 [`CHANGELOG.md`](CHANGELOG.md) 里写明迁移方法。

## 本仓库是公开的

- 不能出现任何真实品牌的内部信息：人名、内部路径、未发布的产品、内部问题。例子一律用虚构品牌 Acme。
- 文档写通用做法，不写某个团队的私有流程。

## 提交前

- [ ] `npm test` 全部通过（反例测试会在带中文和空格的路径下运行）
- [ ] `node src/cli.mjs check --root example` 通过
- [ ] 文档、Schema、代码、测试四处一致
- [ ] CHANGELOG 记了一笔

## 写作

文档用中文，面向人和 AI：句子短，一条规则一句话，能检查的规则标“（自动检查）”。代码、命令、字段名保持英文。
