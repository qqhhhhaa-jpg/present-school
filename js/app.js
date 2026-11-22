import * as db from './store.js';
import { $, $$, esc, icon, fmtTime, fmtDay, dayName, ago, norm, maskPhone, fmtPhone, atTime } from './util.js';
import { views, pwField, bindEyes, notesList } from './views.js';

document.documentElement.dir = 'rtl'; document.documentElement.lang = 'ar';
const app = $('#app');
let current = null;      // { name, view, el }
const navStack = [];     // in-platform history for the back button
let lastNoteCount = 0;

/* ---------- shared UI pieces ---------- */
export const pill = st => `<span class="pill p-${st}">${db.STATUS[st]}</span>`;
export const avatar = (name, st = '', photo = null) => photo ? `<span class="av ph ${st}"><img src="${photo}" alt=""></span>` : `<span class="av ${st}">${esc(name.trim()[0] || '؟')}</span>`;

export function toast(title, body = '', kind = 'in') {
  let box = $('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
  const t = document.createElement('div'); t.className = 'toast';
  const color = kind === 'absent' ? 'var(--red)' : kind === 'late' ? 'var(--amber)' : 'var(--teal)';
  t.innerHTML = `<span class="av" style="background:${color};color:#fff;width:36px;height:36px">${kind === 'absent' ? '!' : '✓'}</span><div style="flex:1"><b>${esc(title)}</b><small>${esc(body)}</small></div>`;
  box.append(t); setTimeout(() => t.remove(), 4000);
}

export function modal(title, html, onMount) {
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="iconbtn" data-close aria-label="إغلاق">${icon('x')}</button></header>${html}</div>`;
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', e => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(scrim);
  onMount?.(scrim.querySelector('.modal'), close);
  scrim.querySelector('input,select,button:not([data-close])')?.focus();
  return close;
}

/* ---------- navigation per role ---------- */
const NAV = {
  owner: [['dashboard', 'الرئيسية', 'home'], ['users', 'المستخدمون', 'users'], ['attendance', 'الحضور', 'check'], ['reports', 'التقارير', 'report'], ['students', 'الطلاب', 'child'], ['classes', 'الصفوف والشعب', 'grid'], ['posts', 'الواجبات والنشر', 'book'], ['marks', 'الدرجات', 'grade'], ['promotion', 'ترحيل الطلبة', 'up'], ['timetable', 'الجدول', 'calendar'], ['inbox', 'رسائل أولياء الأمور', 'chat'], ['devices', 'أجهزة البصمة', 'device'], ['audit', 'سجل العمليات', 'report'], ['school', 'الإعدادات', 'gear']],
  admin: null, // same level as the platform admin: one runs the system, the other runs the school
  teacher: [['teacher', 'اليوم', 'home'], ['attendance', 'الحضور', 'check'], ['posts', 'الواجبات والنشر', 'book'], ['marks', 'الدرجات', 'grade'], ['promotion', 'النتائج والترحيل', 'up'], ['timetable', 'الجدول', 'calendar'], ['reports', 'التقارير', 'report'], ['students', 'طلابي', 'users'], ['inbox', 'الرسائل', 'chat'], ['notes', 'الإشعارات', 'bell']],
  parent: [['parent', 'أولادي', 'child'], ['posts', 'المنشورات', 'book'], ['timetable', 'الجدول', 'calendar'], ['marks', 'الدرجات', 'grade'], ['ask', 'اسأل المدرسة', 'chat'], ['notes', 'الإشعارات', 'bell']],
  student: [['me', 'اليوم', 'home'], ['timetable', 'جدولي', 'calendar'], ['posts', 'واجباتي', 'book'], ['marks', 'درجاتي', 'grade'], ['ask', 'اسأل المدرسة', 'chat'], ['myatt', 'حضوري', 'check'], ['notes', 'الإشعارات', 'bell']],
};
NAV.admin = NAV.owner;
// A teacher sees only the sections the school gave them permission for.
const NAV_PERM = { inbox: 'inbox', reports: 'reports', promotion: 'reports' };
function navFor(c) { const items = NAV[c.role]; if (c.role !== 'teacher') return items; const tid = c.roleInfo.teacherId; return items.filter(([id]) => !NAV_PERM[id] || db.teacherCan(tid, NAV_PERM[id])); }
const SIDE_GROUPS = [
  ['', ['dashboard', 'teacher', 'parent', 'me']],
  ['الحضور والطلاب', ['attendance', 'reports', 'students', 'classes', 'devices', 'myatt']],
  ['التعليم', ['timetable', 'posts', 'marks', 'promotion']],
  ['التواصل', ['inbox', 'ask']],
  ['النظام', ['users', 'audit', 'school']],
  ['', ['notes']],
];
// Phone: four main sections in the bottom bar, everything else in «المزيد» (a sheet that slides up).
const PRIMARY = { owner: ['dashboard', 'attendance', 'posts', 'inbox'], admin: ['dashboard', 'attendance', 'posts', 'inbox'], teacher: ['teacher', 'attendance', 'posts', 'marks'], parent: ['parent', 'posts', 'marks', 'ask'], student: ['me', 'timetable', 'posts', 'marks'] };
const TILE = { promotion: '#7A5BB0', dashboard: '#1E2B5C', users: '#5B6478', attendance: '#0B7F70', reports: '#2B5797', students: '#0B7F70', classes: '#7A5BB0', posts: '#B9770E', marks: '#C8453F', timetable: '#2B5797', inbox: '#0B7F70', ask: '#0B7F70', devices: '#5B6478', audit: '#5B6478', school: '#5B6478', teacher: '#1E2B5C', parent: '#1E2B5C', me: '#1E2B5C', myatt: '#0B7F70', notes: '#B9770E' };
function mobileNav(c, name, items, groups, other, cred, link) {
  const prim = PRIMARY[c.role].map(id => items.find(it => it[0] === id)).filter(Boolean);
  const rest = items.filter(it => !prim.includes(it));
  const moreN = rest.reduce((a, it) => a + badgeFor(c, it[0]), 0);
  const moreOn = !prim.some(it => it[0] === name);
  const tile = ([id, label, ic]) => { const n = badgeFor(c, id); return `<a href="#/${id}" class="mtile ${id === name ? 'on' : ''}" data-mt="${id}"><span class="mti" style="--tc:${TILE[id] || '#1E2B5C'}">${icon(ic, 20)}</span><span class="mtl">${label}</span>${n ? `<span class="cnt">${n}</span>` : ''}</a>`; };
  const sheetGroups = groups.map(([label, its]) => `${label ? `<div class="msec">${label}</div>` : ''}<div class="mgrid">${its.map(tile).join('')}</div>`).join('');
  const SHORT = { inbox: 'الرسائل', posts: c.role === 'student' ? 'واجباتي' : c.role === 'parent' ? 'المنشورات' : 'النشر', ask: 'اسأل', attendance: 'الحضور', dashboard: 'الرئيسية' };
  const blink = ([id, label, ic]) => { const n = badgeFor(c, id); return `<a href="#/${id}" class="${id === name ? 'on' : ''}" ${id === name ? 'aria-current="page"' : ''}><i class="ni">${icon(ic, 18)}</i><span>${SHORT[id] || label}</span>${n ? `<span class="cnt">${n}</span>` : ''}</a>`; };
  return `<nav class="bnav" aria-label="التنقل">${prim.map(blink).join('')}<button type="button" class="bmore ${moreOn ? 'on' : ''}" data-more aria-expanded="false" aria-controls="msheet"><i class="ni">${icon('grid', 18)}</i><span>المزيد</span>${moreN ? `<span class="cnt">${moreN}</span>` : ''}</button></nav>
  <div class="msheet" id="msheet" hidden><div class="mback" data-more-close></div>
    <div class="mpanel" role="dialog" aria-label="كل الأقسام"><div class="mhandle" data-more-close></div>
      <div class="mme">${avatar(c.name)}<div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(c.name)}</b><span class="muted small">${esc(c.roleInfo.label.split(' · ')[0])}${cred && !cred.pending ? ` · <span class="num" dir="ltr">${esc(cred.username)}</span>` : ''}</span></div><button class="iconbtn" data-more-close aria-label="إغلاق">${icon('x', 18)}</button></div>
      ${sheetGroups}
      <div class="macts">${other.map(r => `<button class="btn sm" data-role="${r.rid || r.role}">${icon('swap', 14)}التبديل إلى: ${esc(r.label.split(' · ')[0])}</button>`).join('')}${cred && !cred.pending ? `<button class="btn sm" data-chpw>${icon('key', 14)}تغيير الرمز</button>` : ''}<button class="btn sm" data-install ${matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'hidden' : ''}>${icon('download', 14)}ثبّت التطبيق</button><button class="btn sm danger" data-logout>${icon('logout', 14)}تسجيل الخروج</button></div>
    </div></div>`;
}
function toggleMore(open) {
  const s = $('#msheet'); if (!s) return; const b = $('[data-more]');
  if (open === undefined) open = s.hidden;
  s.hidden = !open; b?.setAttribute('aria-expanded', open); document.body.classList.toggle('msheet-open', open);
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-more]')) { toggleMore(); return; }
  if (e.target.closest('[data-more-close]') || e.target.closest('.mtile') || e.target.closest('.macts button')) toggleMore(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleMore(false); });
const HOME = { owner: 'dashboard', admin: 'dashboard', teacher: 'teacher', parent: 'parent', student: 'me' };

export function ctx() {
  const s = db.session(); if (!s) return null;
  const r = s.roles.find(x => (x.rid || x.role) === s.active) || s.roles[0];
  // inbox: where this person's notifications live (a child without a phone has its own inbox).
  return { ...s, roleInfo: r, role: r.role, rid: r.rid || r.role, name: r.name, inbox: r.inbox || s.phone };
}
// What this account may see: a teacher only their sections, a parent only their children.
export function scope() {
  const c = ctx(); if (!c) return {};
  if (c.role === 'teacher') return { sections: db.teacher(c.roleInfo.teacherId).sections };
  return {};
}

// Count shown on a nav item: unread notifications, new posts, new marks.
function readerKey(c) { return c.role === 'parent' ? c.roleInfo.guardianId : c.role === 'student' ? 's:' + c.roleInfo.studentId : null; }
function badgeFor(c, id) {
  if (id === 'notes') return db.unread(c.inbox);
  if (id === 'inbox') return db.openTickets(scope());
  if (id === 'ask') return db.chatUnread(c.inbox);
  if (id === 'timetable') { if (['owner', 'admin', 'teacher'].includes(c.role)) return db.ttPending(scope().sections); const k = readerKey(c); const kids = c.role === 'parent' ? db.childrenOf(c.roleInfo.guardianId) : [db.student(c.roleInfo.studentId)]; return k ? db.ttNew(k, kids.map(x => x.sectionId)) : 0; }
  const k = readerKey(c); if (!k) return 0;
  if (id === 'posts') return db.newPosts(k);
  if (id === 'marks') return db.newMarks(k);
  return 0;
}
function shell(c, name) {
  const items = navFor(c);
  const link = ([id, label, ic]) => { const n = badgeFor(c, id); return `<a href="#/${id}" class="${id === name ? 'on' : ''}" ${id === name ? 'aria-current="page"' : ''} title="${label}"><i class="ni">${icon(ic, 18)}</i><span>${label}</span>${n ? `<span class="cnt">${n}</span>` : ''}</a>`; };
  // Sidebar: items grouped under small headings (only when the list is long enough to need it).
  const groups = items.length > 6 ? SIDE_GROUPS.map(([label, ids]) => [label, items.filter(it => ids.includes(it[0]))]).filter(g => g[1].length) : [['', items]];
  const placed = new Set(groups.flatMap(g => g[1].map(it => it[0])));
  const rest = items.filter(it => !placed.has(it[0])); if (rest.length) groups.push(['', rest]);
  const navHtml = groups.map(([label, its]) => `${label ? `<div class="nsec">${label}</div>` : ''}${its.map(link).join('')}`).join('');
  const cred = db.credOf(c.phone);
  // A child who came in through the parent's number cannot switch back to the parent: that needs a new SMS.
  const other = c.roleInfo.viaGuardian ? [] : c.roles.filter(r => (r.rid || r.role) !== c.rid);
  let mini = false; try { mini = localStorage.getItem('hader-mini') === '1'; } catch { }
  return `<div class="app${mini ? ' mini' : ''}">
  <aside class="side" aria-label="القائمة">
    <div class="brand"><div class="bmain">${wordmark(38, '#FFFFFF')}<small>${esc(db.settings().schoolName)}</small></div><button class="collapse" data-collapse aria-label="تصغير القائمة" title="تصغير / تكبير القائمة">${icon('chev', 18)}</button></div>
    <nav class="nav">${navHtml}</nav>
    <div class="me">
      <div class="who">${avatar(c.name)}<div style="flex:1;min-width:0"><b class="ell">${esc(c.name)}</b><span class="ell">${esc(c.roleInfo.label.split(' · ')[0])}${cred && !cred.pending ? ` · <span class="num" dir="ltr">${esc(cred.username)}</span>` : ''}</span></div>${cred && !cred.pending ? `<button class="mebtn" data-chpw title="تغيير الرمز" aria-label="تغيير الرمز">${icon('key', 17)}</button>` : ''}</div>
      ${other.map(r => `<button class="sidebtn" data-role="${r.rid || r.role}">${icon('swap', 15)}التبديل إلى: ${esc(r.label.split(' · ')[0])}</button>`).join('')}
      <button class="sidebtn" data-install ${matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'hidden' : ''}>${icon('download', 15)}ثبّت «حاضر» على شاشتك</button>
      <button class="logout" data-logout>${icon('logout', 18)}تسجيل الخروج</button></div>
  </aside>
  <main class="main" id="main"></main>
  ${mobileNav(c, name, items, groups, other, cred, link)}
</div>`;
}

// Real mode shows the device time with ص/م; demo mode keeps the short school-day clock.
function clockText() {
  const ck = db.clock(); if (ck.mode !== 'real') return fmtTime(ck.now);
  const d = new Date(ck.now); return `${fmtTime(ck.now)}<span style="font-size:.8em;margin-inline-start:3px">${d.getHours() < 12 ? 'ص' : 'م'}</span>`;
}
export function topbar(title, sub, actions = '') {
  const c = ctx();
  const ck = db.clock();
  const un = db.unread(c.inbox);
  const canSearch = ['owner', 'admin', 'teacher'].includes(c.role);
  // Back button on every page except the account's home: returns to the previous page inside the platform,
  // or to the natural parent (a section → classes, a student → students, anything else → home).
  const atHome = current ? current.name === HOME[c.role] && !current.arg : true;
  return `<div class="top">
    ${atHome ? '' : `<button type="button" class="iconbtn backbtn" data-back aria-label="رجوع" title="رجوع">${icon('back', 20)}</button>`}
    <div class="t"><h1>${esc(title)}</h1><div class="muted small">${sub}</div></div>
    ${canSearch ? `<label class="search" id="gsearch">${icon('search', 18)}<input id="q" placeholder="ابحث عن طالب: اسم، رقم، هاتف ولي الأمر" autocomplete="off" aria-label="بحث عام"><span class="kbd">/</span><div class="pop" id="qpop" hidden></div></label>` : ''}
    <span class="clock" title="${ck.mode === 'real' ? 'الوقت الحقيقي' : 'ساعة العرض التجريبي'}"><span class="dot ${ck.paused && ck.mode !== 'real' ? '' : 'live'}"></span><span class="num" id="clk">${clockText()}</span>
      ${ck.mode === 'real' ? '' : `<button class="btn sm" data-clock="${ck.paused ? 'play' : 'pause'}" aria-label="${ck.paused ? 'تشغيل' : 'إيقاف'} الساعة" style="min-height:28px;padding:0 8px">${icon(ck.paused ? 'play' : 'pause', 14)}</button>`}</span>
    <button type="button" class="iconbtn mobonly" data-install title="ثبّت «حاضر» على شاشتك" aria-label="ثبّت التطبيق على الشاشة" ${matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'hidden' : ''}>${icon('download')}</button>
    <span class="bellwrap"><button type="button" class="iconbtn" data-bell aria-label="الإشعارات" aria-expanded="false" aria-haspopup="dialog">${icon('bell')}${un ? `<span class="cnt">${un}</span>` : ''}</button><div class="npop" id="npop" role="dialog" aria-label="الإشعارات" hidden></div></span>
    ${actions}
    <button class="iconbtn mob logoutm" data-logout aria-label="تسجيل الخروج">${icon('logout')}</button>
  </div>`;
}

// Hader wordmark: custom rounded Kufi «حاضر» in two tones: the ح in teal (present ✓), the rest in navy, and the gold "something new" diamond.
const WM_REST = '<path d="M198 100 V16"/><path d="M118 100 V88 Q118 64 141 64 Q164 64 164 88 V100 H78 Q62 100 60 116 L57 132"/><path d="M98 100 V86"/>';
const WM_HAH = '<path d="M226 62 H272 L240 100 H198"/>';
const WM = WM_REST + WM_HAH;
const wmInner = (color, teal, dot) => `<g fill="none" stroke-width="19" stroke-linecap="round" stroke-linejoin="round"><g stroke="${color}">${WM_REST}</g><g stroke="${teal}">${WM_HAH}</g></g><rect x="131.5" y="26.5" width="19" height="19" rx="2.3" transform="rotate(45 141 36)" fill="${dot}"/>`;
export function wordmark(h = 32, color = '#1E2B5C', dot = '#F2A93B') {
  const w = Math.round(h * 242 / 140);
  const teal = color === '#1E2B5C' ? '#0B7F70' : '#34C3AE';
  return `<svg width="${w}" height="${h}" viewBox="44 4 242 140" role="img" aria-label="حاضر" style="display:block">${wmInner(color, teal, dot)}</svg>`;
}
let logoN = 0;
export function logo(size = 32) {
  const id = 'hl' + (++logoN);
  return `<svg width="${size}" height="${size}" viewBox="0 0 1024 1024" aria-hidden="true" style="display:block;flex:none"><defs><radialGradient id="${id}g" cx="28%" cy="18%" r="100%"><stop offset="0" stop-color="#2E408A"/><stop offset=".55" stop-color="#1E2B5C"/><stop offset="1" stop-color="#111936"/></radialGradient><linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7C873"/><stop offset=".5" stop-color="#F2A93B"/><stop offset="1" stop-color="#C98322"/></linearGradient></defs><rect width="1024" height="1024" rx="230" fill="url(#${id}g)"/><rect x="40" y="40" width="944" height="944" rx="196" fill="none" stroke="url(#${id}l)" stroke-opacity=".45" stroke-width="${size < 48 ? 0 : 5}"/><g transform="translate(512 512) scale(${size < 48 ? 3.4 : 2.85}) translate(-165 -74)">${wmInner('#FFFFFF', '#34C3AE', `url(#${id}l)`)}</g></svg>`;
}

