#!/usr/bin/env node
/* Build the offline web app from the markdown in docs/.
 *
 *   node scripts/build.mjs          -> writes dist/
 *   node scripts/build.mjs --check  -> only checks links and files, writes nothing
 *
 * No dependencies. Needs Node 18 or newer.
 * dist/ contains: the app (site/), the pages (content/), a search index (search.json),
 * every markdown table as JSON (data/tables.json, handy for a native app) and a service worker. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs'), site = join(root, 'site'), dist = join(root, 'dist');
const checkOnly = process.argv.includes('--check');

const problems = [];
const warn = (m) => problems.push(m);

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const toPosix = (p) => p.split(sep).join('/');

// Same rule as slug() in site/app.js.
const slug = (t) => t.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '')
  .replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');

const plainInline = (s) => s
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_`~]/g, '')
  .replace(/<[^>]+>/g, '')
  .trim();

/* ---------- nav ---------- */
const nav = JSON.parse(readFileSync(join(docs, 'nav.json'), 'utf8'));
const navPages = new Map();
for (const g of nav.groups) for (const p of g.pages) navPages.set(p.path, { ...p, group: g.title || 'Guide', hidden: !!g.hidden });

const mdFiles = walk(docs).filter((f) => f.endsWith('.md'));
const pagePaths = new Map(mdFiles.map((f) => [toPosix(relative(docs, f)).replace(/\.md$/, ''), f]));

for (const p of navPages.keys()) if (!pagePaths.has(p)) warn(`nav.json lists "${p}" but docs/${p}.md does not exist`);
for (const p of pagePaths.keys()) if (!navPages.has(p)) warn(`docs/${p}.md is not listed in docs/nav.json`);

/* ---------- area data (site/areas/*.json) ---------- */
for (const f of readdirSync(join(site, 'areas')).filter((n) => n.endsWith('.json') && n !== 'zones.json')) {
  let a;
  try { a = JSON.parse(readFileSync(join(site, 'areas', f), 'utf8')); } catch (e) { warn(`site/areas/${f} is not valid JSON`); continue; }
  for (let m = 1; m <= 12; m++) if (!Array.isArray(a.sow?.[m])) warn(`site/areas/${f}: sow list missing for month ${m}`);
  for (const c of a.starter ?? []) if (!pagePaths.has(c.slug)) warn(`site/areas/${f}: crop page "${c.slug}" does not exist`);
  for (const l of a.links ?? []) if (!pagePaths.has(l.path)) warn(`site/areas/${f}: link "${l.path}" does not exist`);
  if (!a.sowSource || !pagePaths.has(a.sowSourcePage)) warn(`site/areas/${f}: sowSource or sowSourcePage is missing or wrong`);
  for (const s of a.seasons ?? []) if (!a.prep?.[s.prep]) warn(`site/areas/${f}: season "${s.label}" uses missing prep list "${s.prep}"`);
}

/* zones.json is checked after the pages are parsed (needs heading ids). */
/* ---------- parse pages ---------- */
const pages = [];
const tables = [];
for (const [path, file] of pagePaths) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const headings = [];
  let title = path, inFence = false, section = '';
  const body = [];
  let tableBuf = [];
  const flushTable = () => {
    if (tableBuf.length >= 2 && /^\s*\|?[\s:|-]+\|?\s*$/.test(tableBuf[1])) {
      const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => plainInline(c.trim().replace(/\\\|/g, '|')));
      const headers = cells(tableBuf[0]);
      const rows = tableBuf.slice(2).map(cells).filter((r) => r.some(Boolean));
      tables.push({ page: path, section, headers, rows });
    }
    tableBuf = [];
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) { body.push(line); continue; }
    if (/^\s*\|/.test(line)) { tableBuf.push(line); } else if (tableBuf.length) flushTable();
    const m = /^(#{1,4})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) {
      const text = plainInline(m[2]);
      if (m[1].length === 1 && title === path) title = text;
      else if (m[1].length <= 3) { headings.push({ id: slug(m[2]), text }); section = text; }
    }
    body.push(line);
  }
  if (tableBuf.length) flushTable();
  const text = body.join('\n')
    .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, ' ')
    .split('\n').map((l) => plainInline(l.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*+]\s+/, '').replace(/\|/g, ' '))).join(' ')
    .replace(/\s+/g, ' ').trim();
  pages.push({ path, title, group: navPages.get(path)?.group ?? 'Guide', headings, text, src, file });
}

