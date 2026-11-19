// brand-kit check：校验一个品牌库。规则说明见 docs/令牌规范.md、docs/品牌规范写法.md。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  NS, loadRepoConfig, REQUIRED_SECTIONS, BANNED_STATUS_WORDS, NAMES_SECTION, CONTRAST_START,
} from './config.mjs';
import { validateTokens, hexOf } from './tokens.mjs';
import { evaluateChecks, findContrastBlock } from './contrast.mjs';
import { blankFences, blankComments, stripInline, anchors, h2s, sectionRange } from './markdown.mjs';
import { renderBrand, renderBrandMd } from './build.mjs';

const FILE_EXT = /\.(md|json|png|jpe?g|webp|svg|pdf|mjs|js|css|dart|ai|psd|mp4|txt)$/i;

function walkMd(root, dir = '', out = []) {
  for (const d of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (['node_modules', '.git', '.work', 'build'].includes(d.name)) continue;
    const p = dir ? `${dir}/${d.name}` : d.name;
    if (d.isDirectory()) walkMd(root, p, out); else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}

/** 校验整个品牌库，返回 { errors: string[], warnings: string[], brands }。 */
export async function checkRepo(root, { allowPlaceholders = false } = {}) {
  const errors = [];
  const warnings = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  let cfg;
  try { cfg = loadRepoConfig(root); } catch (e) { return { errors: [e.message], warnings, brands: [] }; }
  const brands = cfg.brands;
  const read = (p) => readFileSync(join(root, p), 'utf8');

  // 0. 没登记的品牌目录、build 里多余的目录
  for (const d of readdirSync(root, { withFileTypes: true })) {
    if (d.isDirectory() && existsSync(join(root, d.name, 'tokens.json')) && !brands.includes(d.name)) {
      err(d.name, '有 tokens.json 但没有登记在 brand-kit.json 的 brands 里');
    }
  }
  if (existsSync(join(root, 'build'))) {
    for (const d of readdirSync(join(root, 'build'))) if (!brands.includes(d)) err(`build/${d}`, '不是已登记的品牌，运行 brand-kit build 清理');
  }

  const tokenNamesAll = new Map();
  for (const brand of brands) {
    for (const f of ['brand.md', 'tokens.json', 'checks.json', 'source-index.md']) {
      if (!existsSync(join(root, brand, f))) err(brand, `缺少 ${f}`);
    }
    if (!existsSync(join(root, brand, 'tokens.json'))) continue;

    // 1. 令牌
    let raw;
    try { raw = JSON.parse(read(`${brand}/tokens.json`)); } catch (e) { err(`${brand}/tokens.json`, `JSON 格式错误：${e.message}`); continue; }
    const info = validateTokens(raw);
    for (const e of info.errors) err(`${brand}/tokens.json ${e.token}`, e.msg);
    tokenNamesAll.set(brand, info);

    // 2. checks.json
    let checks = { contrast: [] };
    if (existsSync(join(root, brand, 'checks.json'))) {
      try { checks = JSON.parse(read(`${brand}/checks.json`)); } catch (e) { err(`${brand}/checks.json`, `JSON 格式错误：${e.message}`); checks = null; }
    }
    if (checks) for (const m of evaluateChecks(checks, info).errors) err(`${brand}/checks.json`, m);
    const extra = new Set(Object.keys(checks?.extraColors ?? {}).map((h) => h.toUpperCase()));
    const forbidden = checks?.names?.forbidden ?? [];

    // 令牌里没填的占位符、禁用的名字
    for (const [name, t] of info.tokens) {
      if (!allowPlaceholders) {
        const texts = [t.$description, t.$extensions?.[NS]?.source, JSON.stringify(t.$value)].filter((x) => typeof x === 'string');
        const ph = texts.join(' ').match(/<[^<>\s!/][^<>]{0,30}>/);
        if (ph) err(`${brand}/tokens.json ${name}`, `还有没填的占位符：${ph[0]}`);
      }
      for (const f of forbidden) if (typeof t.$description === 'string' && t.$description.includes(f.term)) err(`${brand}/tokens.json ${name}`, `描述里用了禁用的名字“${f.term}”，改成“${f.use}”`);
    }

    // 3. brand.md
    if (!existsSync(join(root, brand, 'brand.md'))) continue;
    const md = read(`${brand}/brand.md`);
    const where = (i) => `${brand}/brand.md:${i + 1}`;

    const sections = h2s(md);
    const expected = REQUIRED_SECTIONS;
    const missing = expected.filter((s) => !sections.includes(s));
    if (missing.length) err(`${brand}/brand.md`, `缺少二级标题：${missing.map((s) => `“## ${s}”`).join('、')}`);
    const order = sections.filter((s) => expected.includes(s));
    if (!missing.length && order.join('|') !== expected.join('|')) err(`${brand}/brand.md`, `二级标题顺序要和模板一致：${expected.join(' → ')}`);

    // 去掉代码块和注释后的行，用于大部分文字规则；hex 规则也看代码块（提示词里不应出现令牌外的颜色）
    const rawLines = md.split('\n');
    const textLines = blankComments(blankFences(md));
    const namesRange = sectionRange(rawLines, NAMES_SECTION);
    const contrastBlock = findContrastBlock(md);

    if (!contrastBlock && md.includes('### 3.2')) err(`${brand}/brand.md`, `第 3.2 节要放自动生成的对比度表：写一行 ${CONTRAST_START} 和结束标记，再运行 brand-kit build`);

    const tokenByHex = new Map();
    for (const [name, t] of info.tokens) {
      if (t.$type !== 'color') continue;
      const h = hexOf(info.resolved.get(name));
      if (!h) continue;
      if (!tokenByHex.has(h)) tokenByHex.set(h, []);
      tokenByHex.get(h).push(name);
    }
    const topGroups = Object.keys(raw).filter((k) => !k.startsWith('$'));
    const allNames = [...info.tokens.keys()];

    rawLines.forEach((line, i) => {
      // 3.1 色值：必须是令牌值，同一行要写出对应的令牌全名；或者登记在 extraColors
      const scan = line.replace(/\]\([^)]*\)/g, ']()'); // 链接地址里的 #锚点 不算色值
      for (const hex of scan.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []) {
        const len = hex.length - 1;
        if (![3, 4, 6, 8].includes(len)) continue;
        if (len !== 6 && /^#\d+$/.test(hex)) continue; // #123 这类编号
        const H = hex.toUpperCase();
        if (H.length !== 7) { err(where(i), `色值 ${hex} 要写成 6 位 #RRGGBB`); continue; }
        if (extra.has(H)) continue;
        const names = tokenByHex.get(H);
        if (!names) { err(where(i), `色值 ${hex} 不是任何令牌的值。先加令牌，或在 checks.json 的 extraColors 写明原因`); continue; }
        if (!names.some((n) => line.includes(`\`${n}\``))) err(where(i), `色值 ${hex} 旁边要写令牌全名（${names.map((n) => `\`${n}\``).join(' 或 ')}）`);
      }
      // 3.2 反引号里的令牌名：全名必须存在（支持 *），不许用简写
      for (const [, name] of line.matchAll(/`([a-z][a-z0-9-]*(?:\.[a-z0-9*-]+)+)`/g)) {
        if (FILE_EXT.test(name)) continue;
        const head = name.split('.')[0];
        if (topGroups.includes(head)) {
          if (name.includes('*')) {
            const re = new RegExp('^' + name.replace(/[.]/g, '\\.').replace(/\*/g, '[a-z0-9-]*') + '$');
            if (!allNames.some((n) => re.test(n))) err(where(i), `令牌名 ${name} 一个令牌都匹配不到`);
          } else if (!info.tokens.has(name) && !info.groups.has(name)) err(where(i), `令牌名 ${name} 不存在`);
        } else if (allNames.some((n) => n.endsWith('.' + name.replace(/\*.*/, ''))) || [...info.groups].some((g) => g.endsWith('.' + name))) {
          err(where(i), `令牌名要写全名，不要简写：${name}`);
        }
      }
    });

    textLines.forEach((line, i) => {
      const plain = stripInline(line);
      // 3.3 状态说法
      for (const w of BANNED_STATUS_WORDS) if (plain.includes(w)) err(where(i), `“${w}”不是规定的状态说法，只能用「已确认」「按现状执行」「待处理」`);
      if (/\|\s*确定\s*\|/.test(plain)) err(where(i), '状态写“确定”有歧义，改成「已确认」（要有确认人）或「按现状执行」');
      // 3.4 模板占位符
      if (!allowPlaceholders && /<[^<>\s!/][^<>]{0,30}>/.test(plain)) err(where(i), `还有没填的占位符：${plain.match(/<[^<>\s!/][^<>]{0,30}>/)[0]}`);
      // 3.5 禁用的名字（第 1.1 节除外）
      const inNames = namesRange && i >= namesRange[0] && i < namesRange[1];
      if (!inNames) for (const f of forbidden) if (line.includes(f.term)) err(where(i), `用了禁用的名字“${f.term}”，改成“${f.use}”`);
    });

    // 3.6 变更记录
    const cl = sectionRange(rawLines, '## 变更记录');
    if (cl) {
      const rows = rawLines.slice(cl[0] + 1, cl[1]).filter((l) => l.trim().startsWith('|'));
      if (rows[0]?.replace(/\s/g, '') !== '|日期|变更|确认|') err(`${brand}/brand.md`, '变更记录的表头要是“| 日期 | 变更 | 确认 |”');
      rows.slice(2).forEach((r) => {
        const i = rawLines.indexOf(r);
        const cells = r.split('|').slice(1, -1).map((c) => c.trim());
        const isPh = (c) => allowPlaceholders && /^<[^<>]+>$/.test(c);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[0] ?? '') && !isPh(cells[0] ?? '')) err(where(i), '变更记录的日期要写成 YYYY-MM-DD');
        const c = cells[2] ?? '';
        if (c !== '未确认' && !/^[^，,]+[，,][^，,]+[，,]\s*\d{4}-\d{2}-\d{2}$/.test(c)) err(where(i), '变更记录的“确认”只能写“未确认”，或“确认人，渠道，YYYY-MM-DD”');
      });
      if (rows.length < 3) err(`${brand}/brand.md`, '变更记录至少要有一行');
    }

    // 3.7 生成的内容是不是最新
    try {
      if (contrastBlock && renderBrandMd(root, brand) !== md) err(`${brand}/brand.md`, '第 3.2 节的对比度表和 checks.json 不一致，运行 brand-kit build');
      const files = await renderBrand(root, brand);
      const dir = join(root, 'build', brand);
      for (const [f, content] of files) {
        const p = join(dir, f);
        if (!existsSync(p)) err(`build/${brand}/${f}`, '还没生成，运行 brand-kit build');
        else if (readFileSync(p, 'utf8').replace(/\r\n/g, '\n') !== content) err(`build/${brand}/${f}`, '和 tokens.json 不一致，运行 brand-kit build');
      }
      if (existsSync(dir)) for (const f of readdirSync(dir)) if (!files.has(f)) err(`build/${brand}/${f}`, '是多余的旧文件，运行 brand-kit build 清理');
    } catch (e) {
      if (!info.errors.length) err(brand, `生成失败：${e.message}`);
    }
  }

  // 4. 所有 md：相对链接和锚点、反引号里的品牌素材路径
  for (const file of walkMd(root)) {
    const md = read(file);
    const lines = blankFences(md);
    lines.forEach((line, i) => {
      for (const [, target] of stripInline(line).matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(https?:|mailto:)/.test(target)) continue;
        const [pathPart, anchor] = target.split('#');
        const abs = pathPart ? join(root, dirname(file), decodeURI(pathPart)) : join(root, file);
        if (!existsSync(abs)) { err(`${file}:${i + 1}`, `链接 ${target} 指向的文件不存在`); continue; }
        if (anchor && abs.endsWith('.md') && !anchors(readFileSync(abs, 'utf8')).has(decodeURI(anchor))) err(`${file}:${i + 1}`, `链接 ${target} 的锚点 #${anchor} 不存在`);
      }
    });
    const brand = file.split('/')[0];
    if (!brands.includes(brand)) continue;
    lines.forEach((line, i) => {
      for (const [, p] of line.matchAll(/`((?:assets|examples)\/[^`*<>]+)`/g)) {
        if (!existsSync(join(root, brand, p))) err(`${file}:${i + 1}`, `路径 ${p} 不存在（相对于 ${brand}/）`);
      }
    });
  }

  return { errors, warnings, brands };
}
