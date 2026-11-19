// 令牌的读取、展开、引用解析和校验。格式说明见 docs/令牌规范.md。
import { NS, STATUSES, CHANNELS, TYPES, NAME_SEGMENT, NOT_HUMAN } from './config.mjs';

const REF = /^\{([^{}]+)\}$/;
export const isRef = (v) => typeof v === 'string' && REF.test(v);
const refName = (v) => v.match(REF)[1];
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const TOKEN_KEYS = ['$value', '$type', '$description', '$extensions', '$deprecated'];
const GROUP_KEYS = ['$type', '$description', '$extensions', '$deprecated', '$schema'];

/**
 * 把令牌树展开成 Map<全名, 令牌>。$type 和分组上的 $deprecated 向下继承。
 * 结构问题（名字不合法、漏写 $value、空分组、不支持的 $ 字段）记进 problems。
 */
export function flatten(node, path = [], inherited = {}, out = new Map(), groups = new Set(), problems = []) {
  const where = path.join('.') || '(根)';
  for (const k of Object.keys(node)) {
    if (k.startsWith('$') && !GROUP_KEYS.includes(k) && !(path.length === 0 && k === '$description')) {
      problems.push({ token: where, msg: k === '$root' ? '不支持 $root 令牌（brand-kit 只支持 DTCG 2025.10 的子集），改成普通令牌' : `分组上不认识的字段 "${k}"` });
    }
  }
  const children = Object.entries(node).filter(([k]) => !k.startsWith('$'));
  if (path.length && children.length === 0) {
    problems.push({ token: where, msg: isObj(node.$extensions?.[NS]) || node.$description ? '看起来是令牌但漏写了 $value' : '空分组，没有任何令牌' });
  }
  for (const [k, v] of children) {
    const name = [...path, k].join('.');
    if (!NAME_SEGMENT.test(k)) problems.push({ token: name, msg: `名字“${k}”不合法：只能用小写字母、数字和单个连字符，以字母开头（如 accent-light）` });
    if (!isObj(v)) { problems.push({ token: name, msg: '令牌和分组都必须是对象' }); continue; }
    const type = v.$type ?? inherited.type;
    const deprecated = v.$deprecated ?? inherited.deprecated;
    if ('$value' in v) {
      for (const key of Object.keys(v)) {
        if (!TOKEN_KEYS.includes(key)) problems.push({ token: name, msg: key.startsWith('$') ? `令牌上不认识的字段 "${key}"（拼错了？）` : `令牌里不能再嵌套 "${key}"` });
      }
      out.set(name, { ...v, $type: type, ...(deprecated !== undefined ? { $deprecated: deprecated } : {}) });
    } else {
      groups.add(name);
      flatten(v, [...path, k], { type, deprecated }, out, groups, problems);
    }
  }
  return { tokens: out, groups, problems };
}

/** 解析引用，返回最终值。出错时抛异常。 */
export function resolve(tokens, value, seen = []) {
  if (isRef(value)) {
    const name = refName(value);
    if (seen.includes(name)) throw new Error(`循环引用：${[...seen, name].join(' → ')}`);
    const t = tokens.get(name);
    if (!t) throw new Error(`引用了不存在的令牌 {${name}}`);
    return resolve(tokens, t.$value, [...seen, name]);
  }
  if (Array.isArray(value)) return value.map((v) => resolve(tokens, v, seen));
  if (isObj(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(tokens, v, seen)]));
  return value;
}

/** 一个值里直接引用到的令牌名。 */
export function directRefs(value, out = []) {
  if (isRef(value)) out.push(refName(value));
  else if (Array.isArray(value)) value.forEach((v) => directRefs(v, out));
  else if (isObj(value)) Object.values(value).forEach((v) => directRefs(v, out));
  return out;
}

export const ext = (t) => t.$extensions?.[NS] ?? {};
export const hexOf = (colorValue) => (isObj(colorValue) && typeof colorValue.hex === 'string' ? colorValue.hex.toUpperCase() : undefined);

/** 由 #RRGGBB 生成 DTCG 2025.10 颜色对象（分量保留 4 位小数）。 */
export function colorObject(hex) {
  const comps = [1, 3, 5].map((i) => Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 10000) / 10000);
  return { colorSpace: 'srgb', components: comps, hex: hex.toLowerCase() };
}

/** CSS 变量名后缀和 Dart 常量名（两种生成规则都要唯一）。 */
export const cssName = (name) => name.split('.').join('-');
export const dartName = (name) => name.split(/[.-]/).filter(Boolean).map((s, i) => (i === 0 ? s : s[0].toUpperCase() + s.slice(1))).join('');

