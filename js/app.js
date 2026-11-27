import * as db from './store.js';
import { $, $$, esc, icon, fmtTime, fmtDay, dayName, ago, norm, maskPhone, fmtPhone, atTime, qrSvg } from './util.js';
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
  document.querySelectorAll('.scrim').forEach(s => s.remove());
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
  owner: [
    ['dashboard', 'الرئيسية', 'home'],
    ['attendance', 'حضور الطلاب', 'check'],
    ['students', 'الطلاب', 'child'],
    ['classes', 'الصفوف والشعب', 'grid'],
    ['reports', 'التقارير', 'report'],
    ['staffAtt', 'حضور الكادر', 'users'],
    ['exemptions', 'استثناءات البصمة', 'shield'],
    ['devices', 'أجهزة البصمة', 'device'],
    ['timetable', 'الجدول', 'calendar'],
    ['posts', 'الواجبات والنشر', 'book'],
    ['marks', 'الدرجات', 'grade'],
    ['promotion', 'ترحيل الطلبة', 'up'],
    ['inbox', 'رسائل أولياء الأمور', 'chat'],
    ['users', 'المستخدمون', 'users'],
    ['audit', 'سجل العمليات', 'report'],
    ['school', 'الإعدادات', 'gear']
  ],
  admin: null, // same level as the platform admin: one runs the system, the other runs the school
  teacher: [
    ['teacher', 'اليوم', 'home'],
    ['attendance', 'حضور الطلاب', 'check'],
    ['students', 'طلابي', 'users'],
    ['reports', 'التقارير', 'report'],
    ['staffAtt', 'بصمتي وحضوري', 'check'],
    ['exemptions', 'استثناءات البصمة', 'shield'],
    ['timetable', 'الجدول', 'calendar'],
    ['posts', 'الواجبات والنشر', 'book'],
    ['marks', 'الدرجات', 'grade'],
    ['promotion', 'النتائج والترحيل', 'up'],
    ['inbox', 'الرسائل', 'chat'],
    ['notes', 'الإشعارات', 'bell']
  ],
  parent: [['parent', 'أولادي', 'child'], ['posts', 'المنشورات', 'book'], ['timetable', 'الجدول', 'calendar'], ['marks', 'الدرجات', 'grade'], ['ask', 'اسأل المدرسة', 'chat'], ['notes', 'الإشعارات', 'bell']],
  student: [['me', 'اليوم', 'home'], ['timetable', 'جدولي', 'calendar'], ['posts', 'واجباتي', 'book'], ['marks', 'درجاتي', 'grade'], ['ask', 'اسأل المدرسة', 'chat'], ['myatt', 'حضوري', 'check'], ['notes', 'الإشعارات', 'bell']],
};
NAV.admin = NAV.owner;
// A teacher sees only the sections the school gave them permission for.
const NAV_PERM = { inbox: 'inbox', reports: 'reports', promotion: 'reports', exemptions: 'exemptions' };
function navFor(c) { const items = NAV[c.role]; if (c.role !== 'teacher') return items; const tid = c.roleInfo.teacherId; return items.filter(([id]) => !NAV_PERM[id] || db.teacherCan(tid, NAV_PERM[id])); }
const SIDE_GROUPS = [
  ['المتابعة اليومية', ['dashboard', 'teacher', 'parent', 'me']],
  ['حضور الطلاب', ['attendance', 'students', 'classes', 'reports', 'myatt']],
  ['دوام الكادر', ['staffAtt']],
  ['أجهزة واستثناءات البصمة', ['exemptions', 'devices']],
  ['التعليم', ['timetable', 'posts', 'marks', 'promotion']],
  ['التواصل والإشعارات', ['inbox', 'ask', 'notes']],
  ['النظام', ['users', 'audit', 'school']],
];
// Phone: four main sections in the bottom bar, everything else in «المزيد» (a sheet that slides up).
const PRIMARY = { owner: ['dashboard', 'attendance', 'posts', 'inbox'], admin: ['dashboard', 'attendance', 'posts', 'inbox'], teacher: ['teacher', 'attendance', 'posts', 'marks'], parent: ['parent', 'posts', 'marks', 'ask'], student: ['me', 'timetable', 'posts', 'marks'] };
const TILE = { staffAtt: '#0B7F70', exemptions: '#6A5A9E', promotion: '#6A5A9E', dashboard: '#2B428C', users: '#3D5A80', attendance: '#0B7F70', reports: '#2F5592', students: '#148678', classes: '#6A5A9E', posts: '#C47F17', marks: '#C8453F', timetable: '#2F5592', inbox: '#0E8A7A', ask: '#0B7F70', devices: '#3D5A80', audit: '#4B5B78', school: '#3D5A80', teacher: '#2B428C', parent: '#2B428C', me: '#2B428C', myatt: '#0B7F70', notes: '#C47F17' };
function mobileNav(c, name, items, groups, other, cred, link) {
  const prim = PRIMARY[c.role].map(id => items.find(it => it[0] === id)).filter(Boolean);
  const rest = items.filter(it => !prim.includes(it));
  const moreN = rest.reduce((a, it) => a + badgeFor(c, it[0]), 0);
  const moreOn = !prim.some(it => it[0] === name);
  const tile = ([id, label, ic]) => { const n = badgeFor(c, id); return `<a href="#/${id}" class="mtile ${id === name ? 'on' : ''}" data-mt="${id}"><span class="mti" style="--tc:${TILE[id] || '#1E2B5C'}">${icon(ic, 20)}</span><span class="mtl">${label}</span>${n ? `<span class="cnt">${n}</span>` : ''}</a>`; };
  const sheetGroups = groups.map(([label, its]) => `${label ? `<div class="msec">${label}</div>` : ''}<div class="mgrid">${its.map(tile).join('')}</div>`).join('');
  const SHORT = { exemptions: 'الاستثناءات', staffAtt: 'دوام الكادر', inbox: 'الرسائل', posts: c.role === 'student' ? 'واجباتي' : c.role === 'parent' ? 'المنشورات' : 'النشر', ask: 'اسأل', attendance: 'الحضور', dashboard: 'الرئيسية' };
  const blink = ([id, label, ic]) => { const n = badgeFor(c, id); return `<a href="#/${id}" class="${id === name ? 'on' : ''}" ${id === name ? 'aria-current="page"' : ''}><i class="ni">${icon(ic, 18)}</i><span>${SHORT[id] || label}</span>${n ? `<span class="cnt">${n}</span>` : ''}</a>`; };
  return `<nav class="bnav" aria-label="التنقل">${prim.map(blink).join('')}<button type="button" class="bmore ${moreOn ? 'on' : ''}" data-more aria-expanded="false" aria-controls="msheet"><i class="ni">${icon('grid', 18)}</i><span>المزيد</span>${moreN ? `<span class="cnt">${moreN}</span>` : ''}</button></nav>
  <div class="msheet" id="msheet" hidden><div class="mback" data-more-close></div>
    <div class="mpanel" role="dialog" aria-label="كل الأقسام"><div class="mhandle" data-more-close></div>
      <div class="mme">${avatar(c.name)}<div style="flex:1;min-width:0"><b class="ell" style="display:block">${esc(c.name)}</b><span class="muted small">${esc(c.roleInfo.label.split(' · ')[0])}${cred && !cred.pending ? ` · <span class="num" dir="ltr">${esc(cred.username)}</span>` : ''}</span></div><button class="iconbtn" data-more-close aria-label="إغلاق">${icon('x', 18)}</button></div>
      ${sheetGroups}
      <div class="macts">${other.map(r => `<button class="btn sm" data-role="${r.rid || r.role}">${icon('swap', 14)}التبديل إلى: ${esc(r.label.split(' · ')[0])}</button>`).join('')}<button class="btn sm" data-notif-req>${icon('bell', 14)}إشعارات الجهاز</button>${cred && !cred.pending ? `${db.REQUIRE_TOTP_ON_LOGIN ? `<button class="btn sm" data-totp>${icon('shield', 14)}Google Authenticator</button>` : ''}<button class="btn sm" data-chpw>${icon('key', 14)}تغيير الرمز</button>` : ''}<button class="btn sm" data-install ${matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'hidden' : ''}>${icon('download', 14)}ثبّت التطبيق</button><button class="btn sm danger" data-logout>${icon('logout', 14)}تسجيل الخروج</button></div>
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
  const link = ([id, label, ic]) => { const n = badgeFor(c, id); return `<a href="#/${id}" class="${id === name ? 'on' : ''}" ${id === name ? 'aria-current="page"' : ''} title="${label}"><i class="ni" style="--ic:${TILE[id] || '#2B428C'}">${icon(ic, 17)}</i><span>${label}</span>${n ? `<span class="cnt">${n}</span>` : ''}</a>`; };
  // Sidebar: always group items under clear section headings for every role (including parent).
  const groups = SIDE_GROUPS.map(([label, ids]) => [label, items.filter(it => ids.includes(it[0]))]).filter(g => g[1].length);
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
      <div class="who">${avatar(c.name)}<div style="flex:1;min-width:0"><b class="ell">${esc(c.name)}</b><span class="ell">${esc(c.roleInfo.label.split(' · ')[0])}${cred && !cred.pending ? ` · <span class="num" dir="ltr">${esc(cred.username)}</span>` : ''}</span></div>${cred && !cred.pending ? `${db.REQUIRE_TOTP_ON_LOGIN ? `<button class="mebtn ${db.totpStatus(c.phone).enabled ? 'tfa-on' : ''}" data-totp title="Google Authenticator (2FA)" aria-label="Google Authenticator">${icon('shield', 17)}</button>` : ''}<button class="mebtn" data-chpw title="تغيير الرمز" aria-label="تغيير الرمز">${icon('key', 17)}</button>` : ''}</div>
      ${other.map(r => `<button class="sidebtn" data-role="${r.rid || r.role}">${icon('swap', 15)}التبديل إلى: ${esc(r.label.split(' · ')[0])}</button>`).join('')}
      <button class="sidebtn" data-notif-req>${icon('bell', 15)}<span data-notif-lbl>تفعيل إشعارات الجهاز</span></button>
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
const SECTION_SEARCH_CONFIG = {
  dashboard: {
    isGlobal: true,
    badge: 'بحث عام',
    placeholder: 'بحث عام: طالب، رقم، شعبة، ولي أمر...',
    title: 'بحث شامل في المنصة'
  },
  teacher: {
    isGlobal: true,
    badge: 'بحث عام',
    placeholder: 'بحث عام: طالب، رقم، شعبة...',
    title: 'بحث شامل'
  },
  students: {
    isGlobal: false,
    badge: 'الطلاب',
    placeholder: 'بحث في قائمة الطلاب: الاسم، الرقم...',
    title: 'بحث في قسم الطلاب'
  },
  student: {
    isGlobal: false,
    badge: 'الطالب',
    placeholder: 'بحث في تفاصيل وسجل الطالب...',
    title: 'بحث في تفاصيل الطالب'
  },
  attendance: {
    isGlobal: false,
    badge: 'الحضور',
    placeholder: 'بحث في حضور وغياب اليوم...',
    title: 'بحث في الحضور والانصراف'
  },
  staffAtt: {
    isGlobal: false,
    badge: 'دوام الكادر',
    placeholder: 'بحث في بصمات وحضور الكادر...',
    title: 'بحث في دوام وبصمات الكادر التعليمي'
  },
  exemptions: {
    isGlobal: false,
    badge: 'استثناءات البصمة',
    placeholder: 'بحث في الاستثناءات: اسم، رقم أمر، عذر...',
    title: 'بحث في استثناءات البصمة والحالات الخاصة'
  },
  classes: {
    isGlobal: false,
    badge: 'الصفوف والشعب',
    placeholder: 'بحث في الصفوف والشعب والمشرفين...',
    title: 'بحث في الصفوف والشعب'
  },
  section: {
    isGlobal: false,
    badge: 'الشعبة',
    placeholder: 'بحث في طلاب هذه الشعبة...',
    title: 'بحث في طلاب الشعبة'
  },
  devices: {
    isGlobal: false,
    badge: 'أجهزة البصمة',
    placeholder: 'بحث في أجهزة البصمة: الاسم، الـ IP...',
    title: 'بحث في أجهزة البصمة'
  },
  posts: {
    isGlobal: false,
    badge: 'المنشورات',
    placeholder: 'بحث في المنشورات والواجبات...',
    title: 'بحث في الواجبات والمنشورات'
  },
  marks: {
    isGlobal: false,
    badge: 'الدرجات',
    placeholder: 'بحث في درجات الطلاب والمواد...',
    title: 'بحث في درجات الطلاب'
  },
  users: {
    isGlobal: false,
    badge: 'المستخدمون',
    placeholder: 'بحث في المستخدمين والصلاحيات...',
    title: 'بحث في المستخدمين'
  },
  audit: {
    isGlobal: false,
    badge: 'سجل العمليات',
    placeholder: 'بحث في سجل العمليات والتدقيق...',
    title: 'بحث في سجل العمليات'
  },
  inbox: {
    isGlobal: false,
    badge: 'الرسائل',
    placeholder: 'بحث في رسائل أولياء الأمور...',
    title: 'بحث في الرسائل'
  },
  reports: {
    isGlobal: false,
    badge: 'التقارير',
    placeholder: 'بحث في تقارير الحضور الشهرية...',
    title: 'بحث في التقارير'
  },
  timetable: {
    isGlobal: false,
    badge: 'الجدول',
    placeholder: 'بحث في جدول الحصص والمواد...',
    title: 'بحث في الجدول الأسبوعي'
  },
  promotion: {
    isGlobal: false,
    badge: 'الترحيل',
    placeholder: 'بحث في ترحيل ونتائج الطلاب...',
    title: 'بحث في ترحيل الطلبة'
  },
  school: {
    isGlobal: false,
    badge: 'الإعدادات',
    placeholder: 'بحث في إعدادات المنصة...',
    title: 'بحث في الإعدادات'
  }
};

export function getSectionSearchConfig(name) {
  return SECTION_SEARCH_CONFIG[name] || {
    isGlobal: false,
    badge: 'القسم',
    placeholder: 'بحث في هذا القسم...',
    title: 'بحث في هذا القسم'
  };
}

export function topbar(title, sub, actions = '') {
  const c = ctx();
  const ck = db.clock();
  const un = db.unread(c.inbox);
  const canSearch = ['owner', 'admin', 'teacher'].includes(c.role);
  // Back button on every page except the account's home: returns to the previous page inside the platform,
  // or to the natural parent (a section → classes, a student → students, anything else → home).
  const atHome = current ? current.name === HOME[c.role] && !current.arg : true;
  const secName = current?.name || 'dashboard';
  const scfg = getSectionSearchConfig(secName);
  return `<div class="top">
    ${atHome ? '' : `<button type="button" class="iconbtn backbtn" data-back aria-label="رجوع" title="رجوع">${icon('back', 20)}</button>`}
    <div class="t"><h1>${esc(title)}</h1><div class="muted small">${sub}</div></div>
    ${canSearch ? `<label class="search" id="gsearch" data-section="${secName}" title="${scfg.title}">${icon('search', 18)}<span class="sbadge ${scfg.isGlobal ? 'sbadge-global' : ''}">${scfg.badge}</span><input id="q" placeholder="${scfg.placeholder}" autocomplete="off" aria-label="${scfg.title}"><span class="kbd">/</span><div class="pop" id="qpop" hidden></div></label>` : ''}
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

/* ---------- contextual / section-scoped search ---------- */
// Picking a student from search: pages that can show that student in place (attendance, reports)
// do so and keep you where you are; everywhere else opens the student's profile.
function go(it) {
  if (typeof it === 'object' && it?.onClick) {
    it.onClick();
    return;
  }
  const href = typeof it === 'string' ? it : it?.href;
  if (!href) return;
  const m = href.match(/^#\/student\/(.+)$/);
  if (m && current?.view?.pickStudent && current.view.pickStudent(current.el, m[1])) return;
  location.hash = href;
}

function bindSearch(root) {
  const input = $('#q', root); if (!input) return;
  const pop = $('#qpop', root); let sel = 0, items = [];
  const secName = current?.name || 'dashboard';
  const scfg = getSectionSearchConfig(secName);

  const resetInPageFilters = () => {
    if (secName === 'students') {
      const sq = $('#sq', current?.el);
      if (sq && sq.value) { sq.value = ''; sq.dispatchEvent(new Event('input', { bubbles: true })); }
    } else if (secName === 'attendance') {
      const aq = $('#aq', current?.el);
      if (aq && aq.value) { aq.value = ''; aq.dispatchEvent(new Event('input', { bubbles: true })); }
    } else if (secName === 'reports') {
      const rq = $('#rq', current?.el);
      if (rq && rq.value) { rq.value = ''; rq.dispatchEvent(new Event('input', { bubbles: true })); }
    } else if (secName === 'users') {
      const uq = $('#uq', current?.el);
      if (uq && uq.value) { uq.value = ''; uq.dispatchEvent(new Event('input', { bubbles: true })); }
    } else if (secName === 'audit') {
      const audq = $('#audq', current?.el);
      if (audq && audq.value) { audq.value = ''; audq.dispatchEvent(new Event('input', { bubbles: true })); }
    } else if (secName === 'devices') {
      $$('#live .tile', current?.el).forEach(el => el.style.display = '');
    } else if (secName === 'classes') {
      $$('#live .card, #live .sec, #live [data-addsec]', current?.el).forEach(el => el.style.display = '');
    } else if (secName === 'posts') {
      $$('#live .card, #live [data-post]', current?.el).forEach(card => card.style.display = '');
    } else if (secName === 'marks') {
      $$('#live .card', current?.el).forEach(card => card.style.display = '');
    } else if (secName === 'inbox') {
      $$('#live .ticket', current?.el).forEach(t => t.style.display = '');
    }
  };

  const triggerItem = (it) => {
    if (!it) return;
    if (it.onClick) {
      it.onClick();
    } else if (it.href) {
      go(it.href);
    }
    input.value = '';
    pop.hidden = true;
  };

  const run = () => {
    const q = input.value.trim();
    if (!q) {
      pop.hidden = true;
      resetInPageFilters();
      return;
    }
    const nq = norm(q);
    const mark = s => {
      if (!s) return '';
      const str = String(s);
      const n = norm(str); const i = n.indexOf(nq);
      return i < 0 ? esc(str) : esc(str.slice(0, i)) + '<mark>' + esc(str.slice(i, i + q.length)) + '</mark>' + esc(str.slice(i + q.length));
    };

    items = [];

    if (scfg.isGlobal) {
      // ===== GLOBAL SEARCH (الرئيسية فقط للسهولة) =====
      const r = db.search(q, scope());
      items = [
        ...r.students.map(s => {
          const st = db.statusOf(s.id).status;
          return {
            href: `#/student/${s.id}`,
            html: `${avatar(s.name, st, db.photoOf(s.id))}<div style="flex:1;min-width:0"><b>${mark(s.name)}</b><div class="muted small">${esc(db.sectionShort(s.sectionId))} · رقم <span class="num">${s.no}</span></div></div>${pill(st)}`
          };
        }),
        ...r.sections.map(s => ({
          href: `#/section/${s.id}`,
          html: `<span class="tip" style="width:42px;height:42px;border-radius:13px">${icon('grade', 16)}<b>${esc(db.grade(s.gradeId).short)}</b></span><div style="flex:1"><b>${esc(db.sectionLabel(s.id))}</b><div class="muted small">${db.students(s.id).length} طالباً</div></div>`
        })),
        ...r.guardians.map(g => {
          const kids = db.childrenOf(g.id);
          return {
            href: `#/student/${kids[0]?.id}`,
            html: `<span class="av" style="background:var(--surface-300);color:var(--ink)">و</span><div style="flex:1"><b>${mark(g.name)}</b><div class="muted small">ولي أمر ${esc(kids.map(k => db.first(k.name)).join('، '))} · <span class="num" dir="ltr">${maskPhone(g.phone)}</span></div></div>`
          };
        }),
      ];
    } else {
      // ===== SECTION-SPECIFIC SEARCH (حسب نوع القسم) =====
      const sc = scope();

      if (secName === 'students') {
        const r = db.search(q, sc).students;
        items = r.map(s => {
          const st = db.statusOf(s.id).status;
          const g = db.guardian(s.guardianId);
          return {
            href: `#/student/${s.id}`,
            html: `${avatar(s.name, st, db.photoOf(s.id))}<div style="flex:1;min-width:0"><b>${mark(s.name)}</b><div class="muted small">${esc(db.sectionShort(s.sectionId))} · رقم <span class="num">${s.no}</span>${g ? ` · ولي الأمر: ${esc(g.name)}` : ''}</div></div>${pill(st)}`
          };
        });
        const sq = $('#sq', current?.el);
        if (sq && sq.value !== q) {
          sq.value = q;
          sq.dispatchEvent(new Event('input', { bubbles: true }));
        }

      } else if (secName === 'attendance') {
        let list = db.students();
        if (sc.sections) list = list.filter(s => sc.sections.includes(s.sectionId));
        const matched = list.filter(s => norm(s.name).includes(nq) || String(s.no).includes(q));
        const attDay = db.days()[0];
        items = matched.map(s => {
          const x = db.statusOf(s.id, attDay);
          const timeInfo = x.inEv ? fmtTime(x.inEv.ts) : (x.excuse ? x.excuse.reason : 'لم يصل');
          return {
            href: `#/student/${s.id}`,
            onClick: () => {
              if (current?.view?.pickStudent) current.view.pickStudent(current.el, s.id);
              else location.hash = `#/student/${s.id}`;
            },
            html: `${avatar(s.name, x.status, db.photoOf(s.id))}<div style="flex:1;min-width:0"><b>${mark(s.name)}</b><div class="muted small">${esc(db.sectionShort(s.sectionId))} · ${timeInfo}</div></div>${pill(x.status)}`
          };
        });
        const aq = $('#aq', current?.el);
        if (aq && aq.value !== q) {
          aq.value = q;
          aq.dispatchEvent(new Event('input', { bubbles: true }));
        }

      } else if (secName === 'classes') {
        const secs = sc.sections ? db.sections().filter(s => sc.sections.includes(s.id)) : db.sections();
        const matched = secs.filter(s => norm(db.sectionLabel(s.id)).includes(nq) || norm(s.homeroom || '').includes(nq) || String(s.room || '').includes(q));
        items = matched.map(s => ({
          href: `#/section/${s.id}`,
          html: `<span class="tip" style="width:42px;height:42px;border-radius:13px">${icon('grade', 16)}<b>${esc(db.grade(s.gradeId).short)}</b></span><div style="flex:1;min-width:0"><b>${mark(db.sectionLabel(s.id))}</b><div class="muted small">مشرف الشعبة: ${esc(s.homeroom || '—')} · ${db.students(s.id).length} طالباً · قاعة <span class="num">${s.room}</span></div></div>`
        }));
        $$('#live .card, #live .sec, #live [data-addsec]', current?.el).forEach(el => {
          const text = el.textContent || '';
          el.style.display = norm(text).includes(nq) ? '' : 'none';
        });

      } else if (secName === 'section') {
        const secId = current?.arg;
        const list = db.students(secId);
        const matched = list.filter(s => norm(s.name).includes(nq) || String(s.no).includes(q));
        items = matched.map(s => {
          const x = db.statusOf(s.id);
          return {
            href: `#/student/${s.id}`,
            html: `${avatar(s.name, x.status, db.photoOf(s.id))}<div style="flex:1;min-width:0"><b>${mark(s.name)}</b><div class="muted small">رقم <span class="num">${s.no}</span> · شعبة ${esc(db.sectionShort(s.sectionId))}</div></div>${pill(x.status)}`
          };
        });

      } else if (secName === 'devices') {
        const devs = db.devices ? db.devices() : [];
        const matched = devs.filter(d => norm(d.name).includes(nq) || norm(d.location || '').includes(nq) || (d.ip && d.ip.includes(q)) || (d.serial && d.serial.includes(q)) || (d.model && norm(d.model).includes(nq)));
        items = matched.map(d => ({
          href: `#/devices`,
          onClick: () => {
            const card = $(`[data-dev-id="${d.id}"]`, current?.el);
            if (card) {
              card.scrollIntoView({ behavior: 'smooth', block: 'center' });
              card.style.outline = '2px solid var(--teal)';
              setTimeout(() => { card.style.outline = ''; }, 2000);
            }
          },
          html: `<span class="ti" style="width:40px;height:40px;border-radius:12px;--ic:${d.online ? '#0B7F70' : '#C8453F'}">${icon(d.type === 'zk' ? 'device' : 'child', 20)}</span><div style="flex:1;min-width:0"><b>${mark(d.name)}</b><div class="muted small">${esc(d.model || '')} · <span class="num" dir="ltr">${esc(d.serial || d.ip || '—')}</span></div></div><span class="pill ${d.online ? 'p-present' : 'p-absent'}">${d.online ? 'متصل' : 'منقطع'}</span>`
        }));
        $$('#live .tile', current?.el).forEach(tile => {
          const text = tile.textContent || '';
          tile.style.display = norm(text).includes(nq) ? '' : 'none';
        });

      } else if (secName === 'posts') {
        const posts = db.posts ? db.posts(scope()) : [];
        const matched = posts.filter(p => norm(p.title || '').includes(nq) || norm(p.body || '').includes(nq) || norm(p.by || '').includes(nq) || (p.subject && norm(p.subject).includes(nq)));
        items = matched.map(p => ({
          href: `#/posts`,
          onClick: () => {
            const card = $(`[data-post="${p.id}"]`, current?.el);
            if (card) card.click();
            else location.hash = '#/posts';
          },
          html: `<span class="ti" style="width:40px;height:40px;border-radius:12px;--ic:${p.type === 'hw' ? '#C47F17' : '#1E2B5C'}">${icon(p.type === 'hw' ? 'book' : 'spark', 18)}</span><div style="flex:1;min-width:0"><b>${mark(p.title)}</b><div class="muted small">${esc(p.subject || (p.type === 'hw' ? 'واجب' : 'إعلان'))} · ${esc(p.by || '')}</div></div>`
        }));
        $$('#live .card, #live [data-post]', current?.el).forEach(card => {
          const text = card.textContent || '';
          card.style.display = norm(text).includes(nq) ? '' : 'none';
        });

      } else if (secName === 'marks') {
        const secs = sc.sections ? db.sections().filter(s => sc.sections.includes(s.id)) : db.sections();
        const allMarks = db.marks ? db.marks({ sections: secs.map(s => s.id) }) : [];
        const matched = allMarks.filter(m => norm(m.subject || '').includes(nq) || norm(m.exam || '').includes(nq) || norm(m.lesson || '').includes(nq) || norm(m.byName || '').includes(nq));
        items = matched.map(m => ({
          href: `#/marks`,
          onClick: () => {
            const card = $(`[data-sheet="${m.id}"]`, current?.el);
            if (card) card.click();
            else location.hash = '#/marks';
          },
          html: `<span class="ti" style="width:40px;height:40px;border-radius:12px;--ic:#1E2B5C">${icon('grade', 20)}</span><div style="flex:1;min-width:0"><b>${mark(m.subject)} · ${mark(m.exam)}</b><div class="muted small">${esc(db.sectionShort(m.sectionId))} · ${esc(m.byName || '')}</div></div>`
        }));
        $$('#live .card', current?.el).forEach(card => {
          const text = card.textContent || '';
          card.style.display = norm(text).includes(nq) ? '' : 'none';
        });

      } else if (secName === 'users') {
        const accounts = db.accounts ? db.accounts() : [];
        const matched = accounts.filter(a => a.roles.some(r => norm(r.name || '').includes(nq)) || (a.phone && a.phone.includes(q)) || (() => { const cr = db.credOf(a.phone); return cr && norm(cr.username || '').includes(nq); })());
        items = matched.map(a => {
          const cr = db.credOf(a.phone);
          return {
            href: `#/users`,
            onClick: () => {
              const row = $(`[data-edit="${a.phone}"]`, current?.el)?.closest('tr');
              if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.style.background = 'var(--surface-300)'; setTimeout(() => { row.style.background = ''; }, 2000); }
            },
            html: `${avatar(a.roles[0]?.name || '')}<div style="flex:1;min-width:0"><b>${mark(a.roles[0]?.name || '')}</b><div class="muted small">${esc(a.roles.map(r => r.role).join('، '))} · <span class="num" dir="ltr">${esc(cr?.username || maskPhone(a.phone))}</span></div></div>`
          };
        });
        const uq = $('#uq', current?.el);
        if (uq && uq.value !== q) {
          uq.value = q;
          uq.dispatchEvent(new Event('input', { bubbles: true }));
        }

      } else if (secName === 'audit') {
        const logs = db.audit ? db.audit() : [];
        const matched = logs.filter(a => norm(a.actor || '').includes(nq) || norm(a.action || '').includes(nq) || norm(a.detail || a.details || '').includes(nq));
        items = matched.slice(0, 40).map(a => ({
          href: `#/audit`,
          html: `<div style="flex:1;min-width:0"><b>${mark(a.action || 'عملية')}</b><div class="muted small">${esc(a.actor || a.by || '—')} · ${esc(a.detail || a.details || '')} · <span class="num">${fmtTime(a.ts)}</span></div></div>`
        }));
        const audq = $('#audq', current?.el);
        if (audq && audq.value !== q) {
          audq.value = q;
          audq.dispatchEvent(new Event('input', { bubbles: true }));
        }

      } else if (secName === 'inbox') {
        const tickets = db.tickets ? db.tickets(sc) : [];
        const matched = tickets.filter(t => norm(t.name || '').includes(nq) || norm(t.question || '').includes(nq));
        items = matched.map(t => ({
          href: `#/inbox`,
          onClick: () => {
            const card = $(`[data-reply="${t.id}"]`, current?.el)?.closest('.ticket');
            if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.style.outline = '2px solid var(--teal)'; setTimeout(() => { card.style.outline = ''; }, 2000); }
          },
          html: `<div style="flex:1;min-width:0"><b>${mark(t.name)}</b><div class="muted small">${esc((t.question || '').slice(0, 60))}</div></div><span class="pill ${t.status === 'open' ? 'p-late' : 'p-present'}">${t.status === 'open' ? 'بانتظار الرد' : 'تم الرد'}</span>`
        }));
        $$('#live .ticket', current?.el).forEach(ticket => {
          const text = ticket.textContent || '';
          ticket.style.display = norm(text).includes(nq) ? '' : 'none';
        });

      } else if (secName === 'reports') {
        const r = db.search(q, sc).students;
        items = r.map(s => {
          const st = db.statusOf(s.id).status;
          return {
            href: `#/student/${s.id}`,
            html: `${avatar(s.name, st, db.photoOf(s.id))}<div style="flex:1;min-width:0"><b>${mark(s.name)}</b><div class="muted small">${esc(db.sectionShort(s.sectionId))} · رقم <span class="num">${s.no}</span></div></div>${pill(st)}`
          };
        });
        const rq = $('#rq', current?.el);
        if (rq && rq.value !== q) {
          rq.value = q;
          rq.dispatchEvent(new Event('input', { bubbles: true }));
        }

      } else {
        const r = db.search(q, sc).students;
        items = r.map(s => {
          const st = db.statusOf(s.id).status;
          return {
            href: `#/student/${s.id}`,
            html: `${avatar(s.name, st, db.photoOf(s.id))}<div style="flex:1;min-width:0"><b>${mark(s.name)}</b><div class="muted small">${esc(db.sectionShort(s.sectionId))} · رقم <span class="num">${s.no}</span></div></div>${pill(st)}`
          };
        });
      }
    }

    sel = 0;
    pop.innerHTML = items.length
      ? items.map((it, i) => `<div class="row ${i === sel ? 'on' : ''}" data-idx="${i}" data-href="${it.href || ''}">${it.html}</div>`).join('')
      : `<div class="empty">لا توجد نتائج في هذا القسم لـ «${esc(q)}»</div>`;
    pop.hidden = false;
  };

  input.addEventListener('input', run);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      $$('.row', pop).forEach((r, i) => r.classList.toggle('on', i === sel));
    }
    if (e.key === 'Enter' && items[sel]) {
      triggerItem(items[sel]);
    }
    if (e.key === 'Escape') {
      input.value = '';
      pop.hidden = true;
      resetInPageFilters();
      input.blur();
    }
  });
  pop.addEventListener('mousedown', e => {
    const r = e.target.closest('[data-idx]');
    if (r) {
      e.preventDefault();
      const idx = +r.dataset.idx;
      if (items[idx]) triggerItem(items[idx]);
    }
  });
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
let activeRoleKey = null;
let sideNavScroll = 0;

