// brand-kit check 的反例测试：每条规则都放一个故意写错的例子，确认能报出来。
// 示例库复制到带中文和空格的临时目录里跑，顺便验证路径处理。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { checkRepo } from '../src/check.mjs';
import { buildRepo } from '../src/build.mjs';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const EXAMPLE = join(KIT, 'example');
const NS = 'com.github.dayou-inc.brand-kit';

function copyExample() {
  const dir = join(mkdtempSync(join(tmpdir(), 'brand-kit-')), '中文 目录');
  cpSync(EXAMPLE, dir, { recursive: true, filter: (s) => !s.includes('node_modules') });
  return dir;
}
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

/** 改一处，跑 check，断言报错里有 expected。rebuild=true 时先 build（测试令牌和 md 本身的规则，而不是“build 过期”）。 */
async function expectError(mutate, expected, { rebuild = false } = {}) {
  const dir = copyExample();
  try {
    mutate(dir);
    if (rebuild) await buildRepo(dir, ['acme']).catch(() => {});
    const { errors } = await checkRepo(dir);
    assert.ok(errors.some((e) => e.includes(expected)), `应报“${expected}”，实际：\n${errors.join('\n') || '（没有错误）'}`);
  } finally {
    rmSync(join(dir, '..'), { recursive: true, force: true });
  }
}

test('示例库在中文加空格的路径下通过校验', async () => {
  const dir = copyExample();
  const { errors } = await checkRepo(dir);
  assert.deepEqual(errors, []);
  rmSync(join(dir, '..'), { recursive: true, force: true });
});

test('build 不改动示例库（示例库里的生成文件是最新的）', async () => {
  const dir = copyExample();
  const before = readFileSync(join(dir, 'build/acme/variables.css'), 'utf8') + readFileSync(join(dir, 'acme/brand.md'), 'utf8');
  await buildRepo(dir, ['acme']);
  const after = readFileSync(join(dir, 'build/acme/variables.css'), 'utf8') + readFileSync(join(dir, 'acme/brand.md'), 'utf8');
  assert.equal(after, before);
  rmSync(join(dir, '..'), { recursive: true, force: true });
});

// ---------- 令牌 ----------
const T = 'acme/tokens.json';
const tokenCases = [
  ['缺 status', (j) => { delete token(j, 'color.brand.cream').$extensions[NS].status; }, 'status 必填'],
  ['不认识的渠道', (j) => { token(j, 'color.brand.cream').$extensions[NS].channels = ['tv']; }, 'channels 必填'],
  ['缺 source', (j) => { delete token(j, 'color.brand.cream').$extensions[NS].source; }, 'source 必填'],
  ['缺 $description', (j) => { delete token(j, 'color.brand.cream').$description; }, '缺少 $description'],
  ['缺扩展', (j) => { delete token(j, 'color.brand.cream').$extensions; }, '缺少 $extensions'],
  ['components 和 hex 不一致', (j) => { token(j, 'color.brand.cream').$value.components = [0, 0, 0]; }, '对不上'],
  ['颜色写成字符串', (j) => { token(j, 'color.brand.cream').$value = '#F4EDE4'; }, '颜色要写成对象'],
  ['尺寸格式错', (j) => { token(j, 'radius.card').$value = '12px'; }, '尺寸要写成'],
  ['字体格式错', (j) => { token(j, 'font.body').$value = 42; }, '字体要写成'],
  ['不支持的类型', (j) => { token(j, 'radius.card').$type = 'colour'; }, '不支持的 $type'],
  ['引用不存在', (j) => { token(j, 'color.digital.web-primary').$value = '{color.brand.nope}'; }, '引用了不存在的令牌'],
  ['循环引用', (j) => { token(j, 'color.digital.web-primary').$value = '{color.digital.web-primary}'; }, '循环引用'],
  ['引用已弃用', (j) => { token(j, 'color.digital.web-primary').$value = '{color.legacy.orange}'; }, '已弃用'],
  ['引用的令牌没导出到同一渠道', (j) => { token(j, 'color.digital.web-primary').$value = '{color.device.ready}'; }, '没有导出到这些渠道'],
  ['confirmed 缺确认人', (j) => { delete token(j, 'color.brand.primary').$extensions[NS].confirmedBy; }, 'confirmedBy 必填'],
  ['pending 缺原因', (j) => { delete token(j, 'font.packaging-cn').$extensions[NS].pendingReason; }, 'pendingReason 必填'],
  ['渐变缺角度', (j) => { delete token(j, 'gradient.warm').$extensions[NS].angle; }, '必须在扩展里写 angle'],
  ['令牌里的占位符', (j) => { token(j, 'color.brand.cream').$description = '<用途>'; }, '没填的占位符'],
  ['描述里用了禁用的名字', (j) => { token(j, 'color.brand.cream').$description = 'Acme Mill 的底色'; }, '禁用的名字'],
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
  ['令牌不存在', (j) => { j.contrast[0].fg = 'color.nope'; }, '不存在'],
  ['重复的组合', (j) => { j.contrast.push({ ...j.contrast[0] }); }, '重复'],
  ['extraColors 没写原因', (j) => { j.extraColors = { '#123456': '' }; }, '要写原因'],
];
for (const [name, fn, expected] of checksCases) {
  test(`checks.json：${name}`, () => expectError((d) => editJson(d, C, fn), expected, { rebuild: true }));
}

