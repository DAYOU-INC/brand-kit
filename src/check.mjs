// brand-kit check：校验一个品牌库。规则说明见 docs/令牌规范.md、docs/品牌规范写法.md。
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  NS, loadRepoConfig, readText, REQUIRED_SECTIONS, BANNED_STATUS_WORDS, NAMES_SECTION, CONTRAST_START, NOT_HUMAN,
} from './config.mjs';
import { validateTokens, hexOf, realDate } from './tokens.mjs';
import { evaluateChecks, findContrastBlock } from './contrast.mjs';
import {
  blankFences, fenceMask, blankComments, stripInline, anchors, h2s, sectionRange, linkTargets, existsExact, safeDecode,
} from './markdown.mjs';
import { renderBrand, renderBrandMd } from './build.mjs';

const FILE_EXT = /\.(md|json|png|jpe?g|webp|svg|pdf|mjs|js|css|dart|ai|psd|mp4|txt|html)$/i;
/** 模板占位符：尖括号里有中文、省略号或 YYYY；不把 <br>、<https://…> 这类当成占位符。 */
const PLACEHOLDER = /<(?!https?:|mailto:|\/?[a-z][a-z0-9]*\s*\/?>)[^<>\n]*?(?:[一-鿿]|…|YYYY)[^<>\n]*>/;

const schemaDir = new URL('../schemas/', import.meta.url);
const ajv = new Ajv2020({ allErrors: true, strict: false });
const schemas = Object.fromEntries(['tokens', 'checks'].map((n) => [n, ajv.compile(JSON.parse(readFileSync(new URL(`${n}.schema.json`, schemaDir), 'utf8')))]));
const schemaErrors = (name, data) => (schemas[name](data) ? [] : schemas[name].errors.map((e) => `结构不符合 schemas/${name}.schema.json：${e.instancePath || '(根)'} ${e.message}${e.params?.additionalProperty ? `（${e.params.additionalProperty}）` : ''}`));