/* ---------- link check (relative .md links and anchors) ---------- */
const idsByPage = new Map(pages.map((p) => [p.path, new Set(p.headings.map((h) => h.id))]));
for (const p of pages) {
  const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  const noFence = p.src.replace(/```[\s\S]*?```/g, '');
  while ((m = re.exec(noFence))) {
    const href = m[1];
    if (/^(https?:|mailto:|tel:)/i.test(href)) continue;
    const [target, anchor] = href.split('#');
    let targetPath = p.path;
    if (/\.(jpe?g|png|webp|svg)$/i.test(target || '')) {
      const img = posix.normalize(posix.join(posix.dirname(p.path), target));
      if (!existsSync(join(docs, img))) warn(`${p.path}: image "${href}" not found in docs/`);
      continue;
    }
    if (target) {
      const abs = posix.normalize(posix.join(posix.dirname(p.path), target));
      if (!abs.endsWith('.md')) { warn(`${p.path}: link "${href}" is not an .md page`); continue; }
      targetPath = abs.replace(/\.md$/, '');
      if (!pagePaths.has(targetPath)) { warn(`${p.path}: broken link "${href}"`); continue; }
    }
    if (anchor && !idsByPage.get(targetPath)?.has(anchor)) warn(`${p.path}: anchor "#${anchor}" not found in ${targetPath}`);
  }
}

for (const f of readdirSync(join(site, 'areas')).filter((n) => n.endsWith('.json') && n !== 'zones.json')) {
  const a = JSON.parse(readFileSync(join(site, 'areas', f), 'utf8'));
  if (a.sowSourceAnchor && !idsByPage.get(a.sowSourcePage)?.has(a.sowSourceAnchor)) warn(`site/areas/${f}: sowSourceAnchor "#${a.sowSourceAnchor}" not found in ${a.sowSourcePage}`);
  const names = new Set(Object.values(a.sow ?? {}).flat());
  for (const c of a.starter ?? []) for (const n of c.sowNames ?? []) if (!names.has(n)) warn(`site/areas/${f}: "${c.slug}" sowNames "${n}" is not in the sowing lists`);
}
try {
  const zones = JSON.parse(readFileSync(join(site, 'areas', 'zones.json'), 'utf8'));
  for (const g of zones) for (const z of g.items) {
    if (!pagePaths.has(z.route) && !/^area\/(darwin|sydney)$/.test(z.route)) warn(`zones.json: "${z.name}" points to missing page "${z.route}"`);
    if (z.a && !idsByPage.get(z.route)?.has(z.a)) warn(`zones.json: "${z.name}" anchor "#${z.a}" not found in ${z.route}`);
  }
} catch (e) { warn('site/areas/zones.json is missing or not valid JSON'); }

if (problems.length) {
  console.error(problems.map((x) => '  - ' + x).join('\n'));
  console.error(`\n${problems.length} problem(s) found.`);
  if (checkOnly || process.argv.includes('--strict')) process.exit(1);
}
if (checkOnly) { console.log(`OK: ${pages.length} pages, ${tables.length} tables, links fine.`); process.exit(0); }

/* ---------- write dist ---------- */
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const f of walk(site)) {
  const out = join(dist, relative(site, f));
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(f, out);
}
if (existsSync(join(docs, 'photos'))) for (const f of walk(join(docs, 'photos'))) {
  const out = join(dist, 'photos', relative(join(docs, 'photos'), f));
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(f, out);
}
for (const p of pages) {
  const out = join(dist, 'content', p.path + '.md');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, p.src);
}
writeFileSync(join(dist, 'nav.json'), JSON.stringify(nav));
writeFileSync(join(dist, 'search.json'), JSON.stringify(pages.map(({ path, title, group, headings, text }) => ({ path, title, group, headings, text }))));
mkdirSync(join(dist, 'data'), { recursive: true });
writeFileSync(join(dist, 'data', 'tables.json'), JSON.stringify(tables, null, 1));

const shell = walk(dist).map((f) => './' + toPosix(relative(dist, f))).filter((u) => !u.endsWith('/sw.js') && !u.includes('/data/'));
const hash = createHash('sha1');
for (const u of shell) hash.update(u).update(readFileSync(join(dist, u))); // every shipped file, so any change busts the offline cache
const version = hash.digest('hex').slice(0, 10);
const sw = readFileSync(join(site, 'sw.js'), 'utf8').replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(['./', ...shell], null, 1));
writeFileSync(join(dist, 'sw.js'), sw);

console.log(`Built dist/ — ${pages.length} pages, ${tables.length} tables, cache version ${version}.`);
if (problems.length) console.log(`(${problems.length} warning(s) above)`);
