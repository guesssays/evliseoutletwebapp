// tools/versionize.mjs
// Присваивает ?v=<BUILD> всем относительным импортам .js в src/**/*.js и
// проставляет тот же штамп в index.html для CSS и entry-скрипта.

import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve('.');
const SRC  = join(ROOT, 'src');
const INDEX = join(ROOT, 'index.html');

// 1) Генерим билд-штамп (как в meta APP_BUILD)
const BUILD = process.env.BUILD || new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);

// — небольшая утилита обхода файлов —
async function walk(dir) {
  const out = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

// 2) Переписываем все src/**/*.js
const jsFiles = (await walk(SRC)).filter(p => p.endsWith('.js'));

const reStatic = /from\s+(['"])(\.{1,2}\/[^'"]+?\.js)(\?[^'"]*)?\1/g;
const reDyn    = /import\s*\(\s*(['"])(\.{1,2}\/[^'"]+?\.js)(\?[^'"]*)?\1\s*\)/g;

let changedCount = 0;

for (const file of jsFiles) {
  let txt = await fs.readFile(file, 'utf8');
  const before = txt;

  // static imports: import {...} from "./x.js"
  txt = txt.replace(reStatic, (m, q, path, qparams='') => {
    if (qparams && /[?&]v=/.test(qparams)) return m; // уже версионирован
    const sep = qparams ? '&' : '?';
    return `from ${q}${path}${qparams}${sep}v=${BUILD}${q}`;
  });

  // dynamic imports: import("./x.js")
  txt = txt.replace(reDyn, (m, q, path, qparams='') => {
    if (qparams && /[?&]v=/.test(qparams)) return m;
    const sep = qparams ? '&' : '?';
    return `import(${q}${path}${qparams}${sep}v=${BUILD}${q})`;
  });

  if (txt !== before) {
    await fs.writeFile(file, txt, 'utf8');
    changedCount++;
  }
}

// 3) Обновляем index.html: meta APP_BUILD + ссылки на styles.css и entry
let html = await fs.readFile(INDEX, 'utf8');

// meta[name=app-build]
html = html.replace(
  /(<meta[^>]+name=["']app-build["'][^>]+content=["'])[^"']*(["'][^>]*>)/i,
  `$1${BUILD}$2`
);

// styles.css?v=...
html = html.replace(
  /(href=["']styles\.css)(\?[^"']*)?(["'])/i,
  (_m, a, qs='', z) => `${a}${qs ? qs.replace(/([?&])v=[^&'"]+/, `$1v=${BUILD}`) : `?v=${BUILD}`}${z}`
);

// entry <script type="module" src="src/main.js?v=...">
html = html.replace(
  /(src=["']\s*src\/main\.js)(\?[^"']*)?(["'])/i,
  (_m, a, qs='', z) => `${a}${qs ? qs.replace(/([?&])v=[^&'"]+/, `$1v=${BUILD}`) : `?v=${BUILD}`}${z}`
);

await fs.writeFile(INDEX, html, 'utf8');

console.log(`[versionize] BUILD=${BUILD}`);
console.log(`[versionize] js files patched: ${changedCount}`);