function walkMd(root, dir = '', out = []) {
  for (const d of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (['node_modules', '.git', '.work', 'build'].includes(d.name) || d.name.startsWith('.build-tmp')) continue;
    const p = dir ? `${dir}/${d.name}` : d.name;
    if (d.isDirectory()) walkMd(root, p, out); else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}

/** 校验整个品牌库，返回 { errors: string[], brands }。 */
export async function checkRepo(root, { allowPlaceholders = false } = {}) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  let cfg;
  try { cfg = loadRepoConfig(root); } catch (e) { return { errors: [e.message], brands: [] }; }
  const brands = cfg.brands;
  const read = (p) => readText(join(root, p));
  const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

  // 0. 没登记的品牌目录、build 里多余的目录
  for (const d of readdirSync(root, { withFileTypes: true })) {
    if (d.isDirectory() && existsSync(join(root, d.name, 'tokens.json')) && !brands.includes(d.name)) err(d.name, '有 tokens.json 但没有登记在 brand-kit.json 的 brands 里');
  }
  if (isDir(join(root, 'build'))) {
    for (const d of readdirSync(join(root, 'build'), { withFileTypes: true })) {
      if (d.isDirectory() && !brands.includes(d.name)) err(`build/${d.name}`, '不是已登记的品牌，运行 brand-kit build 清理');
    }
  }

  for (const brand of brands) {
    for (const f of ['brand.md', 'tokens.json', 'checks.json', 'source-index.md']) if (!existsExact(root, root, `${brand}/${f}`)) err(brand, `缺少 ${f}`);
    for (const d of ['assets', 'examples']) if (!isDir(join(root, brand, d))) err(brand, `缺少 ${d}/ 目录（可以先放一个 .gitkeep）`);
    if (!existsSync(join(root, brand, 'tokens.json'))) continue;

    // 1. 令牌
    let raw;
    try { raw = JSON.parse(read(`${brand}/tokens.json`)); } catch (e) { err(`${brand}/tokens.json`, `JSON 格式错误：${e.message}`); continue; }
    for (const m of schemaErrors('tokens', raw)) err(`${brand}/tokens.json`, m);
    const info = validateTokens(raw);
    for (const e of info.errors) err(`${brand}/tokens.json ${e.token}`, e.msg);

    // 2. checks.json
    let checks = null;
    if (existsSync(join(root, brand, 'checks.json'))) {
      try { checks = JSON.parse(read(`${brand}/checks.json`)); } catch (e) { err(`${brand}/checks.json`, `JSON 格式错误：${e.message}`); }
    }
    if (checks) {
      for (const m of schemaErrors('checks', checks)) err(`${brand}/checks.json`, m);
      for (const m of evaluateChecks(checks, info).errors) err(`${brand}/checks.json`, m);
    }
    const extra = new Map(Object.entries(checks?.extraColors ?? {}).map(([h, why]) => [h.toUpperCase(), why]));
    const forbidden = (checks?.names?.forbidden ?? []).filter((f) => typeof f?.term === 'string' && f.term);
    const hasForbidden = (s) => forbidden.find((f) => s.toLowerCase().includes(f.term.toLowerCase()));

    // 令牌里没填的占位符、禁用的名字
    for (const [name, t] of info.tokens) {
      const texts = [t.$description, t.$extensions?.[NS]?.source, t.$extensions?.[NS]?.pendingReason, JSON.stringify(t.$value)].filter((x) => typeof x === 'string');
      const joined = texts.join(' ');
      if (!allowPlaceholders && PLACEHOLDER.test(joined)) err(`${brand}/tokens.json ${name}`, `还有没填的占位符：${joined.match(PLACEHOLDER)[0]}`);
      const f = typeof t.$description === 'string' && hasForbidden(t.$description);
      if (f) err(`${brand}/tokens.json ${name}`, `描述里用了禁用的名字“${f.term}”，改成“${f.use}”`);
    }

    // 3. brand.md
    if (!existsSync(join(root, brand, 'brand.md'))) continue;
    const md = read(`${brand}/brand.md`);
    const where = (i) => `${brand}/brand.md:${i + 1}`;

    const sections = h2s(md);
    const missing = REQUIRED_SECTIONS.filter((s) => !sections.includes(s));
    if (missing.length) err(`${brand}/brand.md`, `缺少二级标题：${missing.map((s) => `“## ${s}”`).join('、')}`);
    else if (sections.filter((s) => REQUIRED_SECTIONS.includes(s)).join('|') !== REQUIRED_SECTIONS.join('|')) err(`${brand}/brand.md`, `二级标题顺序要和模板一致：${REQUIRED_SECTIONS.join(' → ')}`);

    const rawLines = md.split('\n');
    const inCode = fenceMask(md);
    const noComment = blankComments(rawLines);
    const namesRange = sectionRange(rawLines, NAMES_SECTION);
    if (!namesRange) err(`${brand}/brand.md`, `缺少“${NAMES_SECTION}”一节`);
    const contrastBlock = findContrastBlock(md);
    if (!contrastBlock) err(`${brand}/brand.md`, `第 3.2 节要放自动生成的对比度表：写一行 ${CONTRAST_START} 和结束标记，再运行 brand-kit build`);

    const tokenByHex = new Map();
    for (const [name, t] of info.tokens) {
      if (t.$type !== 'color') continue;
      const h = hexOf(info.resolved.get(name));
      if (!h) continue;
      if (!tokenByHex.has(h)) tokenByHex.set(h, []);
      tokenByHex.get(h).push(name);
    }
    const topGroups = Object.keys(raw).filter((k) => !k.startsWith('$'));
    const allNames = [...info.tokens.keys(), ...info.groups];
    const lastSegments = new Set(allNames.map((n) => n.split('.').at(-1)));
    const usedExtra = new Set();

    rawLines.forEach((line, i) => {
      // 3.1 色值：必须是令牌值或登记的例外；正文里同一行还要写出令牌全名（代码块里不要求）
      const scan = line.replace(/\]\([^)]*\)/g, ']()');
      for (const hex of scan.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []) {
        const len = hex.length - 1;
        if (![3, 4, 6, 8].includes(len) || (len !== 6 && /^#\d+$/.test(hex))) continue;
        const H = hex.toUpperCase();
        if (len !== 6) { err(where(i), `色值 ${hex} 要写成 6 位 #RRGGBB`); continue; }
        if (extra.has(H)) { usedExtra.add(H); continue; }
        const names = tokenByHex.get(H);
        if (!names) { err(where(i), `色值 ${hex} 不是任何令牌的值。先加令牌，或在 checks.json 的 extraColors 写明原因`); continue; }
        if (!inCode[i] && !names.some((n) => line.includes(`\`${n}\``))) err(where(i), `色值 ${hex} 旁边要写令牌全名（${names.map((n) => `\`${n}\``).join(' 或 ')}）`);
      }
      if (inCode[i]) return;
      // 3.2 反引号里的令牌名
      for (const [, name] of noComment[i].matchAll(/`([^`\s]+)`/g)) {
        if (FILE_EXT.test(name) || name.includes('/')) continue;
        const lower = name.toLowerCase();
        const head = lower.split('.')[0];
        if (topGroups.includes(head) && name.includes('.')) {
          if (name !== lower) { err(where(i), `令牌名要全小写：${name}`); continue; }
          if (name.includes('*')) {
            const re = new RegExp('^' + name.replace(/[.]/g, '\\.').replace(/\*/g, '[a-z0-9-]*') + '$');
            if (!allNames.some((n) => re.test(n))) err(where(i), `令牌名 ${name} 一个令牌都匹配不到`);
          } else if (!allNames.includes(name)) err(where(i), `令牌名 ${name} 不存在`);
        } else if (/^[a-z][a-z0-9-]*(\.[a-z0-9*-]+)*$/.test(name) && !topGroups.includes(name)) {
          const tail = name.replace(/\.\*$/, '');
          if (allNames.some((n) => n.endsWith('.' + tail))) err(where(i), `令牌名要写全名，不要简写：${name}`);
          else if (!name.includes('.') && lastSegments.has(name)) err(where(i), `令牌名要写全名，不要简写：${name}`);
        }
      }
    });
    for (const h of extra.keys()) if (!usedExtra.has(h)) err(`${brand}/checks.json`, `extraColors 里的 ${h} 在 brand.md 里没有出现，删掉这条登记`);

    // 3.3 文字规则：状态说法（正文）、占位符和禁用名字（正文和代码块都查）
    const prose = blankComments(blankFences(md));
    rawLines.forEach((line, i) => {
      if (!inCode[i]) {
        const text = stripInline(noComment[i]);
        for (const w of BANNED_STATUS_WORDS) if (text.toLowerCase().includes(w.toLowerCase())) err(where(i), `“${w}”不是规定的状态说法，只能用「已确认」「按现状执行」「待处理」`);
        if (/\|\s*确定\s*\|/.test(prose[i])) err(where(i), '状态写“确定”有歧义，改成「已确认」（要有确认人）或「按现状执行」');
      }
      const ph = noComment[i].match(PLACEHOLDER);
      if (!allowPlaceholders && ph) err(where(i), `还有没填的占位符：${ph[0]}`);
      const inNames = namesRange && i >= namesRange[0] && i < namesRange[1];
      const f = !inNames && hasForbidden(noComment[i]);
      if (f) err(where(i), `用了禁用的名字“${f.term}”，改成“${f.use}”`);
    });

    // 3.4 变更记录
    const cl = sectionRange(rawLines, '## 变更记录');
    if (cl) {
      const rows = [];
      for (let i = cl[0] + 1; i < cl[1]; i++) if (rawLines[i].trim().startsWith('|')) rows.push(i);
      if (rawLines[rows[0]]?.replace(/\s/g, '') !== '|日期|变更|确认|') err(`${brand}/brand.md`, '变更记录的表头要是“| 日期 | 变更 | 确认 |”');
      if (!/^\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|$/.test(rawLines[rows[1]]?.trim() ?? '')) err(`${brand}/brand.md`, '变更记录表头下面要有分隔行“|---|---|---|”');
      if (rows.length < 3) err(`${brand}/brand.md`, '变更记录至少要有一行');
      const isPh = (c) => allowPlaceholders && /^<[^<>]+>$/.test(c);
      for (const i of rows.slice(2)) {
        const cells = rawLines[i].split('|').slice(1, -1).map((c) => c.trim());
        if (cells.length !== 3) { err(where(i), '变更记录每行要有 3 列'); continue; }
        if (!realDate(cells[0]) && !isPh(cells[0])) err(where(i), '变更记录的日期要写成真实的 YYYY-MM-DD');
        const c = cells[2];
        const m = c.match(/^([^，,]+)[，,]([^，,]+)[，,]\s*(\d{4}-\d{2}-\d{2})$/);
        if (c !== '未确认' && !(m && realDate(m[3]))) err(where(i), '变更记录的“确认”只能写“未确认”，或“确认人，渠道，YYYY-MM-DD”');
        else if (m && NOT_HUMAN.test(m[1])) err(where(i), '变更记录的确认人必须是人；AI 和推断不能算确认');
      }
    }

    // 3.5 生成的内容是不是最新
    if (!info.errors.length && checks && !evaluateChecks(checks, info).errors.length) {
      try {
        if (contrastBlock && renderBrandMd(root, brand).replace(/^﻿/, '').replace(/\r\n/g, '\n') !== md) err(`${brand}/brand.md`, '第 3.2 节的对比度表和 checks.json 不一致，运行 brand-kit build');
        const files = renderBrand(root, brand);
        const dir = join(root, 'build', brand);
        for (const [f, content] of files) {
          const p = join(dir, f);
          if (!existsSync(p)) err(`build/${brand}/${f}`, '还没生成，运行 brand-kit build');
          else if (readText(p) !== content) err(`build/${brand}/${f}`, '和 tokens.json 不一致，运行 brand-kit build');
        }
        if (isDir(dir)) for (const f of readdirSync(dir)) if (!files.has(f)) err(`build/${brand}/${f}`, '是多余的旧文件，运行 brand-kit build 清理');
      } catch (e) { err(brand, `生成失败：${e.message}`); }
    }
  }

  // 4. 所有 md：相对链接和锚点（大小写严格）；品牌目录里的 md：素材路径、占位符
  for (const file of walkMd(root)) {
    const md = read(file);
    const lines = blankFences(md);
    const brand = file.split('/')[0];
    const inBrand = brands.includes(brand);
    lines.forEach((line, i) => {
      for (const target of linkTargets(stripInline(line))) {
        if (/^(https?:|mailto:)/.test(target)) continue;
        const [pathPart, anchor] = target.split('#');
        const decoded = safeDecode(pathPart);
        if (decoded === null) { err(`${file}:${i + 1}`, `链接 ${target} 的地址格式不对`); continue; }
        const base = join(root, dirname(file));
        if (decoded && !existsExact(root, base, decoded)) { err(`${file}:${i + 1}`, `链接 ${target} 指向的文件不存在（注意大小写；不能指向品牌库外面）`); continue; }
        const targetFile = decoded ? join(base, decoded) : join(root, file);
        if (anchor && targetFile.endsWith('.md') && !anchors(readText(targetFile)).has(safeDecode(anchor))) err(`${file}:${i + 1}`, `链接 ${target} 的锚点 #${anchor} 不存在`);
      }
      if (!inBrand) return;
      for (const [, p] of line.matchAll(/`((?:assets|examples)\/[^`*<>]+)`/g)) {
        if (!existsExact(root, join(root, brand), p)) err(`${file}:${i + 1}`, `路径 ${p} 不存在（相对于 ${brand}/，注意大小写）`);
      }
    });
    if (inBrand && !file.endsWith('/brand.md') && !allowPlaceholders) {
      blankComments(md.split('\n')).forEach((line, i) => {
        const ph = line.match(PLACEHOLDER);
        if (ph) err(`${file}:${i + 1}`, `还有没填的占位符：${ph[0]}`);
      });
    }
  }

  return { errors, brands };
}
