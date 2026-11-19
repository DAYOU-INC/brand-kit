// 示例库和模板都要符合 schemas/ 下的 JSON Schema，保证 Schema 和 check 的规则不脱节。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const load = (p) => JSON.parse(readFileSync(join(KIT, p), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const cases = [
  ['schemas/brand-kit.schema.json', ['example/brand-kit.json', 'templates/repo/brand-kit.json']],
  ['schemas/checks.schema.json', ['example/acme/checks.json', 'templates/brand/checks.json']],
  ['schemas/tokens.schema.json', ['example/acme/tokens.json', 'templates/brand/tokens.json']],
];
const compiled = new Map(cases.map(([schema]) => [schema, ajv.compile(load(schema))]));
for (const [schema, files] of cases) {
  const validate = compiled.get(schema);
  for (const f of files) {
    test(`${f} 符合 ${schema}`, () => {
      assert.ok(validate(load(f)), JSON.stringify(validate.errors, null, 2));
    });
  }
}

test('tokens.schema.json 能挡住缺 status 的令牌', () => {
  const validate = compiled.get('schemas/tokens.schema.json');
  const bad = load('example/acme/tokens.json');
  delete bad.color.brand.cream.$extensions['com.github.dayou-inc.brand-kit'].status;
  assert.equal(validate(bad), false);
});