/* ---------- global search ---------- */
// Picking a student from the global search: pages that can show that student in place (reports, attendance)
// do so and keep you where you are; everywhere else opens the student's profile.
function go(href) {
  const m = href.match(/^#\/student\/(.+)$/);
  if (m && current?.view?.pickStudent && current.view.pickStudent(current.el, m[1])) return;
  location.hash = href;
}
function bindSearch(root) {
  const input = $('#q', root); if (!input) return;
  const pop = $('#qpop', root); let sel = 0, items = [];
  const run = () => {
    const q = input.value.trim();
    if (!q) { pop.hidden = true; return; }
    const r = db.search(q, scope());
    const mark = s => { const n = norm(q); const i = norm(s).indexOf(n); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
    items = [
      ...r.students.map(s => { const st = db.statusOf(s.id).status; return { href: `#/student/${s.id}`, html: `${avatar(s.name, st, db.photoOf(s.id))}<div style="flex:1;min-width:0"><b>${mark(s.name)}</b><div class="muted small">${esc(db.sectionShort(s.sectionId))} · رقم <span class="num">${s.no}</span></div></div>${pill(st)}` }; }),
      ...r.sections.map(s => ({ href: `#/section/${s.id}`, html: `<span class="ti" style="width:40px;height:40px;font-size:13px">${esc(db.grade(s.gradeId).short)}</span><div style="flex:1"><b>${esc(db.sectionLabel(s.id))}</b><div class="muted small">${db.students(s.id).length} طالباً</div></div>` })),
      ...r.guardians.map(g => { const kids = db.childrenOf(g.id); return { href: `#/student/${kids[0]?.id}`, html: `<span class="av" style="background:var(--surface-300);color:var(--ink)">و</span><div style="flex:1"><b>${mark(g.name)}</b><div class="muted small">ولي أمر ${esc(kids.map(k => db.first(k.name)).join('، '))} · <span class="num" dir="ltr">${maskPhone(g.phone)}</span></div></div>` }; }),
    ];
    sel = 0;
    pop.innerHTML = items.length ? items.map((it, i) => `<div class="row ${i === sel ? 'on' : ''}" data-href="${it.href}">${it.html}</div>`).join('') : `<div class="empty">لا نتائج لـ «${esc(q)}»</div>`;
    pop.hidden = false;
  };
  input.addEventListener('input', run);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; $$('.row', pop).forEach((r, i) => r.classList.toggle('on', i === sel)); }
    if (e.key === 'Enter' && items[sel]) { go(items[sel].href); input.value = ''; pop.hidden = true; }
    if (e.key === 'Escape') { input.value = ''; pop.hidden = true; input.blur(); }
  });
  pop.addEventListener('mousedown', e => { const r = e.target.closest('[data-href]'); if (r) { e.preventDefault(); go(r.dataset.href); input.value = ''; pop.hidden = true; } });
  input.addEventListener('blur', () => setTimeout(() => { pop.hidden = true; }, 150));
}
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { const q = $('#q'); if (q) { e.preventDefault(); q.focus(); } }
});

