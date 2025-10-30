// tools/versionize.mjs
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT  = resolve('.');
const SRC   = join(ROOT, 'src');
const INDEX = join(ROOT, 'index.html');

// Приоритет: COMMIT_REF → BUILD → дата
const COMMIT = (process.env.COMMIT_REF || process.env.BUILD || '').trim();
const BUILD  = COMMIT || new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);

// walk
async function walk(dir) {
  const out = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

const jsFiles = (await walk(SRC)).filter(p => p.endsWith('.js'));

// imports
const reStatic = /from\s+(['"])(\.{1,2}\/[^'"]+?\.js)(\?[^'"]*)?\1/g;
const reDyn    = /import\s*\(\s*(['"])(\.{1,2}\/[^'"]+?\.js)(\?[^'"]*)?\1\s*\)/g;

// ресурсы в коде: data/*.json, assets/*, images/*, fonts/*, styles.css (редко)
const reRes1 = /(fetch\(\s*['"])(\.{0,2}\/?(?:data|assets|images|fonts)\/[^'"]+?)(\?[^'"]*)?(['"]\s*\))/g;
const reRes2 = /(new\s+URL\(\s*['"])(\.{0,2}\/?(?:data|assets|images|fonts)\/[^'"]+?)(\?[^'"]*)?(['"]\s*,\s*import\.meta\.url\s*\))/g;

let changed = 0;
for (const file of jsFiles) {
  let txt = await fs.readFile(file, 'utf8');
  const before = txt;

  const bump = (_m, q, pth, qs='') => {
    if (qs && /([?&])v=/.test(qs)) return _m;
    const sep = qs ? '&' : '?';
    return `${_m[0]==='i'?'from ':''}${q}${pth}${qs}${sep}v=${BUILD}${q}`;
  };

  txt = txt.replace(reStatic, (m, q, pth, qs) => `from ${q}${pth}${qs?.includes('v=')?qs:(qs?(qs+'&'):'?')+'v='+BUILD}${q}`);
  txt = txt.replace(reDyn,    (m, q, pth, qs) => `import(${q}${pth}${qs?.includes('v=')?qs:(qs?(qs+'&'):'?')+'v='+BUILD}${q})`);

  const bumpRes = (_m, a, pth, qs='', z) => {
    if (qs && /([?&])v=/.test(qs)) return _m;
    const sep = qs ? '&' : '?';
    return `${a}${pth}${qs}${sep}v=${BUILD}${z}`;
  };
  txt = txt.replace(reRes1, bumpRes);
  txt = txt.replace(reRes2, bumpRes);

  if (txt !== before) {
    await fs.writeFile(file, txt, 'utf8');
    changed++;
  }
}

// index.html
let html = await fs.readFile(INDEX, 'utf8');
html = html
  // meta app-build
  .replace(/(<meta[^>]+name=["']app-build["'][^>]+content=["'])[^"']+(["'])/i, `$1${BUILD}$2`)
  // styles.css
  .replace(/(href=["']\s*styles\.css)(\?[^"']*)?(["'])/i,
    (_m,a,qs='',z)=>`${a}${qs?qs.replace(/([?&])v=[^&'"]+/,'$1v='+BUILD):`?v=${BUILD}`}${z}`)
  // entry
  .replace(/(src=["']\s*src\/main\.js)(\?[^"']*)?(["'])/i,
    (_m,a,qs='',z)=>`${a}${qs?qs.replace(/([?&])v=[^&'"]+/,'$1v='+BUILD):`?v=${BUILD}`}${z}`);

await fs.writeFile(INDEX, html, 'utf8');
console.log(`[versionize] BUILD=${BUILD} files_patched=${changed}`);
