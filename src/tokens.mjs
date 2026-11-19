// 令牌的读取、展开、引用解析和校验。格式说明见 docs/令牌规范.md。
import { NS, STATUSES, CHANNELS, TYPES } from './config.mjs';

const REF = /^\{([^{}]+)\}$/;
export const isRef = (v) => typeof v === 'string' && REF.test(v);
const refName = (v) => v.match(REF)[1];

/** 把嵌套的令牌树展开成 Map<路径, 令牌>，$type 从上级分组继承。 */
export function flatten(node, path = [], inheritedType, out = new Map(), groups = new Set()) {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      out.set([...path, k].join('.'), { $invalid: `“${k}” 不是对象，令牌和分组都必须是对象` });
      continue;
    }
    const p = [...path, k];
    const type = v.$type ?? inheritedType;
    if ('$value' in v) out.set(p.join('.'), { ...v, $type: type });
    else { groups.add(p.join('.')); flatten(v, p, type, out, groups); }
  }
  return { tokens: out, groups };
}

/** 解析引用，返回最终值。出错时抛异常。 */
export function resolve(tokens, value, seen = []) {
  if (isRef(value)) {
    const name = refName(value);
    if (seen.includes(name)) throw new Error(`循环引用：${[...seen, name].join(' → ')}`);
    const t = tokens.get(name);
    if (!t || t.$invalid) throw new Error(`引用了不存在的令牌 {${name}}`);
    return resolve(tokens, t.$value, [...seen, name]);
  }
  if (Array.isArray(value)) return value.map((v) => resolve(tokens, v, seen));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(tokens, v, seen)]));
  return value;
}

/** 收集一个值里直接引用到的令牌名（不递归）。 */
export function directRefs(value, out = []) {
  if (isRef(value)) out.push(refName(value));
  else if (Array.isArray(value)) value.forEach((v) => directRefs(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => directRefs(v, out));
  return out;
}

/** 由 #RRGGBB 生成 DTCG 2025.10 颜色对象（分量保留 4 位小数）。 */
export function colorObject(hex) {
  const comps = [1, 3, 5].map((i) => Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 10000) / 10000);
  return { colorSpace: 'srgb', components: comps, hex: hex.toLowerCase() };
}

export const ext = (t) => t.$extensions?.[NS] ?? {};
export const hexOf = (colorValue) => (colorValue && typeof colorValue === 'object' ? String(colorValue.hex).toUpperCase() : undefined);

function checkColor(v, say) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return say('颜色要写成对象 {"colorSpace":"srgb","components":[r,g,b],"hex":"#rrggbb"}（DTCG 2025.10）');
  if (v.colorSpace !== 'srgb') say(`colorSpace 只支持 "srgb"，现在是 ${JSON.stringify(v.colorSpace)}`);
  if (!Array.isArray(v.components) || v.components.length !== 3 || !v.components.every((c) => typeof c === 'number' && c >= 0 && c <= 1)) {
    return say('components 要是 3 个 0–1 之间的数字');
  }
  if (typeof v.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v.hex)) return say('hex 要写成 #rrggbb');
  const bytes = [1, 3, 5].map((i) => parseInt(v.hex.slice(i, i + 2), 16));
  v.components.forEach((c, i) => {
    if (Math.abs(Math.round(c * 255) - bytes[i]) > 1) say(`components[${i}] = ${c}（×255 ≈ ${Math.round(c * 255)}）和 hex ${v.hex} 的 ${bytes[i]} 对不上`);
  });
  if ('alpha' in v && !(typeof v.alpha === 'number' && v.alpha >= 0 && v.alpha <= 1)) say('alpha 要是 0–1 之间的数字');
}

