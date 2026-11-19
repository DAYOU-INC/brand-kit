# Acme 品牌视觉标准

> **Acme 是虚构的示例品牌**，用来演示 brand-kit 的写法，所有素材路径和人名都是虚构的。
>
> 状态：初稿，按现状执行（2026-11-19 根据示例素材整理）。
> 没有定论的地方照现有物料的做法执行，标「按现状执行」，可以直接用；必须有人处理的问题标「待处理」，见第 10 节；经负责人确认的标「已确认」。
> 数值只在 [`tokens.json`](tokens.json) 里定义。本文提到颜色时写令牌全名，需要写色值时同一行写出令牌全名。

## 1. 品牌和产品

Acme 做家用电动磨豆机，给在家做手冲和意式的人用：稳定的研磨度，简单的操作。

### 1.1 正式名称

| 产品线 | 正式名称 | 外观 |
|---|---|---|
| 磨豆机 | Acme Grind G1 | 深青色铝合金机身，顶部透明豆仓，正面圆形研磨度旋钮（焦糖橙），右侧一块小圆屏 |
| 磨豆机（小型） | Acme Grind G1 Mini | 外观同 G1，高度约为 G1 的三分之二，没有屏幕 |

正式名称以示例产品说明书为准。旧名 “Acme Mill” 已停用，登记在 `checks.json` 的 `names.forbidden`，本节以外不能出现。

### 1.2 气质

安静、精确、温暖。像一件好用的厨房工具，不像实验室仪器，也不炫技。

## 2. Logo

### 2.1 组成

圆形图形标（深青圆底上一个白色尖角，像研磨刻度的指针）加小写字标。字标是定制字形，只能用 logo 文件，不能用字体打出来。

### 2.2 版本和颜色用法

| 底色 | logo 文件 |
|---|---|
| 白色、奶油色（`color.brand.cream`） | `assets/logo/acme-horizontal-primary.svg` |
| 深青（`color.brand.primary`）、深色（`color.brand.ink`）、照片暗部 | `assets/logo/acme-horizontal-white.svg` |
| 头像、App 图标、小尺寸 | `assets/logo/acme-mark-primary.svg` |

### 2.3 禁止

- 用 AI 生成或重画 logo，用字体打出字标代替
- 拉伸、倾斜、加描边、加阴影、加渐变
- 放在焦糖橙（`color.brand.accent`）或浅焦糖（`color.brand.accent-light`）底上

### 2.4 安全距离和最小尺寸

安全距离等于图形标直径的 1/4；横版最小宽度屏幕 96px、印刷 20mm。已确认（示例：品牌负责人，设计评审会，2026-11-01）。

## 3. 颜色

### 3.1 配色

| 令牌 | 角色 | 用在哪里 |
|---|---|---|
| `color.brand.primary` | 主色（已确认） | 大面积底色、标题、按钮 |
| `color.brand.accent` | 强调色 | 价格、关键数字、旋钮；面积不超过画面的 5% |
| `color.brand.accent-light` | 浅强调 | 背景块、渐变终点 |
| `color.brand.cream` | 浅底 | 页面底色、卡片 |
| `color.brand.ink` | 深色 | 正文、深色底 |
| `color.device.ready` | 设备专用 | 只用于设备屏幕，渠道只有 device |

渐变 `gradient.warm`：从 `color.brand.cream` 到 `color.brand.accent-light`，横向，用于横幅背景。

`color.legacy.orange` 已弃用，改用 `color.brand.accent`。

### 3.2 文字对比度

<!-- brand-kit:contrast 由 brand-kit build 生成，不要手改 -->
| 文字 / 图形 | 底色 | 对比度 | 规则 | 说明 |
|---|---|---|---|---|
| `color.neutral.white` #FFFFFF | `color.brand.primary` #1F4E5F | 9.08:1 | 正文（任意字号） |  |
| `color.brand.ink` #14181C | `color.brand.cream` #F4EDE4 | 15.36:1 | 正文（任意字号） |  |
| `color.brand.primary` #1F4E5F | `color.brand.cream` #F4EDE4 | 7.82:1 | 正文（任意字号） |  |
| `color.brand.ink` #14181C | `color.brand.accent-light` #F2B48A | 9.91:1 | 正文（任意字号） |  |
| `color.neutral.white` #FFFFFF | `color.brand.accent` #C8611E | 4.05:1 | 大字（≥24px 常规，或 ≥18.66px 粗体） | 价格块、按钮大字 |
| `color.neutral.white` #FFFFFF | `color.brand.accent-light` #F2B48A | 1.80:1 | 禁止用于文字 | 浅焦糖底不放白字 |
<!-- /brand-kit:contrast -->

