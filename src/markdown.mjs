// Markdown 相关：代码块和注释处理、GitHub 风格锚点、章节切分、链接提取、按大小写严格判断文件是否存在。
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/** 把围栏代码块替换成空行（保留行号），用于不该检查代码的规则。 */
export function blankFences(md) {
  let inFence = false;
  return md.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return ''; }
    return inFence ? '' : line;
  });
}

/** 标出每一行是否在围栏代码块里（含围栏行本身）。 */
export function fenceMask(md) {
  let inFence = false;
  return md.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return true; }
    return inFence;
  });
}

/** 去掉行内代码和单行 HTML 注释。 */
export const stripInline = (line) => line.replace(/`[^`]*`/g, '').replace(/<!--.*?-->/g, '');

/** 去掉多行 HTML 注释（保留行号）。 */
export function blankComments(lines) {
  let inComment = false;
  return lines.map((line) => {
    let out = '';
    let rest = line;
    while (rest.length) {
      if (inComment) {
        const end = rest.indexOf('-->');
        if (end === -1) rest = ''; else { inComment = false; rest = rest.slice(end + 3); }
      } else {
        const start = rest.indexOf('<!--');
        if (start === -1) { out += rest; rest = ''; } else { out += rest.slice(0, start); inComment = true; rest = rest.slice(start + 4); }
      }
    }
    return out;
  });
}

/** GitHub 的标题锚点：小写，去掉标点（保留字母、数字、空格、连字符、下划线，含中文），空格变连字符。 */
export function slug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** 一个 md 文件里所有标题的锚点（重复标题按 GitHub 规则加 -1、-2）。 */
export function anchors(md) {
  const seen = new Map();
  const out = new Set();
  for (const line of blankFences(md)) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const base = slug(m[1].replace(/`/g, ''));
    const n = seen.get(base) ?? 0;
    out.add(n ? `${base}-${n}` : base);
    seen.set(base, n + 1);
  }
  return out;
}

/** 二级标题列表（不含代码块里的）。 */
export const h2s = (md) => blankFences(md).map((l) => l.match(/^##\s+(.+?)\s*$/)?.[1]).filter(Boolean);

/** 返回 [起始行, 结束行)：某个标题到下一个同级或更高级标题之前（代码块里的 # 不算）。行号从 0 开始。 */
export function sectionRange(lines, heading) {
  const level = heading.match(/^#+/)[0].length;
  const code = fenceMask(lines.join('\n'));
  const start = lines.findIndex((l, i) => !code[i] && l.trim() === heading);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (code[i]) continue;
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return [start, end];
}

/** 一行里的链接目标：行内链接（可带标题）、图片，以及引用式定义 [x]: target。 */
export function linkTargets(line) {
  const out = [];
  for (const m of line.matchAll(/\]\(\s*(?:<([^>]+)>|([^)\s<>]+))(?:\s+["'(][^)]*["')])?\s*\)/g)) out.push(m[1] ?? m[2]);
  const def = line.match(/^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+["'(].*["')])?\s*$/);
  if (def) out.push(def[1]);
  return out;
}

/**
 * 按大小写严格判断 base 下的相对路径是否存在（Windows 和 macOS 默认不区分大小写，CI 的 Linux 区分）。
 * 只比对 base 以下的各级名字；base 本身按原样信任（避免 8.3 短路径等问题）。
 * rel 可以含 ..，但结果必须仍在 root（品牌库根目录）之内。
 */
export function existsExact(root, base, rel) {
  const target = resolve(base, rel);
  const r = resolve(root);
  if (target !== r && !target.startsWith(r + sep)) return false;
  if (!existsSync(target)) return false;
  let cur = r;
  for (const part of target.slice(r.length).split(sep).filter(Boolean)) {
    let names;
    try { names = readdirSync(cur); } catch { return false; }
    if (!names.includes(part)) return false;
    cur = join(cur, part);
  }
  return true;
}

/** decodeURI，格式不对时返回 null 而不是抛异常。 */
export function safeDecode(s) {
  try { return decodeURI(s); } catch { return null; }
}
