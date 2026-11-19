// 由 <品牌>/tokens.json 生成 build/<品牌>/ 下的文件，并更新 brand.md 里自动生成的对比度表。
// 渠道规则：web → variables.css；app → <品牌>_tokens.dart；channels 非空的都进 tokens.resolved.json 和 tokens.dtcg.json。
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { NS, KIT_VERSION, readText } from './config.mjs';
import { validateTokens, ext, hexOf, isRef, cssName, dartName } from './tokens.mjs';
import { evaluateChecks, contrastTable, findContrastBlock } from './contrast.mjs';

const SYSTEM_FONTS = ['-apple-system', 'BlinkMacSystemFont', 'system-ui', 'ui-sans-serif', 'Segoe UI', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif', 'serif', 'monospace'];
const GENERIC = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', '-apple-system', 'BlinkMacSystemFont'];
const header = (brand, file) => `${brand} 设计令牌：由 brand-kit ${KIT_VERSION} 从 ${brand}/tokens.json 生成，不要手改（${file}）`;
/** 注释里不能出现结束符和开始符，换行压成空格。 */
const safeComment = (s) => String(s).replace(/\*\//g, '* /').replace(/\/\*/g, '/ *').replace(/\s*\n\s*/g, ' ');

/** 令牌值转成 CSS 文本。 */
export function cssValue(type, v, angle) {
  switch (type) {
    case 'color': return v.hex.toLowerCase();
    case 'dimension': return `${v.value}${v.unit}`;
    case 'fontFamily': return (Array.isArray(v) ? v : [v]).map((f) => (GENERIC.includes(f) ? f : `"${f}"`)).join(', ');
    case 'gradient': return `linear-gradient(${angle}deg, ${v.map((s) => `${s.color.hex.toLowerCase()} ${Math.round(s.position * 1000) / 10}%`).join(', ')})`;
    default: return String(v);
  }
}

function dartValue(type, v) {
  switch (type) {
    case 'color': return `Color(0xFF${v.hex.slice(1).toUpperCase()})`;
    case 'dimension': return (v.unit === 'rem' ? v.value * 16 : v.value).toFixed(1);
    case 'fontFamily': {
      const list = Array.isArray(v) ? v : [v];
      return JSON.stringify(list.find((f) => !SYSTEM_FONTS.includes(f)) ?? list[0]);
    }
    case 'fontWeight': return `FontWeight.w${v}`;
    case 'number': return Number.isInteger(v) ? `${v}.0` : String(v);
    default: return null;
  }
}

const docLines = (t) => {
  const e = ext(t);
  const lines = [t.$description, `状态：${e.status}；渠道：${e.channels.join('、')}；出处：${e.source}`];
  if (e.pendingReason) lines.push(`待处理：${e.pendingReason}`);
  if (t.$deprecated) lines.push(`已弃用：${typeof t.$deprecated === 'string' ? t.$deprecated : '是'}`);
  return lines.flatMap((l) => String(l).split('\n'));
};

function loadTokens(root, brand) {
  const raw = JSON.parse(readText(join(root, brand, 'tokens.json')));
  const info = validateTokens(raw);
  if (info.errors.length) throw new Error(`${brand}/tokens.json 有 ${info.errors.length} 个错误，先运行 brand-kit check`);
  return { raw, info };
}

/** 生成一个品牌的全部产物，返回 Map<文件名, 内容>，不写盘。令牌有错就抛异常。 */
export function renderBrand(root, brand) {
  const { info } = loadTokens(root, brand);
  const files = new Map();
  const list = [...info.tokens.entries()].sort(([a], [b]) => a.localeCompare(b));
  const inChannel = (c) => list.filter(([, t]) => ext(t).channels.includes(c));
  const exported = list.filter(([, t]) => ext(t).channels.length);

  // 1. CSS：整值别名写成 var()，其他写解析后的值
  const css = [`/* ${header(brand, 'variables.css')} */`, '', ':root {'];
  const web = inChannel('web');
  const aliasLast = [...web.filter(([, t]) => !isRef(t.$value)), ...web.filter(([, t]) => isRef(t.$value))];
  for (const [name, t] of aliasLast) {
    const value = isRef(t.$value)
      ? `var(--${brand}-${cssName(t.$value.slice(1, -1))})`
      : cssValue(t.$type, info.resolved.get(name), ext(t).angle);
    const dep = t.$deprecated ? `（已弃用：${safeComment(t.$deprecated === true ? '是' : t.$deprecated)}）` : '';
    css.push(`  /* ${safeComment(t.$description)}${dep} */`);
    css.push(`  --${brand}-${cssName(name)}: ${value};`);
  }
  css.push('}', '');
  files.set('variables.css', css.join('\n'));

  // 2. Dart：文档注释在声明前面；渐变没有对应类型，只在 JSON 里
  const cls = brand.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('') + 'Tokens';
  const dart = [`// ${header(brand, `${brand}_tokens.dart`)}`, '', "import 'package:flutter/painting.dart';", '', `abstract final class ${cls} {`];
  for (const [name, t] of inChannel('app')) {
    const v = dartValue(t.$type, info.resolved.get(name));
    if (v === null) continue;
    dart.push('');
    for (const l of docLines(t)) dart.push(`  /// ${l}`);
    if (t.$deprecated) dart.push(`  @Deprecated(${JSON.stringify(typeof t.$deprecated === 'string' ? t.$deprecated : '已弃用')})`);
    dart.push(`  static const ${dartName(name)} = ${v};`);
  }
  dart.push('}', '');
  files.set(`${brand}_tokens.dart`, dart.join('\n'));

  // 3. 带说明的完整 JSON（给 AI、脚本和其他平台）
  const resolvedJson = {
    $description: header(brand, 'tokens.resolved.json'),
    tokens: Object.fromEntries(exported.map(([name, t]) => {
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

  // 4. DTCG 文件（给设计工具导入）：只含导出且未弃用的令牌，值已解析（不含引用），保留扩展字段
  const dtcg = { $description: header(brand, 'tokens.dtcg.json') };
  for (const [name, t] of exported) {
    if (t.$deprecated) continue;
    const path = name.split('.');
    let node = dtcg;
    for (const p of path.slice(0, -1)) node = node[p] ??= {};
    node[path.at(-1)] = {
      $type: t.$type,
      $value: info.resolved.get(name),
      $description: t.$description,
      $extensions: { [NS]: t.$extensions[NS] },
    };
  }
  files.set('tokens.dtcg.json', JSON.stringify(dtcg, null, 2) + '\n');
  return files;
}

/** 生成 brand.md 新内容（只替换对比度表区块），保留原来的换行风格。没有区块时原样返回。 */
export function renderBrandMd(root, brand) {
  const p = join(root, brand, 'brand.md');
  const original = readFileSync(p, 'utf8');
  const crlf = original.includes('\r\n');
  const md = original.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const block = findContrastBlock(md);
  if (!block) return original;
  const { info } = loadTokens(root, brand);
  const checksPath = join(root, brand, 'checks.json');
  const checks = existsSync(checksPath) ? JSON.parse(readText(checksPath)) : { contrast: [] };
  const { rows, errors } = evaluateChecks(checks, info);
  if (errors.length) throw new Error(`${brand}/checks.json 有 ${errors.length} 个错误，先运行 brand-kit check`);
  const next = md.slice(0, block.start) + contrastTable(rows) + md.slice(block.end);
  return crlf ? next.replace(/\n/g, '\r\n') : next;
}

/** 先把所有品牌渲染到内存，全部成功后才替换 build/ 和 brand.md；任何一步失败都不动磁盘。 */
export function buildRepo(root, brands) {
  const outputs = brands.map((brand) => ({ brand, files: renderBrand(root, brand), md: renderBrandMd(root, brand) }));
  const out = join(root, 'build');
  const tmp = join(root, `.build-tmp-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (const { brand, files } of outputs) {
    mkdirSync(join(tmp, brand), { recursive: true });
    for (const [f, content] of files) writeFileSync(join(tmp, brand, f), content);
  }
  rmSync(out, { recursive: true, force: true });
  renameSync(tmp, out);
  for (const { brand, md } of outputs) {
    const p = join(root, brand, 'brand.md');
    if (md !== readFileSync(p, 'utf8')) writeFileSync(p, md);
  }
}