function checkColor(v, say) {
  if (!isObj(v)) return say('颜色要写成对象 {"colorSpace":"srgb","components":[r,g,b],"hex":"#rrggbb"}（DTCG 2025.10）');
  for (const k of Object.keys(v)) if (!['colorSpace', 'components', 'hex'].includes(k)) say(k === 'alpha' ? '不支持 alpha（透明度会影响对比度判断）；需要半透明时在用到的地方另行说明' : `颜色对象里不认识的字段 "${k}"`);
  if (v.colorSpace !== 'srgb') say(`colorSpace 只支持 "srgb"，现在是 ${JSON.stringify(v.colorSpace)}`);
  if (!Array.isArray(v.components) || v.components.length !== 3 || !v.components.every((c) => typeof c === 'number' && c >= 0 && c <= 1)) {
    return say('components 要是 3 个 0–1 之间的数字');
  }
  if (typeof v.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v.hex)) return say('hex 要写成 #rrggbb');
  const bytes = [1, 3, 5].map((i) => parseInt(v.hex.slice(i, i + 2), 16));
  v.components.forEach((c, i) => {
    if (Math.abs(Math.round(c * 255) - bytes[i]) > 1) say(`components[${i}] = ${c}（×255 ≈ ${Math.round(c * 255)}）和 hex ${v.hex} 的 ${bytes[i]} 对不上`);
  });
}

function checkValue(type, v, say) {
  switch (type) {
    case 'color': return checkColor(v, say);
    case 'dimension':
      if (!isObj(v) || typeof v.value !== 'number' || !['px', 'rem'].includes(v.unit) || Object.keys(v).length !== 2) say('尺寸要写成 {"value": 数字, "unit": "px" 或 "rem"}');
      return;
    case 'fontFamily': {
      const list = Array.isArray(v) ? v : [v];
      if (!list.length || !list.every((f) => typeof f === 'string' && f.trim())) return say('字体要写成字符串或非空字符串数组');
      if (list.some((f) => /["\\;{}]/.test(f))) say('字体名里不能有 " \\ ; { }');
      return;
    }
    case 'fontWeight':
      if (!(Number.isInteger(v) && v >= 100 && v <= 900 && v % 100 === 0)) say('字重要写成 100–900 之间的整百数字');
      return;
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) say('要写成数字');
      return;
    case 'gradient':
      if (!Array.isArray(v) || v.length < 2) return say('渐变要写成至少 2 个 {color, position} 的数组');
      v.forEach((s, i) => {
        if (!isObj(s)) return say(`渐变第 ${i + 1} 个色标不是对象`);
        checkColor(s.color, (m) => say(`渐变第 ${i + 1} 个色标：${m}`));
        if (!(typeof s.position === 'number' && s.position >= 0 && s.position <= 1)) say(`渐变第 ${i + 1} 个色标的 position 要在 0–1 之间`);
        if (i > 0 && s.position < v[i - 1].position) say('渐变色标的 position 要从小到大');
      });
      return;
    default:
  }
}

/** 真实存在、且不晚于今天（按 UTC+14 留余量）的 YYYY-MM-DD。 */
const realDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s ?? '')) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  return d.getTime() <= Date.now() + 14 * 3600 * 1000;
};
export { realDate };

/** Dart 的保留字，生成的常量名不能是这些。 */
const DART_RESERVED = new Set(['abstract', 'as', 'assert', 'async', 'await', 'base', 'break', 'case', 'catch', 'class', 'const', 'continue', 'covariant', 'default', 'deferred', 'do', 'dynamic', 'else', 'enum', 'export', 'extends', 'extension', 'external', 'factory', 'false', 'final', 'finally', 'for', 'function', 'get', 'hide', 'if', 'implements', 'import', 'in', 'interface', 'is', 'late', 'library', 'mixin', 'new', 'null', 'of', 'on', 'operator', 'part', 'required', 'rethrow', 'return', 'sealed', 'set', 'show', 'static', 'super', 'switch', 'sync', 'this', 'throw', 'true', 'try', 'type', 'typedef', 'var', 'void', 'when', 'while', 'with', 'yield']);

const EXT_KEYS = ['status', 'channels', 'source', 'confirmedBy', 'confirmedAt', 'pendingReason', 'angle', 'print'];

