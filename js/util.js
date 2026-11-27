// Small helpers shared by every screen.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
}

// URL sanitization: prevents javascript:, data:, and other XSS vectors
export function safeUrl(url) {
  if (!url) return '#';
  const u = String(url).trim();
  if (/^(?:#|\/|https?:\/\/|blob:|mailto:|tel:)/i.test(u)) return esc(u);
  return '#';
}

// Strip null bytes and dangerous control characters
export function cleanText(s, maxLen = 1000) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, maxLen);
}

// Arabic search normalization: أ/إ/آ → ا, ة → ه, ى → ي, strip tashkeel and tatweel.
export function norm(s) {
  return String(s ?? '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function digits(s) { return String(s ?? '').replace(/\D/g, ''); }

// Iraqi mobile: 07XXXXXXXXX (11 digits). Accepts +964 / 00964 prefixes.
export function normalizePhone(s) {
  let d = digits(s);
  if (d.startsWith('00964')) d = '0' + d.slice(5);
  else if (d.startsWith('964')) d = '0' + d.slice(3);
  return d;
}
export const validPhone = p => /^07\d{9}$/.test(normalizePhone(p));
export const fmtPhone = p => { const d = normalizePhone(p); return d.length === 11 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : p; };
export const maskPhone = p => { const d = normalizePhone(p); return d.length === 11 ? `${d.slice(0, 4)} XXX ${d.slice(7)}` : p; };

export const pad = n => String(n).padStart(2, '0');
export const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 12-hour clock without AM/PM inside the school day: 7:41, 1:30
export function fmtTime(ts) {
  const d = new Date(ts); let h = d.getHours() % 12; if (h === 0) h = 12;
  return `${h}:${pad(d.getMinutes())}`;
}
export function minutesOf(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
export function atTime(base, hhmm) { const d = new Date(base); const [h, m] = hhmm.split(':').map(Number); d.setHours(h, m, 0, 0); return d; }

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
// Dates: weekday name + numbers. «الأحد 22/11/2026», and «أحد 22/11» where space is short.
const SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
export const fmtDay = d => `${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
export const dayName = d => `${SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
export const shortDay = d => SHORT[d.getDay()];

export function ago(ts, now) {
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `منذ ${m} د`;
  return fmtTime(ts);
}

// Deterministic PRNG so the demo data is identical on every device.
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const storage = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: keep in memory */ } },
  del(k) { try { localStorage.removeItem(k); } catch { } },
};

export const ICON = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  check: '<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M2 21v-1a6 6 0 0 1 9.5-4.9"/><path d="m15 18 2.5 2.5L22 16"/>',
  users: '<circle cx="8" cy="6" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 21v-2a5 5 0 0 1 10 0v2M13 21v-1.5a4 4 0 0 1 8 0V21"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  device: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8.5 12a3.5 3.5 0 0 1 7 0v2M12 11v5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M7 5v14l11-7z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.5M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.9 9.9 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chev: '<path d="m15 6-6 6 6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  child: '<circle cx="12" cy="7" r="4"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  up: '<path d="M12 19V6M6 12l6-6 6 6"/><path d="M5 21h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/><path d="M9 7h7M9 11h5"/>',
  hw: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/><path d="M9 7h7M9 11h5"/>',
  ann: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  upload: '<path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  send: '<path d="m21 3-9.5 18-2.5-7.5L2 11z"/><path d="M9 13.5 21 3"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  grade: '<path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5"/><path d="M22 8v6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3z"/><path d="m9 12 2 2 4-4"/>',
  video: '<rect x="2" y="5" width="15" height="14" rx="3"/><path d="m17 10 5-3v10l-5-3"/>',
};
export const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;

/* ---------- reading Excel / Word / CSV files in the browser (no libraries) ----------
   .xlsx and .docx are zip files of XML. We read the zip's central directory, inflate the parts we need
   with the browser's DecompressionStream, and return the first table as rows of text. */
