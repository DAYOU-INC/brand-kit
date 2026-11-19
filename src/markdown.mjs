// Markdown 相关：去掉代码、生成 GitHub 风格锚点、按章节切分。

/** 把围栏代码块替换成空行（保留行号），用于不该检查代码的规则。 */
export function blankFences(md) {
  let inFence = false;
  return md.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return ''; }
    return inFence ? '' : line;
  });
}

/** 去掉行内代码和 HTML 注释。 */
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
        if (end === -1) { rest = ''; } else { inComment = false; rest = rest.slice(end + 3); }
      } else {
        const start = rest.indexOf('<!--');
        if (start === -1) { out += rest; rest = ''; } else { out += rest.slice(0, start); inComment = true; rest = rest.slice(start + 4); }
      }
    }
    return out;
  });
}

/** GitHub 的标题锚点算法（够用的近似：小写、去掉标点、空格变连字符，保留中文）。 */
export function slug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

/** 一个 md 文件里所有标题的锚点（重复标题按 GitHub 规则加 -1、-2）。 */
export function anchors(md) {
  const seen = new Map();
  const out = new Set();
  for (const line of blankFences(md)) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const base = slug(m[1]);
    const n = seen.get(base) ?? 0;
    out.add(n ? `${base}-${n}` : base);
    seen.set(base, n + 1);
  }
  return out;
}

/** 二级标题列表。 */
export const h2s = (md) => blankFences(md).map((l) => l.match(/^##\s+(.+?)\s*$/)?.[1]).filter(Boolean);

/** 返回 [起始行, 结束行) ，即某个标题到下一个同级或更高级标题之前。行号从 0 开始。 */
export function sectionRange(lines, heading) {
  const level = heading.match(/^#+/)[0].length;
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return [start, end];
}