/** 校验整份令牌，返回 { tokens, groups, resolved, errors }。errors 每条是 { token, msg }。 */
export function validateTokens(raw) {
  const errors = [];
  if (!isObj(raw)) return { tokens: new Map(), groups: new Set(), resolved: new Map(), errors: [{ token: '(根)', msg: '令牌文件的顶层要是对象' }] };
  const { tokens, groups, problems } = flatten(raw);
  errors.push(...problems);
  const resolved = new Map();
  if (tokens.size === 0) errors.push({ token: '(根)', msg: '一个令牌都没有' });

  for (const [name, t] of tokens) {
    const say = (msg) => errors.push({ token: name, msg });
    if (!t.$type) say('没有 $type（自己或上级分组都没写）');
    else if (!TYPES.includes(t.$type)) say(`不支持的 $type "${t.$type}"，只能是 ${TYPES.join(' / ')}`);
    if (typeof t.$description !== 'string' || !t.$description.trim()) say('缺少 $description：写清楚用在哪里、注意什么');
    if (t.$deprecated !== undefined && typeof t.$deprecated !== 'boolean' && typeof t.$deprecated !== 'string') say('$deprecated 只能是 true/false 或一句说明');

    if (!isObj(t.$extensions?.[NS])) say(`缺少 $extensions["${NS}"]（status、channels、source 必填）`);
    else {
      const e = t.$extensions[NS];
      for (const k of Object.keys(e)) if (!EXT_KEYS.includes(k)) say(`扩展里不认识的字段 "${k}"（拼错了？）`);
      if (!STATUSES.includes(e.status)) say(`status 必填，只能是 ${STATUSES.join(' / ')}，现在是 ${JSON.stringify(e.status)}`);
      if (!Array.isArray(e.channels) || !e.channels.every((c) => CHANNELS.includes(c))) say(`channels 必填，是 ${CHANNELS.join(' / ')} 的子集（空数组表示只记录、不导出）`);
      else if (new Set(e.channels).size !== e.channels.length) say('channels 有重复');
      if (typeof e.source !== 'string' || !e.source.trim()) say('source 必填：写出处（素材路径、实测方法，或“通用值”）');
      if (e.status === 'confirmed') {
        if (typeof e.confirmedBy !== 'string' || !e.confirmedBy.trim()) say('status 是 confirmed 时，confirmedBy 必填（确认人和渠道）');
        else if (NOT_HUMAN.test(e.confirmedBy)) say('confirmedBy 必须是人；AI 和推断不能算确认');
        if (!realDate(e.confirmedAt)) say('status 是 confirmed 时，confirmedAt 必填，且要是真实存在、不晚于今天的日期 YYYY-MM-DD');
        if ('pendingReason' in e) say('status 是 confirmed 时不能再有 pendingReason');
      } else if ('confirmedBy' in e || 'confirmedAt' in e) say('只有 status 是 confirmed 时才写 confirmedBy / confirmedAt');
      if (e.status === 'pending' && (typeof e.pendingReason !== 'string' || !e.pendingReason.trim())) say('status 是 pending 时，pendingReason 必填（卡在什么问题上）');
      if (e.status === 'current' && 'pendingReason' in e) say('status 是 current 时不写 pendingReason');
      if (t.$type === 'gradient' ? typeof e.angle !== 'number' : 'angle' in e) say(t.$type === 'gradient' ? '渐变必须在扩展里写 angle（角度，90 = 从左到右，180 = 从上到下）' : '只有渐变才写 angle');
      if ('print' in e && (!isObj(e.print) || !Object.keys(e.print).every((k) => ['cmyk', 'pantone'].includes(k) && typeof e.print[k] === 'string' && e.print[k].trim()))) {
        say('print 要写成 {"cmyk": "…", "pantone": "…"}，只写已经确定的值；没定的不写这个字段');
      }
    }

    try {
      const v = resolve(tokens, t.$value);
      resolved.set(name, v);
      if (t.$type && TYPES.includes(t.$type)) checkValue(t.$type, v, say);
    } catch (err) { say(err.message); }

    const refs = directRefs(t.$value);
    if (isRef(t.$value) && t.$type === 'gradient') say('渐变不能整值引用另一个令牌');
    for (const r of refs) {
      const target = tokens.get(r);
      if (!target) continue;
      if (target.$deprecated && !t.$deprecated) say(`引用了已弃用的令牌 {${r}}`);
      const expected = t.$type === 'gradient' ? 'color' : t.$type;
      if (target.$type && expected && target.$type !== expected) say(`引用的 {${r}} 类型是 ${target.$type}，这里需要 ${expected}`);
      // 引用会把被引用的颜色带进本令牌的渠道（别名、渐变色标都一样），所以被引用的令牌必须覆盖本令牌的渠道
      const missing = (ext(t).channels ?? []).filter((c) => !(ext(target).channels ?? []).includes(c));
      if (missing.length) say(`导出到 ${missing.join('、')}，但引用的 {${r}} 没有导出到这些渠道（被引用的令牌，渠道要覆盖引用它的令牌）`);
    }
  }

  // 生成后的名字不能撞车，Dart 名不能是保留字
  for (const name of tokens.keys()) if (DART_RESERVED.has(dartName(name))) errors.push({ token: name, msg: `生成的 Dart 常量名“${dartName(name)}”是 Dart 保留字，换个名字` });
  for (const [label, fn] of [['CSS 变量名', cssName], ['Dart 常量名', dartName]]) {
    const seen = new Map();
    for (const name of tokens.keys()) {
      const n = fn(name);
      if (seen.has(n)) errors.push({ token: name, msg: `和 ${seen.get(n)} 生成的${label}相同（${n}）` });
      else seen.set(n, name);
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
