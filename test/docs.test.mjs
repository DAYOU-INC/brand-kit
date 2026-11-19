// 仓库里所有 Markdown 的相对链接和锚点都要能打开（示例库由 check 自己检查）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchors, blankFences, stripInline } from '../src/markdown.mjs';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir, out = []) => {
  for (const d of readdirSync(join(KIT, dir), { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(d.name)) continue;
    const p = dir ? `${dir}/${d.name}` : d.name;
    if (d.isDirectory()) walk(p, out); else if (p.endsWith('.md')) out.push(p);
  }
  return out;
};

test('文档链接和锚点都能打开', () => {
  const broken = [];
  for (const file of walk('')) {
    blankFences(readFileSync(join(KIT, file), 'utf8')).forEach((line, i) => {
      for (const [, target] of stripInline(line).matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(https?:|mailto:)/.test(target)) continue;
        const [p, a] = target.split('#');
        const abs = p ? join(KIT, dirname(file), decodeURI(p)) : join(KIT, file);
        if (!existsSync(abs)) broken.push(`${file}:${i + 1} ${target}（文件不存在）`);
        else if (a && abs.endsWith('.md') && !anchors(readFileSync(abs, 'utf8')).has(decodeURI(a))) broken.push(`${file}:${i + 1} ${target}（锚点不存在）`);
      }
    });
  }
  assert.deepEqual(broken, []);
});
