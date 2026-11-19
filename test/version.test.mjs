// 发版时容易漏改的地方：模板和示例的依赖、Schema 地址、文档里的命令都要指向当前版本的标签。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(join(KIT, 'package.json'), 'utf8'));
const tag = `v${version}`;
const files = (dir) => readdirSync(join(KIT, dir), { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && /\.(json|md)$/.test(d.name) && !d.parentPath.includes('node_modules') && !d.parentPath.includes(`${KIT}build`))
  .map((d) => join(d.parentPath, d.name));

test('所有指向 brand-kit 标签的地方都是当前版本', () => {
  const wrong = [];
  for (const f of [join(KIT, 'README.md'), ...files('docs'), ...files('templates'), ...files('example'), ...files('schemas')]) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/brand-kit(?:\/archive\/refs\/tags\/|#|\/)(v\d+\.\d+\.\d+)/g)) if (m[1] !== tag) wrong.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(wrong, [], `当前版本是 ${tag}`);
});

test('CHANGELOG 有当前版本的条目', () => {
  assert.match(readFileSync(join(KIT, 'CHANGELOG.md'), 'utf8'), new RegExp(`^## ${tag.replace(/\./g, '\.')}`, 'm'));
});
