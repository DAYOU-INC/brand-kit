# 品牌视觉标准库

本仓库存放各品牌的视觉标准，用 [brand-kit](https://github.com/DAYOU-INC/brand-kit) 校验和构建。

- 人读：各品牌的 `brand.md`
- AI 读：`AGENTS.md`
- 网站、App 用：`build/<品牌>/` 下自动生成的文件

## 命令

```bash
npm ci                     # 安装 brand-kit
npx brand-kit new <品牌名>  # 新增品牌
npx brand-kit build        # 由 tokens.json 生成 build/，更新对比度表
npx brand-kit check        # 校验（CI 每次合并请求都会跑）
```

## 品牌

| 品牌 | 状态 |
|---|---|

## 规则

- 本仓库是视觉标准的唯一版本，其他地方只放链接。
- 改动走合并请求，由品牌负责人审批（见 `.github/CODEOWNERS.example`）。
- 大文件（PSD、视频、原图）留在素材库，各品牌的 `source-index.md` 记路径。
