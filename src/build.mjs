// 由 <品牌>/tokens.json 生成 build/<品牌>/ 下的文件，并更新 brand.md 里自动生成的对比度表。
// 渠道规则：web → variables.css；app → <品牌>_tokens.dart；channels 非空的都进 tokens.resolved.json。
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import StyleDictionary from 'style-dictionary';
import { validateTokens, ext, hexOf } from './tokens.mjs';
import { evaluateChecks, contrastTable, findContrastBlock } from './contrast.mjs';

const SYSTEM_FONTS = ['-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Segoe UI', 'sans-serif', 'serif', 'monospace'];
const header = (brand, file) => `${brand} 设计令牌：由 brand-kit build 从 ${brand}/tokens.json 生成，不要手改（${file}）`;
const camel = (path) => path.map((p, i) => p.split('-').map((s, j) => (i === 0 && j === 0 ? s : s[0].toUpperCase() + s.slice(1))).join('')).join('');

/** 令牌值转成 CSS 文本（不含引用），也用于 tokens.resolved.json。 */
export function cssValue(type, v, angle) {
  switch (type) {
    case 'color': return v.hex.toLowerCase();
    case 'dimension': return `${v.value}${v.unit}`;
    case 'fontFamily': return (Array.isArray(v) ? v : [v]).map((f) => (/[\s]/.test(f) && !f.startsWith("'") ? `'${f}'` : f)).join(', ');
    case 'gradient': return `linear-gradient(${angle}deg, ${v.map((s) => `${s.color.hex.toLowerCase()} ${Math.round(s.position * 100)}%`).join(', ')})`;
    default: return String(v);
  }
}

function dartValue(type, v) {
  switch (type) {
    case 'color': return `Color(0xFF${v.hex.slice(1).toUpperCase()})`;
    case 'dimension': return v.unit === 'rem' ? (v.value * 16).toFixed(2) : v.value.toFixed(2);
    case 'fontFamily': {
      const list = Array.isArray(v) ? v : [v];
      return JSON.stringify(list.find((f) => !SYSTEM_FONTS.includes(f)) ?? list[0]);
    }
    case 'fontWeight': return String(v);
    case 'number': return Number.isInteger(v) ? `${v}.0` : String(v);
    default: return null;
  }
}

const docLines = (t) => {
  const e = ext(t);
  const lines = [t.$description, `状态：${e.status}；渠道：${e.channels.join('、')}；出处：${e.source}`];
  if (t.$deprecated) lines.push(`已弃用：${typeof t.$deprecated === 'string' ? t.$deprecated : '是'}`);
  return lines.flatMap((l) => l.split('\n'));
};

/**
 * 生成一个品牌的全部产物，返回 Map<相对路径, 内容>，不写盘。
 * 先校验令牌，有错就抛异常（不生成半成品）。
 */
