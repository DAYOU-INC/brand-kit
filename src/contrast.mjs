// checks.json 的校验，以及 brand.md 第 3.2 节对比度表的生成。
import { CONTRAST_USAGE, CONTRAST_START, CONTRAST_END } from './config.mjs';
import { contrastRatio, hexOf } from './tokens.mjs';

const KNOWN_KEYS = ['$schema', '$description', 'contrast', 'extraColors', 'names'];

/** 校验 checks.json 的结构和对比度，返回错误字符串数组；同时返回算好的对比度行。 */
export function evaluateChecks(checks, tokensInfo) {
  const errors = [];
  const rows = [];
  const say = (m) => errors.push(m);
  for (const k of Object.keys(checks)) if (!KNOWN_KEYS.includes(k)) say(`不认识的字段 "${k}"，只能有 ${KNOWN_KEYS.join('、')}`);
  if (!Array.isArray(checks.contrast)) say('contrast 必填，是数组');
  if (checks.extraColors !== undefined && (typeof checks.extraColors !== 'object' || Array.isArray(checks.extraColors))) say('extraColors 要是对象 {"#RRGGBB": "原因"}');
  for (const [hex, why] of Object.entries(checks.extraColors ?? {})) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) say(`extraColors 的键 "${hex}" 要写成 #RRGGBB`);
    if (typeof why !== 'string' || !why.trim()) say(`extraColors ${hex} 要写原因`);
  }
  const forb = checks.names?.forbidden;
  if (checks.names !== undefined && (!Array.isArray(forb) || !forb.every((f) => typeof f?.term === 'string' && f.term && typeof f?.use === 'string'))) {
    say('names.forbidden 要是 [{"term": "旧名", "use": "应该用什么"}] 数组');
  }

  const seen = new Set();
  for (const [i, c] of (Array.isArray(checks.contrast) ? checks.contrast : []).entries()) {
    const where = `contrast 第 ${i + 1} 条`;
    if (typeof c !== 'object' || c === null) { say(`${where} 不是对象`); continue; }
    for (const k of Object.keys(c)) if (!['fg', 'bg', 'usage', 'note'].includes(k)) say(`${where} 有不认识的字段 "${k}"`);
    if (!(c.usage in CONTRAST_USAGE)) { say(`${where} 的 usage 必填，只能是 ${Object.keys(CONTRAST_USAGE).join(' / ')}`); continue; }
    const key = `${c.fg}|${c.bg}`;
    if (seen.has(key)) say(`${where} 和前面重复（${c.fg} 在 ${c.bg} 上）`);
    seen.add(key);
    const hex = {};
    for (const side of ['fg', 'bg']) {
      const t = tokensInfo.tokens.get(c[side]);
      if (!t) { say(`${where} 的 ${side} 令牌 ${c[side]} 不存在`); continue; }
      if (t.$type !== 'color') { say(`${where} 的 ${side} 令牌 ${c[side]} 不是颜色`); continue; }
      hex[side] = hexOf(tokensInfo.resolved.get(c[side]));
    }
    if (!hex.fg || !hex.bg) continue;
    const ratio = contrastRatio(hex.fg, hex.bg);
    const rule = CONTRAST_USAGE[c.usage];
    if (rule.min !== null && ratio < rule.min) say(`${c.fg} 在 ${c.bg} 上只有 ${ratio.toFixed(2)}:1，用途 ${c.usage} 要求 ≥ ${rule.min}`);
    if (c.usage === 'forbidden-text' && ratio >= 4.5) say(`${c.fg} 在 ${c.bg} 上已经有 ${ratio.toFixed(2)}:1，不需要标为 forbidden-text`);
    rows.push({ ...c, hexFg: hex.fg, hexBg: hex.bg, ratio });
  }
  return { errors, rows };
}

/** 生成对比度表（含起止标记）。 */
export function contrastTable(rows) {
  const lines = [
    CONTRAST_START,
    '| 文字 / 图形 | 底色 | 对比度 | 规则 | 说明 |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| \`${r.fg}\` ${r.hexFg} | \`${r.bg}\` ${r.hexBg} | ${r.ratio.toFixed(2)}:1 | ${CONTRAST_USAGE[r.usage].label} | ${r.note ?? ''} |`),
    CONTRAST_END,
  ];
  return lines.join('\n');
}

/** 找到 brand.md 里的对比度表区块，返回 { start, end }（字符位置，含标记）或 null。 */
export function findContrastBlock(md) {
  const s = md.indexOf(CONTRAST_START);
  const e = md.indexOf(CONTRAST_END);
  if (s === -1 || e === -1 || e < s) return null;
  return { start: s, end: e + CONTRAST_END.length };
}
