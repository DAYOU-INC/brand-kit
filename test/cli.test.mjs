// 命令行的退出码和 init / new 流程。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('init + new + build：新品牌库可以建起来，没填完时 check 失败', () => {
  const base = mkdtempSync(join(tmpdir(), 'brand-kit-cli-'));
  const dir = join(base, '我的 品牌库');
  assert.equal(run(['init', dir]).status, 0);
  assert.ok(existsSync(join(dir, '.gitignore')), '模板里的 gitignore 要改名为 .gitignore');
  assert.equal(run(['new', 'demo'], dir).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'brand-kit.json'), 'utf8')).brands, ['demo']);
  assert.equal(run(['build'], dir).status, 0);
  const r = run(['check'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /没填的占位符/);
  rmSync(base, { recursive: true, force: true });
});

test('new 拒绝不合法和重复的品牌名', () => {
  const base = mkdtempSync(join(tmpdir(), 'brand-kit-cli-'));
  const dir = join(base, 'r');
  run(['init', dir]);
  assert.equal(run(['new', 'Bad_Name'], dir).status, 1);
  assert.equal(run(['new', 'demo'], dir).status, 0);
  assert.equal(run(['new', 'demo'], dir).status, 1);
  rmSync(base, { recursive: true, force: true });
});

test('color 输出合法的颜色对象', () => {
  const r = run(['color', '#2F5E7A']);
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { colorSpace: 'srgb', components: [0.1843, 0.3686, 0.4784], hex: '#2f5e7a' });
  assert.equal(run(['color', 'blue']).status, 1);
});

test('check 在不是品牌库的目录里报错', () => {
  const base = mkdtempSync(join(tmpdir(), 'brand-kit-cli-'));
  const r = run(['check'], base);
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /brand-kit\.json/);
  rmSync(base, { recursive: true, force: true });
});