function checkValue(type, v, say, tokens) {
  switch (type) {
    case 'color': return checkColor(v, say);
    case 'dimension':
      if (typeof v !== 'object' || v === null || typeof v.value !== 'number' || !['px', 'rem'].includes(v.unit)) say('尺寸要写成 {"value": 数字, "unit": "px" 或 "rem"}');
      return;
    case 'fontFamily':
      if (!(typeof v === 'string' && v.trim()) && !(Array.isArray(v) && v.length && v.every((f) => typeof f === 'string' && f.trim()))) say('字体要写成字符串或非空字符串数组');
      return;
    case 'fontWeight':
      if (!(typeof v === 'number' && v >= 1 && v <= 1000)) say('字重要写成 1–1000 的数字');
      return;
    case 'number':
      if (typeof v !== 'number') say('要写成数字');
      return;
    case 'gradient':
      if (!Array.isArray(v) || v.length < 2) return say('渐变要写成至少 2 个 {color, position} 的数组');
      v.forEach((s, i) => {
        if (typeof s !== 'object' || s === null) return say(`渐变第 ${i + 1} 个色标不是对象`);
        checkColor(s.color, (m) => say(`渐变第 ${i + 1} 个色标：${m}`));
        if (!(typeof s.position === 'number' && s.position >= 0 && s.position <= 1)) say(`渐变第 ${i + 1} 个色标的 position 要在 0–1 之间`);
        if (i > 0 && s.position < v[i - 1].position) say('渐变色标的 position 要从小到大');
      });
      return;
    default:
  }
}

/**
 * 校验整份令牌，返回 { tokens, resolved, errors }。
 * errors 每条是 { token, msg }。
 */
export function validateTokens(raw) {
  const errors = [];
  const { tokens, groups } = flatten(raw);
  const resolved = new Map();
  if (tokens.size === 0) errors.push({ token: '(全部)', msg: '一个令牌都没有' });
  for (const [name, t] of tokens) {
    const say = (msg) => errors.push({ token: name, msg });
    if (t.$invalid) { say(t.$invalid); continue; }
    if (!t.$type) say('没有 $type（自己或上级分组都没写）');
    else if (!TYPES.includes(t.$type)) say(`不支持的 $type "${t.$type}"，只能是 ${TYPES.join(' / ')}`);
    if (typeof t.$description !== 'string' || !t.$description.trim()) say('缺少 $description：写清楚用在哪里、注意什么');

    const e = ext(t);
    if (!t.$extensions?.[NS]) say(`缺少 $extensions["${NS}"]（status、channels、source 必填）`);
    else {
      if (!STATUSES.includes(e.status)) say(`status 必填，只能是 ${STATUSES.join(' / ')}，现在是 ${JSON.stringify(e.status)}`);
      if (!Array.isArray(e.channels) || !e.channels.every((c) => CHANNELS.includes(c))) say(`channels 必填，是 ${CHANNELS.join(' / ')} 的子集（空数组表示只记录、不导出）`);
      else if (new Set(e.channels).size !== e.channels.length) say('channels 有重复');
      if (typeof e.source !== 'string' || !e.source.trim()) say('source 必填：写出处（素材路径、实测方法，或“通用值”）');
      if (e.status === 'confirmed') {
        if (typeof e.confirmedBy !== 'string' || !e.confirmedBy.trim()) say('status 是 confirmed 时，confirmedBy 必填（确认人和渠道）');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e.confirmedAt ?? '')) say('status 是 confirmed 时，confirmedAt 必填（YYYY-MM-DD）');
      }
      if (e.status === 'pending' && (typeof e.pendingReason !== 'string' || !e.pendingReason.trim())) say('status 是 pending 时，pendingReason 必填（卡在什么问题上）');
      if (t.$type === 'gradient' && typeof e.angle !== 'number') say('渐变必须在扩展里写 angle（角度，90 = 从左到右，180 = 从上到下）');
    }

    try {
      const v = resolve(tokens, t.$value);
      resolved.set(name, v);
      if (t.$type) checkValue(t.$type, v, say, tokens);
    } catch (err) { say(err.message); }

    for (const r of directRefs(t.$value)) {
      const target = tokens.get(r);
      if (!target || target.$invalid) continue;
      if (target.$deprecated && !t.$deprecated) say(`引用了已弃用的令牌 {${r}}`);
      if (target.$type && t.$type && target.$type !== t.$type && !(t.$type === 'gradient' && target.$type === 'color')) say(`引用的 {${r}} 类型是 ${target.$type}，和本令牌的 ${t.$type} 不一致`);
      const mine = ext(t).channels ?? [];
      const theirs = ext(target).channels ?? [];
      const missing = mine.filter((c) => ['web', 'app'].includes(c) && !theirs.includes(c));
      if (missing.length) say(`导出到 ${missing.join('、')}，但引用的 {${r}} 没有导出到这些渠道，生成的文件会引用不存在的变量`);
    }
  }
  return { tokens, groups, resolved, errors };
}

/** WCAG 2.x 相对亮度和对比度。 */
export function contrastRatio(hexA, hexB) {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [l1, l2] = [lum(hexA), lum(hexB)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
