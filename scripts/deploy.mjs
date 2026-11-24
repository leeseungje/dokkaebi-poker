// dist 폴더를 gh-pages 브랜치에 올린다 (GitHub Pages: gh-pages / root)
import { execSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });
const remote = execSync('git remote get-url origin').toString().trim();
const sha = execSync('git rev-parse --short HEAD').toString().trim();
const dir = mkdtempSync(join(tmpdir(), 'pages-'));
cpSync('dist', dir, { recursive: true });
writeFileSync(join(dir, '.nojekyll'), '');
sh('git init -q -b gh-pages', dir);
sh('git add -A', dir);
sh(`git -c user.name=leeseungje -c user.email=leeseungje@users.noreply.github.com commit -q -m "배포 ${sha}"`, dir);
sh(`git push -f -q ${remote} gh-pages`, dir);
rmSync(dir, { recursive: true, force: true });
console.log(`배포 완료 (${sha})`);
