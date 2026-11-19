// brand-kit 的常量和品牌库配置读取。规则的文字说明见 docs/令牌规范.md、docs/品牌规范写法.md。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** $extensions 里 brand-kit 自己的命名空间（DTCG 要求厂商扩展用反向域名）。 */
export const NS = 'com.github.dayou-inc.brand-kit';

/** 令牌状态。 */
export const STATUSES = ['confirmed', 'current', 'pending'];

/** 令牌可以导出到的渠道。web → CSS，app → Flutter，其他只进 tokens.resolved.json。 */
export const CHANNELS = ['web', 'app', 'marketing', 'print', 'device'];

/** 支持的 $type（DTCG 2025.10 的子集）。 */
export const TYPES = ['color', 'dimension', 'fontFamily', 'fontWeight', 'number', 'gradient'];

/** 对比度用途和最低要求（WCAG 2.x）。forbidden-text 表示禁止用于文字，只记录、不设下限。 */
export const CONTRAST_USAGE = {
  text: { min: 4.5, label: '正文（任意字号）' },
  'large-text': { min: 3, label: '大字（≥24px 常规，或 ≥18.66px 粗体）' },
  graphic: { min: 3, label: '图形、图标、界面元素' },
  'forbidden-text': { min: null, label: '禁止用于文字' },
};

/** brand.md 必须有的二级标题，顺序也要一致（和 templates/brand/brand.md 相同）。 */
export const REQUIRED_SECTIONS = [
  '1. 品牌和产品',
  '2. Logo',
  '3. 颜色',
  '4. 字体',
  '5. 图形和图标',
  '6. 图片和视频',
  '7. AI 生成图片',
  '8. 文案',
  '9. 各场景怎么用',
  '10. 待处理和按现状执行的事项',
  '素材来源',
  '变更记录',
];

/** 正文里只允许三种状态说法，这些词会报错。 */
export const BANNED_STATUS_WORDS = ['待确认', '待办', '待定', '待决定', '待统一', '未定'];

/** 自动生成的对比度表在 brand.md 里的起止标记。 */
export const CONTRAST_START = '<!-- brand-kit:contrast 由 brand-kit build 生成，不要手改 -->';
export const CONTRAST_END = '<!-- /brand-kit:contrast -->';

/** 名称段落：checks.json 的 names.forbidden 在这一节里允许出现（用来列出禁用的旧名）。 */
export const NAMES_SECTION = '### 1.1 正式名称';

export function loadRepoConfig(root) {
  const p = join(root, 'brand-kit.json');
  if (!existsSync(p)) throw new Error(`${root} 下没有 brand-kit.json，不是品牌库根目录（用 brand-kit init 创建）`);
  let cfg;
  try { cfg = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { throw new Error(`brand-kit.json 不是合法 JSON：${e.message}`); }
  if (!Array.isArray(cfg.brands)) throw new Error('brand-kit.json 缺少 brands 数组');
  for (const b of cfg.brands) {
    if (typeof b !== 'string' || !/^[a-z][a-z0-9-]*$/.test(b)) throw new Error(`brand-kit.json 里的品牌名 ${JSON.stringify(b)} 不合法：只能用小写字母、数字和连字符`);
  }
  return cfg;
}
