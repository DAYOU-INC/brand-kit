#!/usr/bin/env node
// brand-kit 命令行。用法见 README.md「命令」。
import { cpSync, existsSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoConfig } from './config.mjs';
import { checkRepo } from './check.mjs';
import { buildRepo } from './build.mjs';
import { colorObject } from './tokens.mjs';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const HELP = `brand-kit：品牌视觉规范的校验和构建

  brand-kit init <目录>        用模板新建一个品牌库
  brand-kit new <品牌名>       在当前品牌库里新增一个品牌（复制品牌模板并登记）
  brand-kit check              校验当前品牌库，有错误时退出码为 1
  brand-kit build              由各品牌的 tokens.json 生成 build/，并更新 brand.md 的对比度表
  brand-kit color <#RRGGBB>    输出 DTCG 2025.10 的颜色对象，粘贴进 tokens.json 的 $value

  选项：--root <目录>  指定品牌库根目录（默认当前目录）`;

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const root = resolve(rootIdx >= 0 ? args[rootIdx + 1] : '.');
const [cmd, arg] = args.filter((a, i) => a !== '--root' && i !== rootIdx + 1 || rootIdx < 0);

async function main() {
  switch (cmd) {
    case 'init': {
      if (!arg) throw new Error('要写目录：brand-kit init <目录>');
      const dest = resolve(arg);
      if (existsSync(dest) && readdirSync(dest).length) throw new Error(`${dest} 不是空目录`);
      cpSync(join(KIT, 'templates', 'repo'), dest, { recursive: true });
      // npm 发布时会忽略 .gitignore，模板里存成 gitignore，复制后改名
      if (existsSync(join(dest, 'gitignore'))) renameSync(join(dest, 'gitignore'), join(dest, '.gitignore'));
      console.log(`已创建品牌库 ${dest}。下一步：cd 进去，npm install，然后 brand-kit new <品牌名>`);
      return 0;
    }
    case 'new': {
      if (!arg || !/^[a-z][a-z0-9-]*$/.test(arg)) throw new Error('品牌名只能用小写字母、数字和连字符：brand-kit new <品牌名>');
      const cfg = loadRepoConfig(root);
      if (cfg.brands.includes(arg) || existsSync(join(root, arg))) throw new Error(`${arg} 已经存在`);
      cpSync(join(KIT, 'templates', 'brand'), join(root, arg), { recursive: true });
      cfg.brands.push(arg);
      writeFileSync(join(root, 'brand-kit.json'), JSON.stringify(cfg, null, 2) + '\n');
      console.log(`已新增 ${arg}/。按 docs/维护流程.md 填写，填完运行 brand-kit build 和 brand-kit check。`);
      return 0;
    }
    case 'check': {
      const { errors, warnings, brands } = await checkRepo(root);
      for (const w of warnings) console.log(`提示  ${w}`);
      for (const e of errors) console.log(`错误  ${e}`);
      if (errors.length) { console.log(`\n校验未通过：${errors.length} 个错误`); return 1; }
      console.log(`校验通过：${brands.join('、') || '（没有品牌）'}`);
      return 0;
    }
    case 'build': {
      const cfg = loadRepoConfig(root);
      await buildRepo(root, cfg.brands);
      console.log(`已生成 build/：${cfg.brands.join('、')}`);
      return 0;
    }
    case 'color': {
      if (!/^#[0-9a-fA-F]{6}$/.test(arg ?? '')) throw new Error('要写 6 位色值：brand-kit color #2f5e7a');
      console.log(JSON.stringify(colorObject(arg)));
      return 0;
    }
    default:
      console.log(HELP);
      return cmd ? 1 : 0;
  }
}

main().then((code) => process.exit(code), (e) => { console.error(`错误  ${e.message}`); process.exit(1); });
