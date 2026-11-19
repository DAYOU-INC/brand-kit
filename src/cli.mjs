#!/usr/bin/env node
// brand-kit 命令行。用法见 README.md「命令」。
import { existsSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { copyDir } from './fsutil.mjs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoConfig, brandNameProblem } from './config.mjs';
import { checkRepo } from './check.mjs';
import { buildRepo } from './build.mjs';
import { colorObject, contrastRatio } from './tokens.mjs';
import { CONTRAST_USAGE } from './config.mjs';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const HELP = `brand-kit：品牌视觉规范的校验和构建

  brand-kit init <目录>        用模板新建一个品牌库
  brand-kit new <品牌名>       在当前品牌库里新增一个品牌（复制品牌模板并登记）
  brand-kit check              校验当前品牌库，有错误时退出码为 1
  brand-kit build              由各品牌的 tokens.json 生成 build/，并更新 brand.md 的对比度表
  brand-kit color "#RRGGBB"    输出 DTCG 2025.10 的颜色对象，粘贴进 tokens.json 的 $value（# 要加引号）
  brand-kit contrast "#前景" "#底色"   计算对比度，并列出能用于哪些场景（WCAG 2.x AA）

  选项：--root <目录>  指定品牌库根目录（默认当前目录）`;

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
if (rootIdx >= 0 && (!args[rootIdx + 1] || args[rootIdx + 1].startsWith('--'))) {
  console.error('错误  --root 后面要写品牌库目录');
  process.exit(1);
}
const root = resolve(rootIdx >= 0 ? args[rootIdx + 1] : '.');
const rest = rootIdx >= 0 ? args.filter((_, i) => i !== rootIdx && i !== rootIdx + 1) : args;
const [cmd, arg, arg2] = rest;
const ARITY = { init: 1, new: 1, check: 0, build: 0, color: 1, contrast: 2 };
if (cmd in ARITY) {
  const given = rest.length - 1;
  const unknown = rest.slice(1).find((a) => a.startsWith('--'));
  if (unknown || given > ARITY[cmd]) {
    console.error(`错误  ${cmd} 不接受参数 ${unknown ?? rest.slice(1 + ARITY[cmd]).join(' ')}（只有 --root 是通用选项）`);
    process.exit(1);
  }
}

async function main() {
  switch (cmd) {
    case 'init': {
      if (!arg) throw new Error('要写目录：brand-kit init <目录>');
      const dest = resolve(arg);
      if (existsSync(dest) && readdirSync(dest).length) throw new Error(`${dest} 不是空目录`);
      copyDir(join(KIT, 'templates', 'repo'), dest);
      // npm 发布时会忽略 .gitignore，模板里存成 gitignore，复制后改名
      if (existsSync(join(dest, 'gitignore'))) renameSync(join(dest, 'gitignore'), join(dest, '.gitignore'));
      console.log(`已创建品牌库 ${dest}。下一步：cd 进去，npm install，然后 brand-kit new <品牌名>`);
      return 0;
    }
    case 'new': {
      const why = arg ? brandNameProblem(arg) : '要写品牌名：brand-kit new acme';
      if (why) throw new Error(`品牌名不合法：${why}`);
      const cfg = loadRepoConfig(root);
      if (cfg.brands.includes(arg) || existsSync(join(root, arg))) throw new Error(`${arg} 已经存在`);
      copyDir(join(KIT, 'templates', 'brand'), join(root, arg));
      cfg.brands.push(arg);
      writeFileSync(join(root, 'brand-kit.json'), JSON.stringify(cfg, null, 2) + '\n');
      console.log(`已新增 ${arg}/。按 docs/维护流程.md 填写，填完运行 brand-kit build 和 brand-kit check。`);
      return 0;
    }
    case 'check': {
      const { errors, brands } = await checkRepo(root);
      for (const e of errors) console.log(`错误  ${e}`);
      if (errors.length) { console.log(`\n校验未通过：${errors.length} 个错误`); return 1; }
      console.log(`校验通过：${brands.join('、') || '（没有品牌）'}`);
      return 0;
    }
    case 'build': {
      const cfg = loadRepoConfig(root);
      buildRepo(root, cfg.brands);
      console.log(`已生成 build/：${cfg.brands.join('、')}`);
      return 0;
    }
    case 'color': {
      if (!/^#[0-9a-fA-F]{6}$/.test(arg ?? '')) throw new Error('要写 6 位色值：brand-kit color #2f5e7a');
      console.log(JSON.stringify(colorObject(arg)));
      return 0;
    }
    case 'contrast': {
      if (![arg, arg2].every((h) => /^#[0-9a-fA-F]{6}$/.test(h ?? ''))) throw new Error('要写两个 6 位色值：brand-kit contrast "#ffffff" "#1f4e5f"');
      const r = contrastRatio(arg.toUpperCase(), arg2.toUpperCase());
      console.log(`${arg} 在 ${arg2} 上：${r.toFixed(2)}:1`);
      for (const [k, u] of Object.entries(CONTRAST_USAGE)) if (u.min !== null) console.log(`  ${r >= u.min ? '可以' : '不行'}  ${k}（${u.label}，要求 ≥ ${u.min}）`);
      return 0;
    }
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return 0;
    default:
      console.log(`不认识的命令：${cmd}

${HELP}`);
      return 1;
  }
}

main().then((code) => process.exit(code), (e) => { console.error(`错误  ${e.message}`); process.exit(1); });
