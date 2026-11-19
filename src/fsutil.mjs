// 逐个文件复制目录。不用 fs.cpSync：它在 Windows + Node 22 上复制到含中文的路径时会静默失败。
import { readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

/** 把 src 目录完整复制到 dest（dest 不存在时创建）；filter 返回 false 的路径跳过。 */
export function copyDir(src, dest, filter = () => true) {
  mkdirSync(dest, { recursive: true });
  for (const d of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, d.name);
    const to = join(dest, d.name);
    if (!filter(from)) continue;
    if (d.isDirectory()) copyDir(from, to, filter);
    else if (d.isFile()) copyFileSync(from, to);
  }
}