async function unzip(buf, wanted) {
  const v = new DataView(buf); let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('zip');
  const count = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
  const dec = new TextDecoder(); const out = {};
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nlen)); p += 46 + nlen + xlen + clen;
    if (!wanted(name)) continue;
    const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
    const raw = new Uint8Array(buf, start, csize);
    if (method === 0) { out[name] = dec.decode(raw); continue; }
    const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    out[name] = await new Response(ds).text();
  }
  return out;
}
const xml = t => new DOMParser().parseFromString(t, 'application/xml');
const kids = (el, tag) => [...el.getElementsByTagName(tag)];
function colIndex(ref) { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; return [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1; }
async function readXlsx(buf) {
  const f = await unzip(buf, n => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const shared = f['xl/sharedStrings.xml'] ? kids(xml(f['xl/sharedStrings.xml']), 'si').map(si => kids(si, 't').map(t => t.textContent).join('')) : [];
  const sheet = Object.keys(f).filter(n => n.includes('worksheets')).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))[0];
  if (!sheet) return [];
  return kids(xml(f[sheet]), 'row').map(r => { const row = []; kids(r, 'c').forEach((c, i) => {
    const t = c.getAttribute('t'); const vEl = kids(c, 'v')[0]; let val = '';
    if (t === 's') val = shared[+vEl?.textContent] ?? ''; else if (t === 'inlineStr') val = kids(c, 't').map(x => x.textContent).join(''); else val = vEl?.textContent ?? '';
    const ix = colIndex(c.getAttribute('r')); row[ix < 0 ? i : ix] = String(val).trim(); }); return Array.from(row, x => x ?? ''); });
}
async function readDocx(buf) {
  const f = await unzip(buf, n => n === 'word/document.xml'); const d = xml(f['word/document.xml'] || '<x/>');
  const tbl = kids(d, 'w:tbl')[0];
  if (tbl) return kids(tbl, 'w:tr').map(tr => kids(tr, 'w:tc').map(tc => kids(tc, 'w:t').map(t => t.textContent).join('').trim()));
  // No table: one student per paragraph, fields separated by tab, comma, dash or ؛
  return kids(d, 'w:p').map(p => kids(p, 'w:t').map(t => t.textContent).join('').trim()).filter(Boolean).map(l => l.split(/\t|،|,|؛|\s[-–]\s/).map(x => x.trim()));
}
function readCsv(text) {
  const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter(l => l.trim());
  const sep = [',', ';', '\t', '،'].sort((a, b) => (lines[0]?.split(b).length || 0) - (lines[0]?.split(a).length || 0))[0];
  return lines.map(l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; });
}
export async function readTable(file) {
  const name = file.name.toLowerCase();
  if (/\.(xls|doc)$/.test(name)) throw new Error('old');
  if (name.endsWith('.xlsx')) return readXlsx(await file.arrayBuffer());
  if (name.endsWith('.docx')) return readDocx(await file.arrayBuffer());
  if (/\.(csv|txt)$/.test(name)) return readCsv(await file.text());
  throw new Error('type');
}

/* ---------- attached files (handouts, homework pictures) ----------
   Demo: kept in this browser's IndexedDB. With the server they go to Supabase Storage and open from any device. */