/* ---------- router ---------- */
// Signed in on another device with the same number → sign this one out and say why.
function checkDevice() {
  if (db.session() && !db.sessionValid()) { db.kickOut(); current = null; location.hash = ''; route(); return false; }
  return true;
}
window.addEventListener('storage', e => { if (e.key === db.ACTIVE_EVENT_KEY) checkDevice(); });
function route() {
  if (db.session() && !db.sessionValid()) db.kickOut();
  const c = ctx();
  const [rawName = '', rawArg] = location.hash.replace(/^#\/?/, '').split('/');
  const name = rawName.split('?')[0]; let arg = rawArg && rawArg.split('?')[0];
  try { if (arg) arg = decodeURIComponent(arg); } catch { } // Arabic section ids arrive URL-encoded
  if (!c) { current = null; app.innerHTML = ''; views.login.render(app); return; }
  { const u = db.credOf(c.phone); db.setActor(`${c.name}${u && !u.pending ? ' · ' + u.username : ''} (${c.roleInfo.label.split(' · ')[0]})`); }
  const allowed = [...navFor(c).map(n => n[0]), 'notes', ...(['owner', 'admin', 'teacher'].includes(c.role) ? ['student', 'section'] : [])];
  const target = allowed.includes(name) && views[name] ? name : HOME[c.role];
  if (target !== name) { location.replace(`#/${target}`); return; }
  // Remember where we came from so the back button returns there (not out of the platform).
  const here = `#/${name}${arg ? '/' + arg : ''}`;
  if (navStack[navStack.length - 1] !== here) { if (navStack[navStack.length - 2] === here) navStack.pop(); else navStack.push(here); if (navStack.length > 30) navStack.shift(); }
  app.innerHTML = shell(c, name);
  const main = $('#main');
  current = { name, arg, view: views[name], el: main };
  views[name].render(main, arg);
  bindChrome();
  applyProtection();
  window.scrollTo(0, 0);
}

function bindChrome() { bindSearch(app); }
app.addEventListener('click', e => onChromeClick(e));
// Phone fields: digits only, never more than 11 (Iraqi mobile 07XXXXXXXXX). Also on paste of +964 / spaced numbers.
document.addEventListener('input', e => {
  const i = e.target; if (!i.matches?.('input[data-phone]')) return;
  let d = i.value.replace(/\D/g, '');
  if (d.startsWith('00964')) d = '0' + d.slice(5); else if (d.startsWith('964')) d = '0' + d.slice(3);
  d = d.slice(0, 11);
  if (i.value !== d) i.value = d;
});
function goBack() {
  const c = ctx(); navStack.pop();
  const prev = navStack[navStack.length - 1];
  const parent = { student: '#/students', section: '#/classes' }[current?.name];
  location.hash = prev || parent || `#/${HOME[c.role]}`;
}
function onChromeClick(e) {
  if (e.target.closest('[data-chpw]')) { changePwModal(); return; }
  if (e.target.closest('[data-back]')) { goBack(); return; }
  if (e.target.closest('[data-collapse]')) { const a = $('.app'); const on = !a.classList.contains('mini'); a.classList.toggle('mini', on); try { localStorage.setItem('hader-mini', on ? '1' : '0'); } catch { } return; }
  if (e.target.closest('[data-bell]')) { toggleBell(); return; }
  if (e.target.closest('#npop a')) { closeBell(); return; }
  const b = e.target.closest('[data-logout],[data-role],[data-clock]'); if (!b) return;
  if (b.dataset.logout !== undefined) { db.logout(); location.hash = ''; route(); }
  else if (b.dataset.role) { db.setActiveRole(b.dataset.role); location.hash = ''; route(); }
  else if (b.dataset.clock) { db.setPaused(b.dataset.clock === 'pause'); }
}

/* ---------- bell: tap → panel with the latest notifications; opening it clears the count ---------- */
let bellFresh = null;
function renderBell() {
  const p = $('#npop'); if (!p || p.hidden) return;
  const c = ctx(); const list = db.notes(c.inbox).slice(0, 8);
  p.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line)"><b style="flex:1;font-size:16px">الإشعارات</b><a href="#/notes" class="small" style="color:var(--teal-ink);font-weight:700">كل الإشعارات</a></div>
    <div style="padding:0 14px">${notesList(list, bellFresh)}</div>`;
}
function toggleBell() { const p = $('#npop'); if (!p) return; if (p.hidden) openBell(); else closeBell(); }
function openBell() {
  const p = $('#npop'), b = $('[data-bell]'); const c = ctx();
  bellFresh = new Set(db.notes(c.inbox).filter(n => !n.read).map(n => n.id));
  p.hidden = false; b.setAttribute('aria-expanded', 'true'); renderBell();
  if (bellFresh.size) db.readAll(c.inbox); // count goes to zero, new ones stay highlighted in the panel
}
function closeBell() { const p = $('#npop'); if (p) p.hidden = true; $('[data-bell]')?.setAttribute('aria-expanded', 'false'); bellFresh = null; }
document.addEventListener('mousedown', e => { if (!e.target.closest('.bellwrap')) closeBell(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBell(); });

function changePwModal() {
  modal('تغيير الرمز', `<form id="cp" style="display:flex;flex-direction:column;gap:12px" novalidate>
    ${pwField('old', 'الرمز الحالي')}${pwField('np', 'الرمز الجديد', '', 'new-password', '8 أحرف أو أكثر، بيها حروف وأرقام.')}${pwField('np2', 'أعد كتابة الرمز الجديد', '', 'new-password')}
    <button class="btn pr" style="min-height:48px">حفظ</button></form>`, (m, close) => {
    bindEyes(m);
    $('#cp', m).onsubmit = e => {
      e.preventDefault();
      const r = db.changeOwnPassword($('#old', m).value, $('#np', m).value, $('#np2', m).value);
      $$('.field', m).forEach(f => f.classList.remove('err'));
      if (!r.ok) { const i = $('#' + ({ old: 'old', pw: 'np', pw2: 'np2' }[r.field]), m); const f = i.closest('.field'); f.classList.add('err'); $('.help', f).textContent = r.error; return; }
      close(); toast('تغيّر الرمز', 'من الدخول الجاي استخدم الرمز الجديد');
    };
  });
}

/* ---------- live updates ---------- */
db.subscribe(what => {
  if (!current) return;
  if (!checkDevice()) return;
  const c = ctx(); if (!c) return;
  const clk = $('#clk'); if (clk) clk.innerHTML = clockText();
  if (what === 'clock') {
    const btn = $('[data-clock]');
    if (btn && (btn.dataset.clock === 'pause') === db.clock().paused) refreshTop();
    return;
  }
  // new notification for this account → toast
  const n = db.notes(c.inbox);
  const fresh = n.filter(x => !x.read).length;
  if (fresh > lastNoteCount && n[0] && !n[0].read) toast(n[0].title, n[0].body, n[0].kind);
  lastNoteCount = fresh;
  refreshTop();
  if (bellFresh) { const c2 = ctx(); db.notes(c2.inbox).filter(n => !n.read).forEach(n => bellFresh.add(n.id)); if (db.unread(c2.inbox)) setTimeout(() => db.readAll(c2.inbox)); renderBell(); }
  current.view.update?.(current.el, current.arg, what);
});
function refreshTop() {
  // Re-render the bell counts and the clock button without touching inputs.
  const c = ctx(); const un = db.unread(c.inbox);
  $$('[data-bell]').forEach(a => { a.querySelector('.cnt')?.remove(); if (un) a.insertAdjacentHTML('beforeend', `<span class="cnt">${un}</span>`); });
  ['notes', 'posts', 'marks', 'inbox', 'ask', 'timetable'].forEach(id => { const n = badgeFor(c, id); $$(`.nav a[href="#/${id}"],.bnav a[href="#/${id}"],.mtile[href="#/${id}"]`).forEach(a => { a.querySelector('.cnt')?.remove(); if (n) a.insertAdjacentHTML('beforeend', `<span class="cnt">${n}</span>`); }); });
  { const mb = $('[data-more]'); if (mb) { const prim = PRIMARY[c.role] || []; const n = navFor(c).filter(it => !prim.includes(it[0])).reduce((a, it) => a + badgeFor(c, it[0]), 0); mb.querySelector('.cnt')?.remove(); if (n) mb.insertAdjacentHTML('beforeend', `<span class="cnt">${n}</span>`); } }
  const btn = $('[data-clock]'); if (btn) { const p = db.clock().paused; btn.dataset.clock = p ? 'play' : 'pause'; btn.innerHTML = icon(p ? 'play' : 'pause', 14); $('.clock .dot')?.classList.toggle('live', !p); }
}

window.addEventListener('hashchange', route);
db.init();
lastNoteCount = ctx() ? db.unread(ctx().inbox) : 0;
route();

/* ---------- app on the home screen (PWA) and the number on the app icon ---------- */
let installEvt = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function showInstallBtn() { $$('[data-install]').forEach(b => b.hidden = standalone()); }
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; showInstallBtn(); });
window.addEventListener('appinstalled', () => { installEvt = null; showInstallBtn(); toast('انضاف «حاضر» لشاشتك', 'تفتحه من الأيقونة مثل أي تطبيق'); });
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-install]')) return;
  if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice; if (r.outcome === 'accepted') installEvt = null; return; }
  const hosted = /^https?:$/.test(location.protocol) && !/claude|usercontent|artifact/.test(location.hostname);
  modal('ثبّت «حاضر» على شاشتك', `<div style="display:flex;flex-direction:column;gap:14px">
    <div style="display:flex;gap:14px;align-items:center">${logo(64)}<div><b>أيقونة «حاضر» تطلع على شاشة التليفون</b><div class="muted small">تفتحه منها مثل أي تطبيق، بدون متصفح، ويه عدد الإشعارات على الأيقونة.</div></div></div>
    ${hosted ? '' : '<div class="card" style="background:var(--amber-soft);border-color:#F2D29A;padding:10px 14px" ><b>هذي معاينة.</b> التثبيت يشتغل من رابط المنصة الحقيقي بعد ما ننشرها على الإنترنت (مثلاً على Vercel). الأيقونات والإعدادات جاهزة بالمشروع.</div>'}
    <div><b>آيفون (Safari)</b><ol class="small" style="margin:6px 0 0;padding-inline-start:20px;line-height:2"><li>افتح رابط المنصة بـSafari</li><li>اضغط زر المشاركة (المربع والسهم)</li><li>اختار «إضافة إلى الشاشة الرئيسية» ثم «إضافة»</li></ol></div>
    <div><b>أندرويد (Chrome)</b><ol class="small" style="margin:6px 0 0;padding-inline-start:20px;line-height:2"><li>افتح رابط المنصة بـChrome</li><li>اضغط النقاط الثلاث فوك</li><li>اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»</li></ol></div>
    <div><b>الحاسبة (Chrome أو Edge)</b><div class="small muted">اضغط أيقونة التثبيت يم شريط العنوان.</div></div>
    <button class="btn pr" data-close>تمام</button></div>`);
});
// Unread notifications appear as a number on the app icon (phones and computers that support it).
function appBadge() { try { const c = ctx(); const n = c ? db.unread(c.inbox) : 0; if ('setAppBadge' in navigator) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); } catch { } }
db.subscribe(() => { appBadge(); showInstallBtn(); });
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
setTimeout(() => { showInstallBtn(); appBadge(); }, 500);

/* ---------- privacy: protect what parents and students see ----------
   A website cannot fully block screenshots (only a native app can). What it can do: no downloads, no copy/print,
   cover the screen when the app goes to the background, and stamp every screen, page and video with the viewer's
   name and number so any photo of it shows who took it. */
export function protectedViewer() { const c = ctx(); return !!c && (c.role === 'parent' || c.role === 'student'); }
export function watermarkText() { const c = ctx(); if (!c) return ''; const ph = String(c.phone || ''); return `${c.name} · ${ph.slice(0, 4)}•••${ph.slice(-3)} · ${fmtDay(new Date(db.now()))}`; }
export function watermarkTile(text, op = 0.13, color = '#1E2B5C') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220"><text x="180" y="110" text-anchor="middle" fill="${color}" stroke="${color === '#FFFFFF' ? '#000' : 'none'}" stroke-opacity="${op * .6}" stroke-width=".6" fill-opacity="${op}" font-family="Cairo, Tahoma, sans-serif" font-size="15" font-weight="700" transform="rotate(-24 180 110)">${text.replace(/[<&>]/g, '')}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
function applyProtection() {
  const p = db.protection(); const on = protectedViewer();
  document.body.classList.toggle('prot-copy', on && p.noCopy);
  document.body.classList.toggle('prot-print', on);
  let wm = document.getElementById('wm');
  if (on && p.watermark) { if (!wm) { wm = document.createElement('div'); wm.id = 'wm'; wm.setAttribute('aria-hidden', 'true'); document.body.append(wm); } wm.style.backgroundImage = watermarkTile(watermarkText()); }
  else wm?.remove();
}
const blocked = e => protectedViewer() && db.protection().noCopy;
document.addEventListener('contextmenu', e => { if (blocked() && !e.target.closest('input,textarea')) e.preventDefault(); });
document.addEventListener('dragstart', e => { if (blocked() && e.target.closest('img,video,canvas,a')) e.preventDefault(); });
document.addEventListener('copy', e => { if (blocked() && !e.target.closest?.('input,textarea')) { e.preventDefault(); toast('النسخ غير مسموح', 'محتوى المدرسة خاص', 'absent'); } });
document.addEventListener('keydown', e => {
  if (!protectedViewer()) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && ['s', 'p'].includes(k)) { e.preventDefault(); toast(k === 'p' ? 'الطباعة غير مسموحة' : 'الحفظ غير مسموح', 'محتوى المدرسة خاص', 'absent'); }
  if (k === 'printscreen') { veil(true); setTimeout(() => veil(false), 1200); try { navigator.clipboard?.writeText(''); } catch { } toast('لقطة الشاشة غير مسموحة', 'كل صورة تطلع عليها اسمك ورقمك', 'absent'); }
});
function veil(v) { document.body.classList.toggle('veiled', v && protectedViewer() && db.protection().blurOnLeave); }
document.addEventListener('visibilitychange', () => veil(document.hidden));
window.addEventListener('blur', () => veil(true));
window.addEventListener('focus', () => veil(false));
window.addEventListener('beforeprint', () => { if (protectedViewer()) toast('الطباعة غير مسموحة', 'محتوى المدرسة خاص', 'absent'); });
db.subscribe(w => { if (w === 'settings') applyProtection(); });