export async function renderBrand(root, brand) {
  const raw = JSON.parse(readFileSync(join(root, brand, 'tokens.json'), 'utf8'));
  const info = validateTokens(raw);
  if (info.errors.length) throw new Error(`${brand}/tokens.json 有 ${info.errors.length} 个错误，先运行 brand-kit check`);
  const files = new Map();
  const list = [...info.tokens.entries()].sort(([a], [b]) => a.localeCompare(b));
  const inChannel = (c) => list.filter(([, t]) => ext(t).channels.includes(c));

  // 1. CSS。值先由 brand-kit 算成 CSS 文本（整值引用保留，生成 var()），Style Dictionary 只负责变量名、引用和格式。
  const webNames = new Set(inChannel('web').map(([n]) => n));
  const cssTokens = {};
  for (const [name, t] of list) {
    if (!webNames.has(name)) continue;
    const path = name.split('.');
    let node = cssTokens;
    for (const p of path.slice(0, -1)) node = node[p] ??= {};
    const value = typeof t.$value === 'string' && /^\{[^{}]+\}$/.test(t.$value)
      ? t.$value
      : cssValue(t.$type, info.resolved.get(name), ext(t).angle);
    node[path.at(-1)] = { $value: value, $type: 'other', $description: t.$description };
  }
  const sd = new StyleDictionary({
    tokens: cssTokens,
    log: { verbosity: 'silent', warnings: 'disabled' },
    hooks: { fileHeaders: { 'brand-kit/header': () => [header(brand, 'variables.css')] } },
    platforms: {
      css: {
        transforms: ['attribute/cti', 'name/kebab'],
        prefix: brand,
        files: [{ destination: 'variables.css', format: 'css/variables', options: { outputReferences: true, fileHeader: 'brand-kit/header' } }],
      },
    },
  });
  const [cssOut] = await sd.formatPlatform('css');
  files.set('variables.css', cssOut.output);

  // 2. Dart（自己生成，文档注释放在声明前面）
  const cls = brand.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('') + 'Tokens';
  const dart = [`// ${header(brand, `${brand}_tokens.dart`)}`, '', "import 'dart:ui';", '', `class ${cls} {`, `  ${cls}._();`];
  for (const [name, t] of inChannel('app')) {
    const v = dartValue(t.$type, info.resolved.get(name));
    if (v === null) continue; // 渐变等 Flutter 没有直接对应的类型，见 tokens.resolved.json
    dart.push('');
    for (const l of docLines(t)) dart.push(`  /// ${l}`);
    if (t.$deprecated) dart.push(`  @Deprecated(${JSON.stringify(typeof t.$deprecated === 'string' ? t.$deprecated : '已弃用')})`);
    dart.push(`  static const ${camel(name.split('.'))} = ${v};`);
  }
  dart.push('}', '');
  files.set(`${brand}_tokens.dart`, dart.join('\n'));

  // 3. 完整 JSON（所有导出渠道，带状态和说明，给设计工具、AI 和其他平台用）
  const resolvedJson = {
    $description: header(brand, 'tokens.resolved.json'),
    tokens: Object.fromEntries(list.filter(([, t]) => ext(t).channels.length).map(([name, t]) => {
      const e = ext(t);
      const v = info.resolved.get(name);
      return [name, {
        type: t.$type,
        value: cssValue(t.$type, v, e.angle),
        ...(t.$type === 'color' ? { hex: hexOf(v) } : {}),
        channels: e.channels,
        status: e.status,
        description: t.$description,
        source: e.source,
        ...(e.pendingReason ? { pendingReason: e.pendingReason } : {}),
        ...(e.confirmedBy ? { confirmedBy: e.confirmedBy, confirmedAt: e.confirmedAt } : {}),
        ...(e.print ? { print: e.print } : {}),
        ...(t.$deprecated ? { deprecated: t.$deprecated } : {}),
      }];
    })),
  };
  files.set('tokens.resolved.json', JSON.stringify(resolvedJson, null, 2) + '\n');
  return files;
}

/** 生成 brand.md 新内容（只替换对比度表区块）。没有区块时原样返回。 */
export function renderBrandMd(root, brand) {
  const p = join(root, brand, 'brand.md');
  const md = readFileSync(p, 'utf8');
  const block = findContrastBlock(md);
  if (!block) return md;
  const raw = JSON.parse(readFileSync(join(root, brand, 'tokens.json'), 'utf8'));
  const info = validateTokens(raw);
  const checksPath = join(root, brand, 'checks.json');
  const checks = existsSync(checksPath) ? JSON.parse(readFileSync(checksPath, 'utf8')) : { contrast: [] };
  const { rows } = evaluateChecks(checks, info);
  return md.slice(0, block.start) + contrastTable(rows) + md.slice(block.end);
}

export async function buildRepo(root, brands) {
  const out = join(root, 'build');
  rmSync(out, { recursive: true, force: true });
  for (const brand of brands) {
    const files = await renderBrand(root, brand);
    mkdirSync(join(out, brand), { recursive: true });
    for (const [f, content] of files) writeFileSync(join(out, brand, f), content);
    const mdPath = join(root, brand, 'brand.md');
    const next = renderBrandMd(root, brand);
    if (next !== readFileSync(mdPath, 'utf8')) writeFileSync(mdPath, next);
  }
}
