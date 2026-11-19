// 示例和模板是给 AI 照抄的范本：令牌出处不能指向代码或开发文档（规范只用设计素材库）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const NS = 'com.github.dayou-inc.brand-kit';
const BAD = /样式表|stylesheet|css|代码|源码|source code|产品说明|开发文档/i;

for (const f of ['example/acme/tokens.json', 'templates/brand/tokens.json']) {
  test(`${f} 的 source 不指向代码或开发文档`, () => {
    const bad = [];
    const walk = (node, path) => {
      for (const [k, v] of Object.entries(node)) {
        if (k.startsWith('$') || typeof v !== 'object' || v === null) continue;
        if ('$value' in v) { const s = v.$extensions?.[NS]?.source ?? ''; if (BAD.test(s)) bad.push(`${[...path, k].join('.')}: ${s}`); }
        else walk(v, [...path, k]);
      }
    };
    walk(JSON.parse(readFileSync(join(KIT, f), 'utf8')), []);
    assert.deepEqual(bad, []);
  });
}
