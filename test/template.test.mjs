// 示例库是用模板生成的，两边共有的文件必须一致（README.md、package.json、brand-kit.json 有意不同）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const norm = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const SAME = ['AGENTS.md', 'CLAUDE.md', '.editorconfig', '.gitattributes', '.github/workflows/check.yml', '.github/pull_request_template.md', '.github/CODEOWNERS.example'];

for (const f of SAME) {
  test(`example/${f} 和 templates/repo/${f} 一致`, () => {
    assert.equal(norm(join(KIT, 'example', f)), norm(join(KIT, 'templates/repo', f)));
  });
}
test('example/.gitignore 和 templates/repo/gitignore 一致', () => {
  assert.equal(norm(join(KIT, 'example/.gitignore')), norm(join(KIT, 'templates/repo/gitignore')));
});