// ---------- brand.md ----------
const M = 'acme/brand.md';
const append = (s) => (d) => editText(d, M, (md) => md.replace('## 素材来源', `${s}\n\n## 素材来源`));
const mdCases = [
  ['色值不是令牌', append('底色 #123456。'), '不是任何令牌的值'],
  ['色值旁边没写令牌名', append('底色 #F4EDE4。'), '旁边要写令牌全名'],
  ['3 位色值', append('底色 #fff 和 `color.neutral.white`。'), '6 位'],
  ['令牌简写', append('用 `brand.primary`。'), '要写全名'],
  ['令牌名不存在', append('用 `color.brand.nope`。'), '不存在'],
  ['通配符匹配不到', append('用 `color.nope.*`。'), '匹配不到'],
  ['锚点不存在', append('见 [配色](brand.md#不存在)。'), '锚点'],
  ['链接文件不存在', append('见 [文件](nope.md)。'), '不存在'],
  ['占位符', append('这里写 <产品名>。'), '没填的占位符'],
  ['禁用的名字', append('Acme Mill 很好用。'), '禁用的名字'],
  ['不规范的状态说法', append('这一项待确认。'), '不是规定的状态说法'],
  ['素材路径不存在', append('见 `assets/logo/nope.svg`。'), '不存在'],
  ['缺二级标题', (d) => editText(d, M, (md) => md.replace('## 8. 文案', '## 8. 文字')), '缺少二级标题'],
  ['变更记录确认格式', (d) => editText(d, M, (md) => md.replace('| 2026-11-19 | 初稿 | 未确认 |', '| 2026-11-19 | 初稿 | 用户 |')), '“确认”只能写'],
  ['变更记录日期格式', (d) => editText(d, M, (md) => md.replace('| 2026-11-19 | 初稿 |', '| 11-19 | 初稿 |')), '日期要写成'],
];
for (const [name, fn, expected] of mdCases) {
  test(`brand.md：${name}`, () => expectError(fn, expected));
}

// ---------- 生成文件和仓库结构 ----------
test('对比度表过期', () => expectError((d) => editJson(d, C, (j) => { j.contrast[0].note = '改了说明'; }), '对比度表和 checks.json 不一致'));
test('build 过期', () => expectError((d) => editText(d, 'build/acme/variables.css', (s) => s.replace('#1f4e5f', '#000000')), '和 tokens.json 不一致'));
test('build 缺文件', () => expectError((d) => rmSync(join(d, 'build/acme/acme_tokens.dart')), '还没生成'));
test('build 有多余文件', () => expectError((d) => writeFileSync(join(d, 'build/acme/old.css'), ''), '多余的旧文件'));
test('build 有未登记品牌', () => expectError((d) => mkdirSync(join(d, 'build/ghost')), '不是已登记的品牌'));
test('品牌目录没登记', () => expectError((d) => { mkdirSync(join(d, 'ghost')); writeFileSync(join(d, 'ghost/tokens.json'), '{}'); }, '没有登记'));
test('登记的品牌缺文件', () => expectError((d) => rmSync(join(d, 'acme/checks.json')), '缺少 checks.json'));
test('tokens.json 不是合法 JSON', () => expectError((d) => writeFileSync(join(d, T), '{'), 'JSON 格式错误'));
test('checks.json 不是合法 JSON', () => expectError((d) => writeFileSync(join(d, C), '{'), 'JSON 格式错误'));

// ---------- 模板 ----------
test('新建的品牌库和模板品牌：允许占位符时通过，不允许时报占位符', async () => {
  const base = mkdtempSync(join(tmpdir(), 'brand-kit-'));
  const dir = join(base, '新 库');
  cpSync(join(KIT, 'templates/repo'), dir, { recursive: true });
  cpSync(join(KIT, 'templates/brand'), join(dir, 'demo'), { recursive: true });
  editJson(dir, 'brand-kit.json', (j) => { j.brands = ['demo']; });
  await buildRepo(dir, ['demo']);
  const loose = await checkRepo(dir, { allowPlaceholders: true });
  assert.deepEqual(loose.errors, []);
  const strict = await checkRepo(dir);
  assert.ok(strict.errors.some((e) => e.includes('没填的占位符')));
  rmSync(base, { recursive: true, force: true });
});
