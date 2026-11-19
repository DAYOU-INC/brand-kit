# 给 AI 的说明

这是一个品牌视觉标准库，用 [brand-kit](https://github.com/DAYOU-INC/brand-kit) 管理。品牌列表在 `brand-kit.json`，每个品牌一个目录。方法论和完整规则在 brand-kit 的文档里：品牌库里 `npm ci` 之后在 `node_modules/brand-kit/docs/`；没装依赖时直接看 GitHub 上对应版本的文档：`https://github.com/DAYOU-INC/brand-kit/tree/v0.3.3/docs`。

## 0. 先判断你的角色

| 你在做什么 | 角色 | 接着读 |
|---|---|---|
| 在其他项目里做网站、App、广告图、社媒、包装、视频、AI 生图、文案，需要用品牌规范 | **使用者** | 本文第 1–4 节；详细做法见 `node_modules/brand-kit/docs/接入指南.md` |
| 在本仓库里新增品牌、从素材提取规范、改令牌、处理确认结果 | **维护者** | 本文第 5 节；然后 `node_modules/brand-kit/docs/维护流程.md` |

拿不准就按使用者处理：只读，不改本仓库。

## 1. 使用者：怎么读

1. 先拉最新版：`git switch main && git pull --ff-only`。不在 main 上、或者有没提交的改动，先停下问人。
2. 读 `<品牌>/brand.md` 第 1 节（品牌和正式名称）、第 10 节（待处理和按现状执行），再按**第 9 节的任务表**读和任务相关的章节。
3. 数值只用 `build/<品牌>/` 里生成的文件：
   - `variables.css`：网站（只含渠道 web 的令牌）
   - `<品牌>_tokens.dart`：Flutter App（只含渠道 app 的令牌）
   - `tokens.resolved.json`：全部导出的令牌，带渠道、状态、说明和出处；做设计稿、广告、包装、设备界面时用，**只用渠道包含你这个场景的令牌**
4. 不要从图片里取色，不要凭印象写色值，不要手改 `build/`。
5. logo 只用 `<品牌>/assets/logo/` 里的文件。

## 2. 状态

| 正文写法 | 令牌 status | 怎么用 |
|---|---|---|
| 「已确认」 | `confirmed` | 定论，直接用 |
| 「按现状执行」 | `current` | 现行规定，直接用；交付时列出用到了哪些（以后可能变） |
| 「待处理」 | `pending` | 有问题没解决，不要自己决定；停下或用替代方案，交付时报告 |

令牌带 `$deprecated` 的已经弃用，不要再用，按说明换成新令牌。

## 3. 两种角色都不能做的

- 用 AI 生成或重画 logo，用字体打出字标代替。
- 用渠道不包含当前场景的令牌（比如只给设备屏幕用的颜色，不能用在网站和广告上）。
- 用 `checks.json` 里 `names.forbidden` 登记的旧名。
- 在本仓库之外另存一份规范或色值（原样复制 `build/` 里的生成文件并注明来源提交号除外）。
- 把私有品牌库的内容贴到公开的地方。

## 4. 使用者：交付前检查

- [ ] 颜色、字体、圆角都来自 `build/<品牌>/`，令牌的渠道包含当前场景。
- [ ] 文字和底色的组合在 `brand.md` 第 3.2 节的对比度表里，且符合表里的规则；表里没有的组合先算对比度（`npx brand-kit contrast "#前景" "#底色"`；WCAG 2.x AA：正文 ≥ 4.5，大字和图形 ≥ 3）。
- [ ] logo 是原文件，没有变形、改色、加效果，留足安全距离。
- [ ] 产品名称是 `brand.md` 第 1.1 节的正式名称；功能描述没有超出第 8 节指向的产品说明。
- [ ] 没有用到 `brand.md` 第 2.3、6.5 节禁止的做法。
- [ ] 交付说明写了：规范版本（`<品牌库>@<提交号>` 或标签）、用到的「按现状执行」条目、碰到的「待处理」事项。

## 5. 维护者：要点

完整步骤见 `node_modules/brand-kit/docs/维护流程.md`。最容易出错的：

- 改动走分支和合并请求，不直接推 `main`；合并前要有负责人审批。
- 数值只改 `tokens.json`，改完 `npx brand-kit build`；`brand.md` 只写令牌全名。
- 新令牌的 `status`、`channels`、`source`、`$description` 都必填。
- 不改名、不删除已有令牌；要换就用 `$deprecated` 过渡，见 `node_modules/brand-kit/docs/版本与发布.md`。
- 只有人的明确答复才能把状态改成 `confirmed`，要写 `confirmedBy` 和 `confirmedAt`；变更记录的“确认”列同步写。
- 提交前 `npx brand-kit check` 必须通过。