const MEMF = {};
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('hader-files', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
export const files = {
  async put(blob, name) {
    const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    MEMF[id] = { blob, name };
    try { const d = await idb(); await new Promise((res, rej) => { const tx = d.transaction('f', 'readwrite'); tx.objectStore('f').put({ blob, name }, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch { }
    return id;
  },
  async get(id) {
    if (MEMF[id]) return MEMF[id];
    try { const d = await idb(); return await new Promise(res => { const r = d.transaction('f').objectStore('f').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch { return null; }
  },
  cache(id, v) { MEMF[id] = v; },
};
export const fmtSize = n => !n ? '' : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;
export function fileKind(name = '', type = '') {
  const n = name.toLowerCase();
  if (type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (/^image\//.test(type) || /\.(png|jpe?g|webp|gif)$/.test(n)) return 'image';
  if (/^video\//.test(type) || /\.(mp4|m4v|webm|mov)$/.test(n)) return 'video';
  if (n.endsWith('.docx')) return 'docx';
  if (n.endsWith('.pptx')) return 'pptx';
  return 'other';
}
// Hand a file to the viewer: through the artifact's download prompt when there is one, otherwise a normal browser download.
export async function saveBlob(blob, name) {
  try { const d = window.claude?.use ? await Promise.race([window.claude.use('downloads'), new Promise(r => setTimeout(() => r(null), 3000))]) : null; if (d) { await d.save({ filename: name, data: blob }); return 'saved'; } } catch (e) { if (e?.code === 'declined') return 'declined'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return 'saved';
}
export async function docxText(blob) {
  const f = await unzip(await blob.arrayBuffer(), n => n === 'word/document.xml'); const d = xml(f['word/document.xml'] || '<x/>');
  return kids(d, 'w:p').map(p => kids(p, 'w:t').map(t => t.textContent).join('')).filter(x => x.trim());
}
// PDF pages rendered on screen with pdf.js (loaded only when someone opens a PDF). Works the same on phone and computer.
let PDFJS = null;
const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/';
export async function loadPdfJs() {
  if (PDFJS) return PDFJS;
  const m = await import(PDFJS_BASE + 'pdf.min.mjs'); m.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.mjs';
  return (PDFJS = m);
}
// Open a PDF exactly as published: character maps (Arabic and other non-Latin encodings) and the standard PDF fonts
// are loaded with it, so text that uses fonts not embedded in the file still draws with the right shapes.
export async function openPdf(bytes) {
  const lib = await loadPdfJs();
  return lib.getDocument({ data: bytes, cMapUrl: PDFJS_BASE + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS_BASE + 'standard_fonts/', useSystemFonts: false, isEvalSupported: false }).promise;
}
// A tiny PDF writer: one JPEG per A4 page. Used to make the demo handout a real file you can open and download.
export function jpegsToPdf(imgs) {
  const enc = new TextEncoder(); const parts = []; let len = 0; const offs = [];
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (id, body) => { offs[id] = len; push(`${id} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${imgs.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${imgs.length} >>`));
  imgs.forEach((im, i) => {
    const p = 3 + i * 3, c = p + 1, x = p + 2; const cs = `q 595 0 0 842 0 0 cm /Im${i} Do Q`;
    obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im${i} ${x} 0 R >> >> /Contents ${c} 0 R >>`));
    obj(c, () => push(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
    obj(x, () => { push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`); push(im.bytes); push('\nendstream'); });
  });
  const total = 3 + imgs.length * 3; const xref = len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n${offs.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
export async function pdfPage(draw) {
  const c = document.createElement('canvas'); c.width = 1240; c.height = 1754; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.direction = 'rtl'; g.textAlign = 'right'; draw(g, c.width, c.height);
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
  return { bytes: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height };
}
export async function sampleHandout({ title, teacher, school }) {
  const F = (w, s) => `${w} ${s}px Cairo, "Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif`;
  const head = (g, W, n) => { g.fillStyle = '#1E2B5C'; g.fillRect(0, 0, W, 150); g.fillStyle = '#fff'; g.font = F(700, 44); g.fillText(title, W - 80, 92); g.font = F(400, 26); g.fillStyle = '#C9D6F0'; g.textAlign = 'left'; g.fillText(`${school}`, 80, 92); g.textAlign = 'right'; g.fillStyle = '#F2A93B'; g.fillRect(0, 150, W, 8); g.fillStyle = '#5B6478'; g.font = F(400, 22); g.textAlign = 'center'; g.fillText(`صفحة ${n}`, W / 2, 1710); g.textAlign = 'right'; };
  const block = (g, W, y, h, t, lines) => { g.fillStyle = '#0B7F70'; g.font = F(700, 34); g.fillText(t, W - 90, y); y += 56; g.fillStyle = '#1E2B5C'; g.font = F(400, 28); lines.forEach(l => { g.fillText(l, W - 110, y); y += h; }); return y + 30; };
  const p1 = await pdfPage((g, W) => { head(g, W, 1); g.fillStyle = '#1E2B5C'; g.font = F(600, 28); g.fillText(`إعداد: ${teacher}`, W - 90, 230);
    let y = block(g, W, 330, 52, 'أولاً: المبتدأ والخبر', ['• المبتدأ اسم مرفوع نبدأ به الجملة الاسمية.', '• الخبر ما يتمم معنى المبتدأ، ويكون مرفوعاً.', '• مثال: العلمُ نورٌ — (العلمُ) مبتدأ، (نورٌ) خبر.', '• الخبر قد يكون مفرداً أو جملة أو شبه جملة.']);
    y = block(g, W, y, 52, 'ثانياً: كان وأخواتها', ['• تدخل على الجملة الاسمية فترفع المبتدأ وتنصب الخبر.', '• أخواتها: أصبح، أمسى، ظل، بات، صار، ليس، ما زال.', '• مثال: كان الجوُّ جميلاً.']);
    g.strokeStyle = '#E3E8EF'; g.lineWidth = 3; g.strokeRect(90, y, W - 180, 230); g.fillStyle = '#8A5A0B'; g.font = F(700, 28); g.fillText('ملاحظة مهمة', W - 120, y + 60); g.fillStyle = '#1E2B5C'; g.font = F(400, 26); g.fillText('ركّز على علامات الإعراب: الضمة للرفع والفتحة للنصب.', W - 120, y + 115); g.fillText('هذي الأسئلة تشبه أسئلة امتحان الشهر.', W - 120, y + 165); });
  const p2 = await pdfPage((g, W) => { head(g, W, 2);
    let y = block(g, W, 260, 62, 'تمارين', ['1. أعرب ما تحته خط: الطالبُ مجتهدٌ.', '2. أدخل (أصبح) على الجملة: السماءُ صافيةٌ.', '3. استخرج المبتدأ والخبر من: المدرسةُ بيتُنا الثاني.', '4. ضع خبراً مناسباً: الوطنُ ........', '5. ما نوع الخبر في: الكتابُ على الطاولة؟', '6. اكتب جملتين فيهما (ليس) واضبطهما بالشكل.']);
    for (let i = 0; i < 9; i++) { g.strokeStyle = '#D5DBE5'; g.lineWidth = 2; g.beginPath(); g.moveTo(110, y + i * 60); g.lineTo(W - 110, y + i * 60); g.stroke(); } });
  return jpegsToPdf([p1, p2]);
}

/* ===== Google Authenticator TOTP (RFC 6238 / HMAC-SHA1) + Pure-JS QR SVG (ISO 18004) ===== */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function sha1Bytes(msg) {
  const len = msg.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const bitLenHi = Math.floor(len / 0x20000000);
  const bitLenLo = (len << 3) >>> 0;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, bitLenHi, false);
  dv.setUint32(total - 4, bitLenLo, false);
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
  const w = new Uint32Array(80);
  const rol = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | ((~b) & d); k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const temp = (rol(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rol(b, 30); b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, h0, false); odv.setUint32(4, h1, false); odv.setUint32(8, h2, false); odv.setUint32(12, h3, false); odv.setUint32(16, h4, false);
  return out;
}
function hmacSha1(key, msg) {
  const k = key.length > 64 ? sha1Bytes(key) : key;
  const ipad = new Uint8Array(64 + msg.length);
  const opad = new Uint8Array(64 + 20);
  for (let i = 0; i < 64; i++) {
    const kb = i < k.length ? k[i] : 0;
    ipad[i] = kb ^ 0x36;
    opad[i] = kb ^ 0x5c;
  }
  ipad.set(msg, 64);
  opad.set(sha1Bytes(ipad), 64);
  return sha1Bytes(opad);
}
export function base32Encode(bytes) {
  let out = '', bits = 0, val = 0;
  for (let i = 0; i < bytes.length; i++) {
    val = (val << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) { bits -= 5; out += B32[(val >>> bits) & 31]; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0;
  const out = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = B32.indexOf(clean[i]);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((val >>> bits) & 0xff); }
  }
  return new Uint8Array(out);
}
export function totpGenerateSecret(byteLen = 20) {
  const buf = new Uint8Array(byteLen);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < byteLen; i++) buf[i] = Math.floor(Math.random() * 256);
  return base32Encode(buf);
}
export function totpCode(secretBase32, timeMs = Date.now(), stepOffset = 0) {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(timeMs / 1000 / 30) + stepOffset;
  const msg = new Uint8Array(8);
  const hi = Math.floor(counter / 0x100000000);
  const lo = counter >>> 0;
  const dv = new DataView(msg.buffer);
  dv.setUint32(0, hi, false);
  dv.setUint32(4, lo, false);
  const mac = hmacSha1(key, msg);
  const off = mac[19] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 1000000).padStart(6, '0');
}
export function totpVerify(secretBase32, inputCode, window = 1, timeMs = Date.now()) {
  const clean = String(inputCode || '').replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  for (let w = -window; w <= window; w++) {
    if (totpCode(secretBase32, timeMs, w) === clean) return true;
  }
  return false;
}
export function totpUri(secretBase32, accountLabel, issuer = 'Hader') {
  const iss = encodeURIComponent(issuer);
  const acc = encodeURIComponent(accountLabel);
  return `otpauth://totp/${iss}:${acc}?secret=${secretBase32}&issuer=${iss}&algorithm=SHA1&digits=6&period=30`;
}

// Pure-JS ISO/IEC 18004 QR Code (Byte mode, ECC Level L, Versions 1..9)
export function qrSvg(text, size = 210) {
  const bytes = new TextEncoder().encode(String(text || ''));
  // [version, dataCodewords, ecPerBlock, numBlocks, alignCenters]
  const VSPEC = [
    null,
    [1, 19, 7, 1, []],
    [2, 34, 10, 1, [6, 18]],
    [3, 55, 15, 1, [6, 22]],
    [4, 80, 20, 1, [6, 26]],
    [5, 108, 26, 1, [6, 30]],
    [6, 136, 18, 2, [6, 34]],
    [7, 156, 20, 2, [6, 22, 38]],
    [8, 194, 24, 2, [6, 24, 42]],
    [9, 232, 30, 2, [6, 26, 46]],
  ];
  const spec = VSPEC.slice(1).find(s => bytes.length + 2 <= s[1]);
  if (!spec) return '';
  const [ver, totalData, ecLen, numBlocks, aligns] = spec;
  const N = 17 + 4 * ver;

  // GF(256) tables (poly 0x11D)
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const gfMul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;
  const rsPoly = deg => {
    let p = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) { next[j] ^= p[j]; next[j + 1] ^= gfMul(p[j], EXP[i]); }
      p = next;
    }
    return p;
  };
  const rsEncode = (data, deg) => {
    const gen = rsPoly(deg);
    const rem = new Uint8Array(deg);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ rem[0];
      rem.copyWithin(0, 1); rem[deg - 1] = 0;
      for (let j = 0; j < deg; j++) rem[j] ^= gfMul(gen[j + 1], factor);
    }
    return rem;
  };

  // Encode byte-mode bit stream
  const bits = [];
  const pushBits = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, 8); // Versions 1..9 use 8-bit length
  for (let i = 0; i < bytes.length; i++) pushBits(bytes[i], 8);
  const capBits = totalData * 8;
  for (let i = 0; i < 4 && bits.length < capBits; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const dataCW = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataCW.push(b);
  }
  const padBytes = [0xEC, 0x11];
  for (let pi = 0; dataCW.length < totalData; pi++) dataCW.push(padBytes[pi & 1]);

  // Split blocks & interleave
  const bSize = totalData / numBlocks;
  const dBlocks = [], eBlocks = [];
  for (let b = 0; b < numBlocks; b++) {
    const blk = dataCW.slice(b * bSize, (b + 1) * bSize);
    dBlocks.push(blk);
    eBlocks.push(rsEncode(blk, ecLen));
  }
  const codewords = [];
  for (let i = 0; i < bSize; i++) for (let b = 0; b < numBlocks; b++) codewords.push(dBlocks[b][i]);
  for (let i = 0; i < ecLen; i++) for (let b = 0; b < numBlocks; b++) codewords.push(eBlocks[b][i]);

  // Build function-pattern matrix
  const mat = Array.from({ length: N }, () => new Int8Array(N).fill(-1));
  const func = Array.from({ length: N }, () => new Uint8Array(N));
  const setF = (r, c, v) => { if (r >= 0 && r < N && c >= 0 && c < N) { mat[r][c] = v ? 1 : 0; func[r][c] = 1; } };
  const drawFinder = (r0, c0) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || r >= N || c < 0 || c >= N) continue;
      const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const dark = inOuter && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      setF(r, c, dark);
    }
  };
  drawFinder(0, 0); drawFinder(0, N - 7); drawFinder(N - 7, 0);
  for (let i = 8; i < N - 8; i++) { setF(6, i, (i & 1) === 0); setF(i, 6, (i & 1) === 0); }
  for (const ar of aligns) for (const ac of aligns) {
    if ((ar === 6 && ac === 6) || (ar === 6 && ac === N - 7) || (ar === N - 7 && ac === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      setF(ar + dr, ac + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
  setF(4 * ver + 9, 8, 1); // Dark module
  // Reserve format info cells
  for (let i = 0; i < 9; i++) { if (i !== 6) { setF(8, i, 0); setF(i, 8, 0); } }
  for (let i = 0; i < 8; i++) { setF(8, N - 1 - i, 0); setF(N - 1 - i, 8, 0); }
  // Version info for V7..V9
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const vBits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = (vBits >>> i) & 1;
      const a = Math.floor(i / 3), b = N - 11 + (i % 3);
      setF(a, b, bit); setF(b, a, bit);
    }
  }

  // Place data bits (zigzag upward/downward right-to-left)
  const allBits = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) allBits.push((cw >>> i) & 1);
  let bi = 0;
  for (let col = N - 1; col >= 1; col -= 2) {
    if (col === 6) col--;
    const up = (((N - 1 - col) >> 1) & 1) === 0;
    for (let step = 0; step < N; step++) {
      const r = up ? N - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!func[r][c]) mat[r][c] = bi < allBits.length ? allBits[bi++] : 0;
      }
    }
  }

  // Evaluate masks 0..7 and pick lowest penalty
  const maskFn = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) === 0,
    (r, c) => (((r * c) % 2 + (r * c) % 3) % 2) === 0,
    (r, c) => (((r + c) % 2 + (r * c) % 3) % 2) === 0,
  ];
  const writeFormat = (grid, m) => {
    const data = (0b01 << 3) | m; // ECC Level L = 01
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const fmt = ((data << 10) | rem) ^ 0x5412;
    const bit = k => (fmt >>> k) & 1;
    for (let i = 0; i <= 5; i++) grid[8][i] = bit(14 - i);
    grid[8][7] = bit(8); grid[8][8] = bit(7); grid[7][8] = bit(6);
    for (let i = 0; i <= 5; i++) grid[5 - i][8] = bit(5 - i);
    for (let i = 0; i <= 7; i++) grid[8][N - 1 - i] = bit(i);
    for (let i = 0; i <= 6; i++) grid[N - 1 - i][8] = bit(14 - i);
  };
  let bestGrid = null, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const g = mat.map((row, r) => row.map((v, c) => func[r][c] ? v : (v ^ (maskFn[m](r, c) ? 1 : 0))));
    writeFormat(g, m);
    let score = 0, dark = 0;
    for (let r = 0; r < N; r++) {
      let runR = 1, runC = 1;
      for (let c = 0; c < N; c++) {
        if (g[r][c]) dark++;
        if (c > 0) { if (g[r][c] === g[r][c - 1]) { runR++; if (runR === 5) score += 3; else if (runR > 5) score++; } else runR = 1; }
        if (c > 0) { if (g[c][r] === g[c - 1][r]) { runC++; if (runC === 5) score += 3; else if (runC > 5) score++; } else runC = 1; }
        if (r > 0 && c > 0 && g[r][c] === g[r - 1][c] && g[r][c] === g[r][c - 1] && g[r][c] === g[r - 1][c - 1]) score += 3;
      }
    }
    score += Math.floor(Math.abs(dark * 100 / (N * N) - 50) / 5) * 10;
    if (score < bestScore) { bestScore = score; bestGrid = g; }
  }

  const qz = 4, vb = N + qz * 2;
  let path = '';
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (bestGrid[r][c]) path += `M${c + qz},${r + qz}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" shape-rendering="crispEdges" role="img" aria-label="رمز QR لتطبيق Google Authenticator"><rect width="${vb}" height="${vb}" fill="#FFFFFF"/><path d="${path}" fill="#111827"/></svg>`;
}
