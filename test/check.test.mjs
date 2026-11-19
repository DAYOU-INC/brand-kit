// brand-kit check / build 的反例测试：每条规则都放一个故意写错的例子，确认能报出来；再放几个正例，确认不误报。
// 示例库复制到带中文和空格的临时目录里跑，顺便验证路径处理。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { checkRepo } from '../src/check.mjs';
import { buildRepo } from '../src/build.mjs';
import { copyDir } from '../src/fsutil.mjs';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const EXAMPLE = join(KIT, 'example');
const NS = 'com.github.dayou-inc.brand-kit';

function copyExample() {
  const dir = join(mkdtempSync(join(tmpdir(), 'brand-kit-')), '中文 目录');
  copyDir(EXAMPLE, dir, (s) => !s.includes('node_modules'));
  return dir;
}
const cleanup = (dir) => rmSync(join(dir, '..'), { recursive: true, force: true });
const editJson = (dir, file, fn) => {
  const p = join(dir, file);
  const j = JSON.parse(readFileSync(p, 'utf8'));
  fn(j);
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
};
const editText = (dir, file, fn) => {
  const p = join(dir, file);
  writeFileSync(p, fn(readFileSync(p, 'utf8')));
};
const token = (j, path) => path.split('.').reduce((n, k) => n[k], j);
const snapshot = (dir) => Object.fromEntries(readdirSync(join(dir, 'build/acme')).map((f) => [f, readFileSync(join(dir, 'build/acme', f), 'utf8')]));

/** 改一处，跑 check，断言报错里有 expected。rebuild=true 时先 build（测的是令牌和 md 本身的规则，不是“build 过期”）。 */
async function expectError(mutate, expected, { rebuild = false } = {}) {
  const dir = copyExample();
  try {
    mutate(dir);
    if (rebuild) { try { buildRepo(dir, ['acme']); } catch { /* 有错时不生成 */ } }
    const { errors } = await checkRepo(dir);
    assert.ok(errors.some((e) => e.includes(expected)), `应报“${expected}”，实际：\n${errors.join('\n') || '（没有错误）'}`);
  } finally { cleanup(dir); }
}
async function expectClean(mutate, { rebuild = true } = {}) {
  const dir = copyExample();
  try {
    mutate(dir);
    if (rebuild) buildRepo(dir, ['acme']);
    const { errors } = await checkRepo(dir);
    assert.deepEqual(errors, []);
  } finally { cleanup(dir); }
}

// ---------- 正例 ----------
test('示例库在中文加空格的路径下通过校验', () => expectClean(() => {}, { rebuild: false }));

test('build 不改动示例库（所有生成文件和 brand.md 都是最新的）', () => {
  const dir = copyExample();
  const before = { ...snapshot(dir), md: readFileSync(join(dir, 'acme/brand.md'), 'utf8') };
  buildRepo(dir, ['acme']);
  const after = { ...snapshot(dir), md: readFileSync(join(dir, 'acme/brand.md'), 'utf8') };
  assert.deepEqual(after, before);
  cleanup(dir);
});

test('brand.md 是 CRLF 换行时不误报，build 后仍是 CRLF', async () => {
  const dir = copyExample();
  editText(dir, 'acme/brand.md', (s) => s.replace(/\n/g, '\r\n'));
  buildRepo(dir, ['acme']);
  const md = readFileSync(join(dir, 'acme/brand.md'), 'utf8');
  assert.ok(!/[^\r]\n/.test(md), 'build 后应全部是 CRLF');
  assert.deepEqual((await checkRepo(dir)).errors, []);
  cleanup(dir);
});

test('JSON 带 UTF-8 BOM 时不误报', () => expectClean((d) => {
  for (const f of ['acme/tokens.json', 'acme/checks.json', 'brand-kit.json']) editText(d, f, (s) => '﻿' + s);
}));

