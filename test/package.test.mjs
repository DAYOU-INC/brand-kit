// 发布包（GitHub 标签压缩包）必须包含模板的全部文件；export-ignore 只能排除根目录的东西。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('..', import.meta.url));

test('.gitattributes 里的 export-ignore 都以 / 开头，只排除根目录', () => {
  const bad = readFileSync(join(KIT, '.gitattributes'), 'utf8').split(/\r?\n/)
    .filter((l) => /export-ignore/.test(l) && !l.trim().startsWith('/'));
  assert.deepEqual(bad, []);
});
