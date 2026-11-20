// Fetches openly licensed photos from Wikimedia Commons. Run in GitHub Actions (the dev sandbox cannot reach Commons).
//   node scripts/fetch-photos.mjs candidates   -> out/cand/<id>/<n>.jpg + out/cand/candidates.json
//   node scripts/fetch-photos.mjs final        -> out/final/<id>.jpg + out/final/credits.json (from scripts/photo-picks.json)
import fs from 'node:fs';
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'AussieFoodGarden/1.0 (https://github.com/knightmstr/aussie-food-garden; photo licence check)' };
const OK = /^(cc0|public domain|pdm|cc[- ]by(?!.*(nc|nd))(?:[- ]sa)?[- ]\d)/i;
const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
async function api(params) {
  const u = API + '?' + new URLSearchParams({ format: 'json', origin: '*', ...params });
  const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(r.status + ' ' + u); return r.json();
}
function meta(p) {
  const ii = p.imageinfo && p.imageinfo[0]; if (!ii) return null; const m = ii.extmetadata || {};
  return { title: p.title, thumb: ii.thumburl, w: ii.width, h: ii.height, mime: ii.mime, page: ii.descriptionurl,
    license: strip(m.LicenseShortName && m.LicenseShortName.value), licenseUrl: strip(m.LicenseUrl && m.LicenseUrl.value),
    author: strip(m.Artist && m.Artist.value), desc: strip(m.ImageDescription && m.ImageDescription.value).slice(0, 200) };
}
async function dl(url, file) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) { fs.mkdirSync(file.replace(/\/[^/]+$/, ''), { recursive: true }); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return true; }
    await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
  }
  return false;
}
const mode = process.argv[2];
if (mode === 'candidates') {
  const items = JSON.parse(fs.readFileSync('scripts/photo-items.json', 'utf8')), out = {};
  for (const [id, q] of Object.entries(items)) {
    const d = await api({ action: 'query', generator: 'search', gsrsearch: q + ' filetype:bitmap', gsrnamespace: 6, gsrlimit: 30, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: 900 });
    const pages = Object.values((d.query && d.query.pages) || {}).sort((a, b) => a.index - b.index).map(meta).filter(Boolean);
    const good = pages.filter((m) => m.mime === 'image/jpeg' && m.w >= 900 && OK.test(m.license)).slice(0, 4);
    out[id] = [];
    let n = 0;
    for (const m of good) { n++; if (await dl(m.thumb, `out/cand/${id}/${n}.jpg`)) out[id].push({ n, ...m }); }
    console.log(id, out[id].length);
    await new Promise((s) => setTimeout(s, 400));
  }
  fs.writeFileSync('out/cand/candidates.json', JSON.stringify(out, null, 1));
} else if (mode === 'final') {
  const picks = JSON.parse(fs.readFileSync('scripts/photo-picks.json', 'utf8')), credits = {};
  for (const [id, title] of Object.entries(picks)) {
    const d = await api({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: 900 });
    const m = meta(Object.values(d.query.pages)[0]);
    if (!m || !OK.test(m.license)) { console.log('SKIP (licence)', id, title, m && m.license); continue; }
    if (await dl(m.thumb, `out/final/${id}.jpg`)) credits[id] = { title: m.title, page: m.page, license: m.license, licenseUrl: m.licenseUrl, author: m.author };
    console.log('ok', id, m.license);
  }
  fs.writeFileSync('out/final/credits.json', JSON.stringify(credits, null, 1));
} else { console.error('mode?'); process.exit(1); }