表里没有的组合，使用前先算对比度：正文 ≥ 4.5，大字 ≥ 3。

### 3.3 不同渠道的差异

网站主色 `color.digital.web-primary` 指向 `color.brand.primary`，没有差异。营销长图的卡片圆角用 `radius.card-marketing`，网站和 App 用 `radius.card`（按现状执行）。

## 4. 字体

| 用途 | 令牌 | 状态 |
|---|---|---|
| 标题、按钮、营销物料正文 | `font.display` | 按现状执行 |
| 网页正文 | `font.body` | 按现状执行 |
| 包装中文 | `font.packaging-cn` | 待处理，见第 10.1 节 |

## 5. 图形和图标

网站和 App 用线性图标：24px 网格、2px 描边、圆角端点、单色（按现状执行）。设备屏幕只用 `color.neutral.white` 和 `color.device.ready` 两种颜色。

## 6. 图片和视频

### 6.1 产品图

奶油色无纹理背景，柔和的左上侧光，有接地阴影；产品居中，四周留白不少于 15%。

### 6.2 场景图

清晨自然光的厨房台面，木质和陶瓷器具，人物只露手部。色调偏暖，不用冷蓝滤镜。

### 6.3 营销版式

浅色体系：`color.brand.cream` 底 + 白色卡片（`radius.card-marketing`），标题 `color.brand.primary`，价格块 `color.brand.accent` 底白色粗体大字。

### 6.4 视频

现有物料没有涉及。

### 6.5 禁止

- 咖啡馆商用场景（产品是家用的）
- 夸张的咖啡粉飞溅、蒸汽特效
- 产品外观画错：旋钮在正面、屏幕在右侧，G1 Mini 没有屏幕

## 7. AI 生成图片

生成的图里不要有 logo 和文字，logo 后期贴原文件。生成后人工核对旋钮和屏幕的位置。

正向提示词：

```
Acme Grind G1 electric coffee grinder on a light oak kitchen counter, deep teal aluminum body,
clear bean hopper on top, round caramel-orange grind dial on the front, small round display on the right side,
soft morning window light, warm tones, realistic product photography, no text, no logo
```

负向提示词：

```
cafe, commercial espresso machine, coffee powder explosion, steam effects, neon, cold blue filter,
extra dials, wrong dial position, garbled text, fake logo, watermark
```

## 8. 文案

产品功能和参数的说法以示例产品说明书为准。语气：先说结果（“每天一样的研磨度”），再说参数；不用夸张的形容词。

## 9. 各场景怎么用

使用者 AI 按这张表找要读的章节和要用的文件。

| 任务 | 读 | 用 |
|---|---|---|
| 网站 | 第 2、3、4、5 节 | `build/acme/variables.css` |
| App | 第 3、4、5 节 | `build/acme/acme_tokens.dart` |
| 广告、社媒、详情页 | 第 3、4、6.3、8 节 | `build/acme/tokens.resolved.json` 里渠道含 marketing 的令牌 |
| AI 生图 | 第 1、6、7 节 | 第 7 节提示词 |
| 设备屏幕 | 第 5 节 | 渠道含 device 的令牌 |
| 包装、印刷 | 第 2.4、3、10.1 节 | `assets/logo/` 的 SVG；渠道含 print 的令牌 |

## 10. 待处理和按现状执行的事项

### 10.1 待处理

| 事项 | 影响 | 找谁 |
|---|---|---|
| 包装中文字体 `font.packaging-cn` 的文件格式 | 包装稿不能定稿 | 示例：包装供应商 |

### 10.2 按现状执行

| 事项 | 现在怎么执行 | 以后可以考虑 |
|---|---|---|
| 营销卡片圆角 | 营销 16px，网站和 App 12px | 统一为一个值 |
| 图标规格 | 2px 描边线性图标 | 美术出正式图标规范 |

## 素材来源

见 [`source-index.md`](source-index.md)。

## 变更记录

| 日期 | 变更 | 确认 |
|---|---|---|
| 2026-11-01 | 主色和 logo 安全距离确认 | 示例：品牌负责人，设计评审会，2026-11-01 |
| 2026-11-19 | 初稿 | 未确认 |