test('<br> 和自动链接不算占位符；代码块里的令牌色值不要求写令牌名', () => expectClean((d) => editText(d, 'acme/brand.md', (md) => md.replace('## 素材来源', '第一行<br>第二行，见 <https://example.com>。\n\n```\nbackground #1F4E5F\n```\n\n## 素材来源'))));

test('描述里有注释结束符、花括号时，生成的 CSS 仍然有效', () => {
  const dir = copyExample();
  editJson(dir, 'acme/tokens.json', (j) => { token(j, 'color.brand.cream').$description = '奶油色 */ 注意 /* {color.brand.primary} {foo}'; });
  buildRepo(dir, ['acme']);
  const css = readFileSync(join(dir, 'build/acme/variables.css'), 'utf8');
  const line = css.split('\n').find((l) => l.includes('奶油色'));
  assert.equal((line.match(/\*\//g) ?? []).length, 1, line);
  assert.ok(line.includes('{color.brand.primary}'), '描述里的花括号不能被当成引用替换');
  cleanup(dir);
});

test('字体名有空格时 CSS 加双引号，通用族名不加', () => {
  const dir = copyExample();
  const css = readFileSync(join(dir, 'build/acme/variables.css'), 'utf8');
  assert.match(css, /--acme-font-display: "Source Sans 3", sans-serif;/);
  cleanup(dir);
});

test('build 失败时不动磁盘：build/ 和 brand.md 保持原样', () => {
  const dir = copyExample();
  const before = snapshot(dir);
  editJson(dir, 'acme/tokens.json', (j) => { delete token(j, 'color.brand.cream').$extensions[NS].status; });
  assert.throws(() => buildRepo(dir, ['acme']));
  assert.deepEqual(snapshot(dir), before);
  assert.ok(!readdirSync(dir).some((f) => f.startsWith('.build-tmp')));
  cleanup(dir);
});

test('常见写法不误报：渠道名、Mastodon、尚未定稿、带属性的 HTML、话题标签、相近的名字', () => expectClean((d) => editText(d, 'acme/brand.md', (md) => md.replace('## 素材来源', '渠道写 `device`，状态写 `current`。关注 Mastodon。文案尚未定稿。<img alt="产品正面图" src="x.png"> 话题 #cafe。Acme Millennium 是另一家公司。\n\n## 素材来源'))));

test('漏写一个字段只报中文的那条，不报 Schema 噪声', async () => {
  const dir = copyExample();
  editJson(dir, 'acme/tokens.json', (j) => { delete token(j, 'color.brand.cream').$extensions[NS].status; });
  const { errors } = await checkRepo(dir);
  assert.ok(errors.some((e) => e.includes('status 必填')));
  assert.ok(!errors.some((e) => e.includes('结构不符合')), errors.join(' / '));
  cleanup(dir);
});

test('Dart：小数尺寸不四舍五入，字符串里的 $ 和引号被转义', () => {
  const dir = copyExample();
  editJson(dir, 'acme/tokens.json', (j) => {
    j.radius.tiny = { $value: { value: 0.25, unit: 'px' }, $description: '细线', $extensions: { [NS]: { status: 'current', channels: ['app'], source: 'x' } } };
    j.font.quirky = { $value: ["Brand$Sans'X"], $description: 'x', $extensions: { [NS]: { status: 'current', channels: ['app'], source: 'x' } } };
  });
  buildRepo(dir, ['acme']);
  const dart = readFileSync(join(dir, 'build/acme/acme_tokens.dart'), 'utf8');
  assert.match(dart, /radiusTiny = 0\.25;/);
  const BS = String.fromCharCode(92);
  const line = dart.split(/\r?\n/).find((l) => l.includes('fontQuirky'));
  assert.equal(line.trim(), `static const fontQuirky = 'Brand${BS}$Sans${BS}'X';`);
  cleanup(dir);
});

// ---------- 令牌 ----------
const T = 'acme/tokens.json';
const tokenCases = [
  ['缺 status', (j) => { delete token(j, 'color.brand.cream').$extensions[NS].status; }, 'status 必填'],
  ['不认识的渠道', (j) => { token(j, 'color.brand.cream').$extensions[NS].channels = ['tv']; }, 'channels 必填'],
  ['缺 source', (j) => { delete token(j, 'color.brand.cream').$extensions[NS].source; }, 'source 必填'],
  ['缺 $description', (j) => { delete token(j, 'color.brand.cream').$description; }, '缺少 $description'],
  ['缺扩展', (j) => { delete token(j, 'color.brand.cream').$extensions; }, '缺少 $extensions'],
  ['漏写 $value', (j) => { delete token(j, 'color.brand.cream').$value; }, '漏写了 $value'],
  ['空分组', (j) => { j.color.empty = {}; }, '空分组'],
  ['名字有大写', (j) => { j.color.brand.Cream2 = token(j, 'color.brand.cream'); }, '不合法'],
  ['键名里带点', (j) => { j.color['brand.x'] = token(j, 'color.brand.cream'); }, '不合法'],
  ['名字有双连字符', (j) => { j.color.brand['a--b'] = token(j, 'color.brand.cream'); }, '不合法'],
  ['生成的名字撞车', (j) => { j.color['brand-cream'] = token(j, 'color.brand.cream'); }, '生成的CSS 变量名相同'],
  ['拼错的 $ 字段', (j) => { const t = token(j, 'color.brand.cream'); t.$descripton = 'x'; }, '不认识的字段'],
  ['不支持 $root', (j) => { j.color.brand.$root = token(j, 'color.brand.cream'); }, '不支持 $root'],
  ['扩展字段拼错', (j) => { token(j, 'color.brand.cream').$extensions[NS].prnt = {}; }, '扩展里不认识的字段'],
  ['print 写成字符串', (j) => { token(j, 'color.brand.cream').$extensions[NS].print = 'CMYK 0 0 0 0'; }, 'print 要写成'],
  ['components 和 hex 不一致', (j) => { token(j, 'color.brand.cream').$value.components = [0, 0, 0]; }, '对不上'],
  ['颜色写成字符串', (j) => { token(j, 'color.brand.cream').$value = '#F4EDE4'; }, '颜色要写成对象'],
  ['颜色带 alpha', (j) => { token(j, 'color.brand.cream').$value.alpha = 0.2; }, '不支持 alpha'],
  ['尺寸格式错', (j) => { token(j, 'radius.card').$value = '12px'; }, '尺寸要写成'],
  ['字体格式错', (j) => { token(j, 'font.body').$value = 42; }, '字体要写成'],
  ['字体名有引号', (j) => { token(j, 'font.body').$value = ["O\"Neil Sans"]; }, '字体名里不能有'],
  ['不支持的类型', (j) => { token(j, 'radius.card').$type = 'colour'; }, '不支持的 $type'],
  ['引用不存在', (j) => { token(j, 'color.digital.web-primary').$value = '{color.brand.nope}'; }, '引用了不存在的令牌'],
  ['循环引用', (j) => { token(j, 'color.digital.web-primary').$value = '{color.digital.web-primary}'; }, '循环引用'],
  ['引用已弃用', (j) => { token(j, 'color.digital.web-primary').$value = '{color.legacy.orange}'; }, '已弃用'],
  ['引用的分组已弃用', (j) => { j.color.legacy.$deprecated = true; delete token(j, 'color.legacy.orange').$deprecated; token(j, 'color.digital.web-primary').$value = '{color.legacy.orange}'; }, '已弃用'],
  ['web 别名引用了没导出到 web 的令牌', (j) => { token(j, 'color.digital.web-primary').$value = '{color.device.ready}'; }, '没有导出到这些渠道'],
  ['confirmed 缺确认人', (j) => { delete token(j, 'color.brand.primary').$extensions[NS].confirmedBy; }, 'confirmedBy 必填'],
  ['确认人是 AI', (j) => { token(j, 'color.brand.primary').$extensions[NS].confirmedBy = 'AI 推断'; }, '必须是人'],
  ['确认日期不存在', (j) => { token(j, 'color.brand.primary').$extensions[NS].confirmedAt = '2026-13-45'; }, '真实存在'],
  ['确认日期在未来', (j) => { token(j, 'color.brand.primary').$extensions[NS].confirmedAt = '2099-01-01'; }, '不晚于今天'],
  ['确认人是占位符', (j) => { token(j, 'color.brand.primary').$extensions[NS].confirmedBy = '<确认人>'; }, '没填的占位符'],
  ['print 写了没定的值', (j) => { token(j, 'color.brand.primary').$extensions[NS].print = { cmyk: '85 50 40 30', pantone: '待处理' }; }, 'print 只写'],
  ['渐变色标引用了设备专用色', (j) => { token(j, 'gradient.warm').$value[1].color = '{color.device.ready}'; }, '没有导出到这些渠道'],
  ['生成的 Dart 名是保留字', (j) => { j.default = { $type: 'number', $value: 1, $description: 'x', $extensions: { [NS]: { status: 'current', channels: ['app'], source: 'x' } } }; }, 'Dart 保留字'],
  ['confirmed 还留着 pendingReason', (j) => { token(j, 'color.brand.primary').$extensions[NS].pendingReason = 'x'; }, '不能再有 pendingReason'],
  ['pending 缺原因', (j) => { delete token(j, 'font.packaging-cn').$extensions[NS].pendingReason; }, 'pendingReason 必填'],
  ['渐变缺角度', (j) => { delete token(j, 'gradient.warm').$extensions[NS].angle; }, '必须在扩展里写 angle'],
  ['令牌里的占位符', (j) => { token(j, 'color.brand.cream').$description = '<用途>'; }, '没填的占位符'],
  ['描述里用了禁用的名字（不分大小写）', (j) => { token(j, 'color.brand.cream').$description = 'ACME MILL 的底色'; }, '禁用的名字'],
];
for (const [name, fn, expected] of tokenCases) {
  test(`令牌：${name}`, () => expectError((d) => editJson(d, T, fn), expected));
}

// ---------- checks.json ----------
const C = 'acme/checks.json';
const checksCases = [
  ['缺 usage', (j) => { delete j.contrast[0].usage; }, 'usage 必填'],
  ['对比度不达标', (j) => { j.contrast[4].usage = 'text'; }, '要求 ≥ 4.5'],
  ['不认识的字段', (j) => { j.foo = 1; }, '不认识的字段'],
  ['嵌套里不认识的字段', (j) => { j.names.allowd = []; }, 'schemas/checks.schema.json'],
  ['令牌不存在', (j) => { j.contrast[0].fg = 'color.nope'; }, '不存在'],
  ['重复的组合', (j) => { j.contrast.push({ ...j.contrast[0] }); }, '重复'],
  ['extraColors 没写原因', (j) => { j.extraColors = { '#123456': '' }; }, '要写原因'],
  ['extraColors 登记了没用到', (j) => { j.extraColors = { '#123456': '没用到' }; }, '没有出现'],
];
for (const [name, fn, expected] of checksCases) {
  test(`checks.json：${name}`, () => expectError((d) => editJson(d, C, fn), expected, { rebuild: true }));
}

// ---------- brand.md 和其他 Markdown ----------
const M = 'acme/brand.md';
const append = (s) => (d) => editText(d, M, (md) => md.replace('## 素材来源', `${s}\n\n## 素材来源`));
const mdCases = [
  ['色值不是令牌', append('底色 #123456。'), '不是任何令牌的值'],
  ['色值旁边没写令牌名', append('底色 #F4EDE4。'), '旁边要写令牌全名'],
  ['代码块里的色值不是令牌', append('```\nbackground #123456\n```'), '不是任何令牌的值'],
  ['令牌简写（带点）', append('用 `brand.primary`。'), '要写全名'],
  ['令牌简写（单个词）', append('用 `accent-light`。'), '要写全名'],
  ['令牌名有大写', append('用 `color.Brand.primary`。'), '全小写'],
  ['令牌名不存在', append('用 `color.brand.nope`。'), '不存在'],
  ['通配符匹配不到', append('用 `color.nope.*`。'), '匹配不到'],
  ['锚点不存在', append('见 [配色](brand.md#不存在)。'), '锚点'],
  ['链接文件不存在', append('见 [文件](nope.md)。'), '不存在'],
  ['链接大小写不对', append('见 [文件](Source-Index.md)。'), '不存在'],
  ['带标题的链接', append('见 [文件](nope.md "标题")。'), '不存在'],
  ['引用式链接', append('[ref]: nope.md'), '不存在'],
  ['链接指到品牌库外面', append('见 [外面](../../outside.md)。'), '不存在'],
  ['链接地址格式不对', append('见 [x](a%zz.md)。'), '地址格式不对'],
  ['占位符', append('这里写 <产品名>。'), '没填的占位符'],
  ['代码块里的占位符', append('```\n<提示词>\n```'), '没填的占位符'],
  ['禁用的名字', append('Acme Mill 很好用。'), '禁用的名字'],
  ['代码块里的禁用名字（不分大小写）', append('```\nacme mill grinder\n```'), '禁用的名字'],
  ['不规范的状态说法', append('这一项暂定如此。'), '不是规定的状态说法'],
  ['素材路径不存在', append('见 `assets/logo/nope.svg`。'), '不存在'],
  ['素材路径大小写不对', append('见 `assets/logo/ACME-mark-primary.svg`。'), '不存在'],
  ['缺二级标题', (d) => editText(d, M, (md) => md.replace('## 8. 文案', '## 8. 文字')), '缺少二级标题'],
  ['缺 1.1 正式名称', (d) => editText(d, M, (md) => md.replace('### 1.1 正式名称', '### 1.1 名称')), '1.1 正式名称'],
  ['缺对比度表', (d) => editText(d, M, (md) => md.replace(/<!-- brand-kit:contrast[\s\S]*?<!-- \/brand-kit:contrast -->/, '')), '对比度表'],
  ['变更记录确认格式', (d) => editText(d, M, (md) => md.replace('| 2026-11-19 | 初稿 | 未确认 |', '| 2026-11-19 | 初稿 | 用户 |')), '“确认”只能写'],
  ['变更记录确认人是 AI', (d) => editText(d, M, (md) => md.replace('| 2026-11-19 | 初稿 | 未确认 |', '| 2026-11-19 | 初稿 | AI，推断，2026-11-19 |')), '必须是人'],
  ['变更记录日期不存在', (d) => editText(d, M, (md) => md.replace('| 2026-11-19 | 初稿 |', '| 2026-02-30 | 初稿 |')), '真实存在'],
  ['变更记录日期在未来', (d) => editText(d, M, (md) => md.replace('| 2026-11-19 | 初稿 |', '| 2099-01-01 | 初稿 |')), '不晚于今天'],
  ['对比度表不在 3.2 节', (d) => editText(d, M, (md) => { const m = md.match(/<!-- brand-kit:contrast[\s\S]*?<!-- \/brand-kit:contrast -->/)[0]; return md.replace(m, '').replace('## 8. 文案', ['## 8. 文案', '', m].join('\n')); }), '必须放在'],
  ['HTML 注释里的标题不算章节', (d) => editText(d, M, (md) => md.replace('## 8. 文案', ['<!--', '## 8. 文案', '-->', '## 8. 文字'].join('\n'))), '缺少二级标题'],
  ['文件不是 UTF-8', (d) => writeFileSync(join(d, M), Buffer.concat([readFileSync(join(d, M)), Buffer.from([0xff, 0xfe, 0x41])])), '不是 UTF-8'],
  ['变更记录缺分隔行', (d) => editText(d, M, (md) => md.replace(/(\| 日期 \| 变更 \| 确认 \|\r?\n)\|---\|---\|---\|\r?\n/, '$1')), '分隔行'],
  ['source-index 里的占位符', (d) => editText(d, 'acme/source-index.md', (s) => s + '\n<访问方式>\n'), '没填的占位符'],
];
for (const [name, fn, expected] of mdCases) {
  test(`Markdown：${name}`, () => expectError(fn, expected));
}

// ---------- 生成文件和仓库结构 ----------
test('对比度表过期', () => expectError((d) => editJson(d, C, (j) => { j.contrast[0].note = '改了说明'; }), '对比度表和 checks.json 不一致'));
test('build 过期', () => expectError((d) => editText(d, 'build/acme/variables.css', (s) => s.replace('#1f4e5f', '#000000')), '和 tokens.json 不一致'));
test('build 缺文件', () => expectError((d) => rmSync(join(d, 'build/acme/acme_tokens.dart')), '还没生成'));
test('build 有多余文件', () => expectError((d) => writeFileSync(join(d, 'build/acme/old.css'), ''), '多余的旧文件'));
test('build 有未登记品牌', () => expectError((d) => mkdirSync(join(d, 'build/ghost')), '不是已登记的品牌'));
test('build 下的普通文件不算品牌', () => expectClean((d) => writeFileSync(join(d, 'build/README.md'), '生成文件，不要手改\n'), { rebuild: false }));
test('品牌目录没登记', () => expectError((d) => { mkdirSync(join(d, 'ghost')); writeFileSync(join(d, 'ghost/tokens.json'), '{}'); }, '没有登记'));
test('品牌重复登记', () => expectError((d) => editJson(d, 'brand-kit.json', (j) => { j.brands.push('acme'); }), '重复'));
test('登记的品牌缺文件', () => expectError((d) => rmSync(join(d, 'acme/checks.json')), '缺少 checks.json'));
test('登记的品牌缺 examples 目录', () => expectError((d) => rmSync(join(d, 'acme/examples'), { recursive: true }), '缺少 examples/'));
test('tokens.json 不是合法 JSON', () => expectError((d) => writeFileSync(join(d, T), '{'), 'JSON 格式错误'));
test('checks.json 不是合法 JSON', () => expectError((d) => writeFileSync(join(d, C), '{'), 'JSON 格式错误'));

// ---------- 模板 ----------
test('模板品牌：允许占位符时通过；不允许时报占位符，模板值标为待处理', async () => {
  const base = mkdtempSync(join(tmpdir(), 'brand-kit-'));
  const dir = join(base, '新 库');
  copyDir(join(KIT, 'templates/repo'), dir);
  copyDir(join(KIT, 'templates/brand'), join(dir, 'demo'));
  editJson(dir, 'brand-kit.json', (j) => { j.brands = ['demo']; });
  buildRepo(dir, ['demo']);
  assert.ok(existsSync(join(dir, 'build/demo/variables.css')));
  assert.deepEqual((await checkRepo(dir, { allowPlaceholders: true })).errors, []);
  const strict = (await checkRepo(dir)).errors;
  assert.ok(strict.some((e) => e.includes('没填的占位符')));
  const t = JSON.parse(readFileSync(join(dir, 'demo/tokens.json'), 'utf8'));
  assert.equal(t.color.brand.primary.$extensions[NS].status, 'pending', '模板里的假值必须是 pending');
  rmSync(base, { recursive: true, force: true });
});

test('比较式里的尖括号不算占位符', () => expectClean((d) => editJson(d, T, (j) => { token(j, 'color.brand.cream').$extensions[NS].source = '取色：饱和度 < 0.08、亮度 > 0.5 的像素中位数'; })));