document.addEventListener('scroll', e => {
  if (e.target && e.target.classList && e.target.classList.contains('nav') && e.target.closest?.('.side')) {
    sideNavScroll = e.target.scrollTop;
  }
}, true);

function updateNav(c, activeName) {
  $$('.side .nav a').forEach(a => {
    const id = a.getAttribute('href')?.replace(/^#\/?/, '');
    const match = id === activeName;
    a.classList.toggle('on', match);
    if (match) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    const cnt = a.querySelector('.cnt');
    const n = id ? badgeFor(c, id) : 0;
    if (n) {
      if (cnt) cnt.textContent = n;
      else a.insertAdjacentHTML('beforeend', `<span class="cnt">${n}</span>`);
    } else if (cnt) {
      cnt.remove();
    }
  });

  const prim = PRIMARY[c.role] || [];
  const moreOn = !prim.includes(activeName);
  const moreBtn = $('[data-more]');
  if (moreBtn) moreBtn.classList.toggle('on', moreOn);

  $$('.bnav a').forEach(a => {
    const id = a.getAttribute('href')?.replace(/^#\/?/, '');
    const match = id === activeName;
    a.classList.toggle('on', match);
    if (match) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    const cnt = a.querySelector('.cnt');
    const n = id ? badgeFor(c, id) : 0;
    if (n) {
      if (cnt) cnt.textContent = n;
      else a.insertAdjacentHTML('beforeend', `<span class="cnt">${n}</span>`);
    } else if (cnt) {
      cnt.remove();
    }
  });

  $$('.mtile').forEach(a => {
    const id = a.dataset.mt;
    a.classList.toggle('on', id === activeName);
    const cnt = a.querySelector('.cnt');
    const n = id ? badgeFor(c, id) : 0;
    if (n) {
      if (cnt) cnt.textContent = n;
      else a.insertAdjacentHTML('beforeend', `<span class="cnt">${n}</span>`);
    } else if (cnt) {
      cnt.remove();
    }
  });
}

function route() {
  if (db.session() && !db.sessionValid()) db.kickOut();
  const c = ctx();
  const [rawName = '', rawArg] = location.hash.replace(/^#\/?/, '').split('/');
  const name = rawName.split('?')[0]; let arg = rawArg && rawArg.split('?')[0];
  try { if (arg) arg = decodeURIComponent(arg); } catch { } // Arabic section ids arrive URL-encoded
  if (!c) { document.body.classList.remove('msheet-open'); activeRoleKey = null; current = null; app.innerHTML = ''; views.login.render(app); window.scrollTo(0, 0); return; }
  { const u = db.credOf(c.phone); db.setActor(`${c.name}${u && !u.pending ? ' · ' + u.username : ''} (${c.roleInfo.label.split(' · ')[0]})`); }
  const allowed = [...navFor(c).map(n => n[0]), 'notes', ...(['owner', 'admin', 'teacher'].includes(c.role) ? ['student', 'section'] : [])];
  const target = allowed.includes(name) && views[name] ? name : HOME[c.role];
  if (target !== name) { location.replace(`#/${target}`); return; }
  // Remember where we came from so the back button returns there (not out of the platform).
  const here = `#/${name}${arg ? '/' + arg : ''}`;
  if (navStack[navStack.length - 1] !== here) { if (navStack[navStack.length - 2] === here) navStack.pop(); else navStack.push(here); if (navStack.length > 30) navStack.shift(); }

  const curRoleKey = `${c.phone}_${c.rid || c.role}`;
  const shellNeeded = !$('.app') || !$('#main') || !$('.side .nav') || activeRoleKey !== curRoleKey;

  if (shellNeeded) {
    activeRoleKey = curRoleKey;
    app.innerHTML = shell(c, name);
    const sn = $('.side .nav');
    if (sn && sideNavScroll) sn.scrollTop = sideNavScroll;
  } else {
    updateNav(c, name);
  }

  let main = $('#main');
  if (main && !shellNeeded) {
    const cleanMain = main.cloneNode(false);
    main.parentNode.replaceChild(cleanMain, main);
    main = cleanMain;
  }
  current = { name, arg, view: views[name], el: main };
  views[name].render(main, arg);
  injectNotifBanner(main);
  syncNotifUI();
  bindChrome();
  applyProtection();
  window.scrollTo(0, 0);

  const activeLink = document.querySelector(`.side .nav a[href="#/${name}"]`);
  activeLink?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
  if (e.target.closest('[data-notif-req]')) { requestDeviceNotifs(); return; }
  if (e.target.closest('[data-notif-dismiss]')) { try { sessionStorage.setItem('hader-notif-dismiss', '1'); } catch { } $('#notif-ask-bar')?.remove(); return; }
  if (e.target.closest('[data-totp]')) { totpModal(); return; }
  if (e.target.closest('[data-chpw]')) { changePwModal(); return; }
  if (e.target.closest('[data-back]')) { goBack(); return; }
  if (e.target.closest('[data-collapse]')) { const a = $('.app'); const on = !a.classList.contains('mini'); a.classList.toggle('mini', on); try { localStorage.setItem('hader-mini', on ? '1' : '0'); } catch { } return; }
  if (e.target.closest('[data-bell]')) { toggleBell(); return; }
  if (e.target.closest('[data-bell-close]')) { closeBell(); return; }
  if (e.target.closest('#npop a')) { closeBell(); return; }
  const b = e.target.closest('[data-logout],[data-role],[data-clock]'); if (!b) return;
  if (b.dataset.logout !== undefined) { document.body.classList.remove('msheet-open'); activeRoleKey = null; db.logout(); location.hash = ''; route(); }
  else if (b.dataset.role) { activeRoleKey = null; db.setActiveRole(b.dataset.role); location.hash = ''; route(); }
  else if (b.dataset.clock) { db.setPaused(b.dataset.clock === 'pause'); }
}

/* ---------- bell: tap → panel with the latest notifications; opening it clears the count ---------- */
let bellFresh = null;
function renderBell() {
  const p = $('#npop'); if (!p || p.hidden) return;
  const c = ctx(); const list = db.notes(c.inbox).slice(0, 8);
  const ns = notifSupport();
  const permBar = ns.state === 'granted'
    ? `<div class="npop-perm ok"><span>${icon('check', 14)} إشعارات هذا الجهاز مفعّلة</span><button type="button" class="btn sm" data-notif-req style="min-height:26px;padding:0 9px;font-size:11px">تجربة</button></div>`
    : `<div class="npop-perm"><span>${icon('bell', 14)} ${ns.state === 'denied' ? 'الإشعارات محظورة بالمتصفح' : 'فعّل إشعارات هذا الجهاز'}</span><button type="button" class="btn sm pr" data-notif-req style="min-height:26px;padding:0 10px;font-size:11.5px">${ns.state === 'denied' ? 'طريقة الفتح' : 'تفعيل الآن'}</button></div>`;
  p.innerHTML = `<div class="npop-head"><b style="flex:1;font-size:16px">الإشعارات</b><a href="#/notes" class="small" style="color:var(--teal-ink);font-weight:700">كل الإشعارات</a><button type="button" class="iconbtn sm npop-close" data-bell-close aria-label="إغلاق" style="width:28px;height:28px;min-height:28px;border-radius:8px">${icon('x', 15)}</button></div>
    ${permBar}
    <div style="padding:0 12px">${notesList(list, bellFresh)}</div>`;
}
function toggleBell() { const p = $('#npop'); if (!p) return; if (p.hidden) openBell(); else closeBell(); }
function openBell() {
  const p = $('#npop'), b = $('[data-bell]'); const c = ctx();
  bellFresh = new Set(db.notes(c.inbox).filter(n => !n.read).map(n => n.id));
  p.hidden = false; b.setAttribute('aria-expanded', 'true'); renderBell();
  if (window.innerWidth <= 760 && b) {
    const r = b.getBoundingClientRect();
    const top = Math.max(12, Math.min(r.bottom + 8, window.innerHeight - 280));
    p.style.top = top + 'px';
    p.style.maxHeight = Math.max(220, window.innerHeight - top - 82) + 'px';
  } else {
    p.style.top = '';
    p.style.maxHeight = '';
  }
  if (bellFresh.size) db.readAll(c.inbox); // count goes to zero, new ones stay highlighted in the panel
}
function closeBell() { const p = $('#npop'); if (p) { p.hidden = true; p.style.top = ''; p.style.maxHeight = ''; } $('[data-bell]')?.setAttribute('aria-expanded', 'false'); bellFresh = null; }
document.addEventListener('mousedown', e => { if (!e.target.closest('.bellwrap')) closeBell(); });
document.addEventListener('click', e => { if (e.target.closest('#npop [data-ev]')) closeBell(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBell(); });

function totpModal() {
  const c = ctx();
  if (!c) return;
  const st = db.totpStatus(c.phone);
  if (st.enabled) {
    modal('Google Authenticator (المصادقة الثنائية)', `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="card" style="background:var(--teal-soft);border-color:var(--teal);padding:12px 14px;display:flex;align-items:center;gap:10px">
          <span class="ki t">${icon('shield', 18)}</span>
          <div style="flex:1">
            <b style="color:var(--teal-ink)">حسابك محمي بتطبيق Google Authenticator ✓</b>
            <div class="muted small">اليوزر: <b class="num" dir="ltr">${esc(st.username)}</b>${st.enabledAt ? ` · مفعّل منذ ${fmtDay(new Date(st.enabledAt))}` : ''} · رموز الاسترداد المتبقية: <b class="num">${st.backupsLeft}</b></div>
          </div>
        </div>
        <form id="tfa-off" style="display:flex;flex-direction:column;gap:10px" novalidate>
          <div class="small muted">لتعطيل التحقق بخطوتين، أدخل كلمة المرور الحالية مع رمز الـ 6 أرقام من التطبيق (أو رمز استرداد):</div>
          ${pwField('tfa-pw', 'كلمة المرور الحالية')}
          <label class="field">رمز Google Authenticator (6 أرقام أو رمز استرداد)
            <input class="input num tfa-code" id="tfa-off-code" dir="ltr" inputmode="numeric" autocomplete="one-time-code" placeholder="000 000" maxlength="10">
          </label>
          <div id="tfa-off-err" class="small" style="color:var(--red-ink);font-weight:700;display:none"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
            <button type="button" class="btn" data-close>إغلاق</button>
            <button type="submit" class="btn danger-solid">${icon('x', 15)}تعطيل الربط</button>
          </div>
        </form>
      </div>`, (m, close) => {
      bindEyes(m);
      $('#tfa-off', m).onsubmit = e => {
        e.preventDefault();
        const r = db.disableTotp($('#tfa-pw', m).value, $('#tfa-off-code', m).value);
        const err = $('#tfa-off-err', m);
        if (!r.ok) { err.textContent = r.error; err.style.display = 'block'; return; }
        close();
        toast('تم تعطيل Google Authenticator', 'رجع الدخول بكلمة المرور فقط');
        route();
      };
    });
    return;
  }

  const setup = db.beginTotpSetup();
  if (!setup.ok) { toast(setup.error, '', 'absent'); return; }
  const formattedKey = setup.secret.replace(/(.{4})/g, '$1 ').trim();

  modal('ربط تطبيق Google Authenticator', `
    <div id="tfa-wrap" style="display:flex;flex-direction:column;gap:12px">
      <div class="tfa-steps">
        <span><b>1.</b> افتح تطبيق <b>Google Authenticator</b> على هاتفك واضغط <b>+</b>.</span>
        <span><b>2.</b> امسح رمز <b>QR</b> أدناه (أو انسخ المفتاح السري وأدخله يدوياً).</span>
        <span><b>3.</b> اكتب الرمز المكوّن من <b>6 أرقام</b> الظاهر في التطبيق لتأكيد الربط.</span>
      </div>
      <div class="tfa-qr-box">
        <div class="tfa-qr">${qrSvg(setup.uri, 196)}</div>
        <div class="tfa-key-col">
          <div class="small muted">أو أدخل المفتاح يدوياً في التطبيق:</div>
          <div class="tfa-secret num" dir="ltr">${esc(formattedKey)}</div>
          <div class="small muted">الحساب: <b class="num" dir="ltr">Hader:${esc(setup.username)}</b> · التوقيت: 30 ثانية</div>
          <button type="button" class="btn sm" id="tfa-copy-key" style="align-self:flex-start">${icon('book', 14)}نسخ المفتاح السري</button>
        </div>
      </div>
      <form id="tfa-on" style="display:flex;flex-direction:column;gap:10px" novalidate>
        <label class="field">أدخل الرمز من Google Authenticator (6 أرقام)
          <input class="input num tfa-code" id="tfa-code" dir="ltr" inputmode="numeric" autocomplete="one-time-code" placeholder="000 000" maxlength="7">
        </label>
        <div id="tfa-err" class="small" style="color:var(--red-ink);font-weight:700;display:none"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn" data-close>إلغاء</button>
          <button type="submit" class="btn pr">${icon('shield', 16)}تفعيل الربط الآن</button>
        </div>
      </form>
    </div>`, (m, close) => {
    $('#tfa-copy-key', m).onclick = async () => {
      try { await navigator.clipboard.writeText(setup.secret); toast('تم نسخ المفتاح السري', 'الصقه داخل Google Authenticator'); }
      catch { toast('انسخ المفتاح يدوياً من المربع', ''); }
    };
    const inp = $('#tfa-code', m);
    inp.focus();
    $('#tfa-on', m).onsubmit = e => {
      e.preventDefault();
      const r = db.confirmTotpSetup(setup.secret, inp.value);
      const err = $('#tfa-err', m);
      if (!r.ok) { err.textContent = r.error; err.style.display = 'block'; inp.select(); return; }
      toast('تم ربط Google Authenticator بنجاح ✓', 'حسابك محمي الآن بالتحقق بخطوتين');
      $('#tfa-wrap', m).innerHTML = `
        <div class="card" style="background:var(--teal-soft);border-color:var(--teal);padding:12px 14px">
          <b style="color:var(--teal-ink)">تم التفعيل بنجاح ✓</b>
          <div class="small" style="margin-top:4px">في كل مرة تسجل دخولك سيطلب النظام رمز الـ 6 أرقام من تطبيق <b>Google Authenticator</b>.</div>
        </div>
        <div>
          <b>رموز الاسترداد الاحتياطية (تُعرض مرة واحدة فقط):</b>
          <div class="muted small" style="margin:3px 0 8px">احفظ هذه الرموز بمكان آمن — تستخدمها للدخول إذا بدّلت موبايلك أو انمسح التطبيق. كل رمز يشتغل مرة واحدة.</div>
          <div class="tfa-backups num" dir="ltr">${r.backups.map(b => `<span>${esc(b)}</span>`).join('')}</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button type="button" class="btn sm" id="tfa-copy-bk">${icon('book', 14)}نسخ رموز الاسترداد</button>
          <button type="button" class="btn pr" id="tfa-done">تم، حفظت الرموز</button>
        </div>`;
      $('#tfa-copy-bk', m).onclick = async () => {
        try { await navigator.clipboard.writeText(r.backups.join('\n')); toast('تم نسخ رموز الاسترداد', 'احفظها بمكان آمن'); }
        catch { toast('انسخ الرموز يدوياً', ''); }
      };
      $('#tfa-done', m).onclick = () => { close(); route(); };
    };
  });
}

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
  if (fresh > lastNoteCount && n[0] && !n[0].read) {
    toast(n[0].title, n[0].body, n[0].kind);
    sendDeviceNotification(n[0].title, n[0].body, {
      tag: 'hader-' + (n[0].id || n[0].ts),
      url: n[0].kind === 'mark' ? './#/marks' : n[0].kind === 'post' ? './#/posts' : './#/notes',
    });
  }
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
let swReg = null;
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js').then(r => { swReg = r; }).catch(() => {});
}
setTimeout(() => { showInstallBtn(); appBadge(); syncNotifUI(); }, 500);

/* ---------- universal system / push notification permissions across ALL devices (Android, iOS PWA, Desktop) ---------- */
function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export function notifSupport() {
  const ios = isIOSDevice();
  const hasApi = typeof window !== 'undefined' && 'Notification' in window;
  if (ios && !standalone() && !hasApi) return { state: 'ios_install', ios: true };
  if (!hasApi) return { state: 'unsupported', ios };
  return { state: Notification.permission || 'default', ios };
}
export async function sendDeviceNotification(title, body, opts = {}) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return false;
  const payload = {
    body: String(body || ''),
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    tag: opts.tag || 'hader-note',
    renotify: true,
    vibrate: [150, 80, 150],
    data: { url: opts.url || './#/notes' },
  };
  try {
    const reg = swReg || ('serviceWorker' in navigator ? await navigator.serviceWorker.ready.catch(() => null) : null);
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(title, payload);
      return true;
    }
  } catch { }
  try {
    const n = new Notification(title, payload);
    n.onclick = () => { window.focus(); if (opts.url && opts.url.includes('#')) location.hash = opts.url.slice(opts.url.indexOf('#')); n.close(); };
    return true;
  } catch { return false; }
}
export async function requestDeviceNotifs() {
  const ns = notifSupport();
  if (ns.state === 'ios_install') {
    modal('تفعيل الإشعارات على الآيفون / الآيباد', `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>بأجهزة آبل (iPhone / iPad)، النظام يطلب تثبيت التطبيق على الشاشة الرئيسية أولاً حتى يسمح بوصول الإشعارات:</div>
        <ol class="small" style="margin:0;padding-inline-start:20px;line-height:2.1">
          <li>افتح المنصة بمتصفح <b>Safari</b>.</li>
          <li>اضغط زر المشاركة <b>(المربع والسهم للأعلى)</b> أسفل الشاشة.</li>
          <li>اختر <b>«إضافة إلى الشاشة الرئيسية»</b> ثم <b>«إضافة»</b>.</li>
          <li>افتح أيقونة <b>«حاضر»</b> من الشاشة الرئيسية واضغط <b>«تفعيل إشعارات الجهاز»</b>.</li>
        </ol>
        <div style="display:flex;justify-content:flex-end"><button type="button" class="btn pr" data-close>فهمت</button></div>
      </div>`);
    return;
  }
  if (ns.state === 'unsupported') {
    toast('الإشعارات غير مدعومة هنا', 'افتح المنصة عبر رابط الموقع (HTTPS) من Chrome أو Safari أو Edge', 'late');
    return;
  }
  if (ns.state === 'denied') {
    modal('الإشعارات محظورة على هذا الجهاز', `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>تم رفض إذن الإشعارات مسبقاً على هذا المتصفح. لإعادة تفعيلها:</div>
        <ol class="small" style="margin:0;padding-inline-start:20px;line-height:2.1">
          <li>اضغط على أيقونة <b>القفل أو الإعدادات</b> بجانب رابط الموقع بالأعلى.</li>
          <li>اختر <b>الأذونات / الإشعارات (Notifications)</b> وغيّرها إلى <b>السماح (Allow)</b>.</li>
          <li>حدّث الصفحة وستصل الإشعارات مباشرة لجهازك.</li>
        </ol>
        <div style="display:flex;justify-content:flex-end"><button type="button" class="btn pr" data-close>حسناً</button></div>
      </div>`);
    return;
  }
  if (ns.state === 'granted') {
    const ok = await sendDeviceNotification('إشعار تجريبي من منصة «حاضر»', 'إشعارات جهازك مفعّلة وتعمل بنجاح ✓', { tag: 'hader-test-' + Date.now() });
    toast(ok ? 'تم إرسال إشعار تجريبي لجهازك ✓' : 'الإشعارات مفعّلة على جهازك ✓', '');
    syncNotifUI();
    return;
  }
  try {
    const res = await new Promise(resolve => {
      const p = Notification.requestPermission(r => resolve(r));
      if (p && typeof p.then === 'function') p.then(resolve, () => resolve('denied'));
    });
    syncNotifUI();
    if (res === 'granted') {
      $('#notif-ask-bar')?.remove();
      toast('تم تفعيل إشعارات الجهاز بنجاح ✓', 'راح توصلك التنبيهات مباشرة على جهازك');
      await sendDeviceNotification('مرحباً بك في منصة «حاضر»', 'تم تفعيل إشعارات الحضور والغياب والدرجات على جهازك بنجاح ✓', { tag: 'hader-welcome' });
      renderBell();
    } else if (res === 'denied') {
      toast('تم رفض إذن الإشعارات', 'تكدر تفعله لاحقاً من إعدادات المتصفح', 'late');
    }
  } catch {
    toast('تعذر طلب إذن الإشعارات', 'جرّب فتح المنصة عبر رابط HTTPS', 'late');
  }
}
function syncNotifUI() {
  const ns = notifSupport();
  const label = ns.state === 'granted' ? 'إشعارات الجهاز مفعّلة ✓' : ns.state === 'denied' ? 'الإشعارات محظورة' : 'تفعيل إشعارات الجهاز';
  $$('[data-notif-lbl]').forEach(el => { el.textContent = label; });
  if (ns.state === 'granted') $('#notif-ask-bar')?.remove();
}
function injectNotifBanner(main) {
  if (!main) return;
  $('#notif-ask-bar', main)?.remove();
  try { if (sessionStorage.getItem('hader-notif-dismiss') === '1') return; } catch { }
  const ns = notifSupport();
  if (ns.state !== 'default' && ns.state !== 'ios_install') return;
  const bar = document.createElement('div');
  bar.id = 'notif-ask-bar';
  bar.className = 'notif-ask';
  bar.innerHTML = `<span class="ki t" style="width:32px;height:32px;border-radius:10px">${icon('bell', 16)}</span>
    <div style="flex:1;min-width:160px"><b>فعّل إشعارات هذا الجهاز</b><div class="muted small">حتى توصلك تنبيهات وصول الطالب والغياب والدرجات والتبليغات مباشرة على ${ns.ios ? 'الآيفون' : 'جهازك'}.</div></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button type="button" class="btn sm pr" data-notif-req>${icon('bell', 14)}تفعيل الإشعارات</button>
      <button type="button" class="btn sm" data-notif-dismiss>لاحقاً</button>
    </div>`;
  const top = main.querySelector('.top');
  if (top && top.nextSibling) main.insertBefore(bar, top.nextSibling);
  else main.prepend(bar);
}

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
