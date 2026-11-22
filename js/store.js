// Data layer. Every screen talks to the platform only through the functions
// exported here. Today they run on demo data in the browser; later the same
// functions call the server (Supabase) and the screens do not change.

import { rng, dayKey, atTime, minutesOf, norm, normalizePhone, validPhone, storage, fmtTime } from './util.js';

const KEY = 'hader-demo-v5';
// Which device holds each account. On the server this is the session table; in the demo every
// browser tab counts as its own device, so open a second tab to watch the first one get signed out.
const ACTIVE_KEY = 'hader-active';
const ACTIVE_EVENT_KEY = ACTIVE_KEY;
export { ACTIVE_EVENT_KEY };
const memDev = {};
const dev = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return memDev[k] ?? null; } },
  set(k, v) { memDev[k] = v; try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { } },
  del(k) { delete memDev[k]; try { sessionStorage.removeItem(k); } catch { } },
};
const DEVICE = dev.get('hader-device') || (() => { const d = Math.random().toString(36).slice(2); dev.set('hader-device', d); return d; })();
const listeners = new Set();
let S = null;            // the whole demo database
let tickTimer = null;

export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = what => { save(); listeners.forEach(fn => fn(what)); };
const save = () => storage.set(KEY, S);

/* ---------------- clock ----------------
   Default: the real time of the device (Baghdad time for users in Iraq).
   Optional demo mode: a school-day clock that starts at 7:50 and runs faster,
   so arrivals, lateness and the 8:30 absence alert can be watched in minutes. */
export function now() {
  const c = S.clock;
  if (c.mode === 'real') return Date.now();
  const v = c.virtual + (c.paused ? 0 : (Date.now() - c.real) * c.speed);
  return Math.min(v, atTime(c.virtual, '14:30').getTime());
}
function rebase() { S.clock.virtual = now(); S.clock.real = Date.now(); }
export const clock = () => ({ ...S.clock, now: now() });
export function setSpeed(x) { rebase(); S.clock.speed = x; emit('clock'); }
export function setPaused(p) { rebase(); S.clock.paused = p; emit('clock'); }
export function resetDemo() { const m = S?.clock?.mode || 'real'; storage.del(KEY); const keepCreds = S?.creds; S = seed(m); S.marks = seedMarks(); S.markReads = {}; S.chats = {}; S.tickets = []; S.creds = keepCreds || seedCreds(); IDX = null; emit('reset'); }
export function setMode(m) { storage.del(KEY); const keepCreds = S?.creds; S = seed(m); S.marks = seedMarks(); S.markReads = {}; S.chats = {}; S.tickets = []; S.creds = keepCreds || seedCreds(); IDX = null; emit('reset'); }
// Off days: Friday and Saturday (real clock), plus official holidays announced by the administration.
// On an off day no scan counts and nobody is marked absent.
export const holidays = () => (S.holidays || []).slice().sort((a, b) => a.day.localeCompare(b.day));
const holidayOn = ts => (S.holidays || []).find(h => h.day === dayKey(new Date(ts)));
export function offDay(ts) { if (holidayOn(ts)) return true; return S.clock?.mode === 'real' && !isSchoolDay(new Date(ts)); }
export const isHoliday = () => !!S.holiday || !!holidayOn(S.today);
export const holidayName = () => holidayOn(S.today)?.name || (S.holiday ? (new Date(S.today).getDay() === 5 ? 'الجمعة' : 'السبت') : '');
export function addHoliday(day, name, by) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return { ok: false, error: 'اختر تاريخ العطلة.' };
  if (day < dayKey(new Date(S.today))) return { ok: false, error: 'التاريخ لازم يكون اليوم أو بعده.' };
  S.holidays = (S.holidays || []).filter(h => h.day !== day);
  S.holidays.push({ day, name: String(name || '').trim() || 'عطلة رسمية', by: by || '', ts: now() });
  log('إعلان عطلة رسمية', `${day} · ${String(name || '').trim() || 'عطلة رسمية'}`);
  IDX = null; emit('holidays'); return { ok: true };
}
export function removeHoliday(day) { const h = (S.holidays || []).find(x => x.day === day); S.holidays = (S.holidays || []).filter(x => x.day !== day); if (h) log('إلغاء عطلة', `${day} · ${h.name}`); IDX = null; emit('holidays'); }

/* ---------------- seed ---------------- */
const MALE = ['أحمد', 'حسين', 'علي', 'محمد', 'مصطفى', 'يوسف', 'سجاد', 'كرار', 'عباس', 'حيدر', 'مرتضى', 'زين العابدين', 'منتظر', 'باقر', 'جعفر', 'أمير', 'حسن', 'كاظم', 'رضا', 'مهدي'];
const FEMALE = ['زينب', 'فاطمة', 'رقية', 'مريم', 'نور الهدى', 'زهراء', 'آية', 'هدى', 'سارة', 'ملاك', 'بنين', 'رسل', 'غدير', 'تبارك', 'دعاء', 'أديان', 'حوراء', 'سجى', 'ضحى', 'نرجس'];
const FATHER = ['علي', 'حسن', 'جاسم', 'كريم', 'عادل', 'سعد', 'فاضل', 'ناصر', 'صالح', 'باسم', 'رعد', 'ماجد', 'عماد', 'قاسم', 'ثامر', 'سلام', 'وليد', 'هادي', 'جبار', 'نزار'];
const GRAND = ['حسن', 'كاظم', 'محمد', 'عبد الله', 'جواد', 'عباس', 'مهدي', 'سلمان', 'عيسى', 'خضير'];

function isSchoolDay(d) { const w = d.getDay(); return w !== 5 && w !== 6; } // Friday & Saturday off

function seed(mode = 'real') {
  const r = rng(20261120);
  const pick = a => a[Math.floor(r() * a.length)];
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const grades = [
    { id: 'g1', name: 'الأول متوسط', short: '1م', stage: 'المتوسطة' },
    { id: 'g2', name: 'الثاني متوسط', short: '2م', stage: 'المتوسطة' },
    { id: 'g3', name: 'الثالث متوسط', short: '3م', stage: 'المتوسطة' },
    { id: 'g4', name: 'الرابع إعدادي', short: '4ع', stage: 'الإعدادية' },
    { id: 'g5', name: 'الخامس إعدادي', short: '5ع', stage: 'الإعدادية' },
    { id: 'g6', name: 'السادس إعدادي', short: '6ع', stage: 'الإعدادية' },
  ];
  const secNames = { g1: ['أ', 'ب'], g2: ['أ', 'ب'], g3: ['أ', 'ج'], g4: ['أ'], g5: ['علمي'], g6: ['علمي'] };
  const sections = [];
  grades.forEach(g => secNames[g.id].forEach(n => sections.push({ id: `${g.id}-${n}`, gradeId: g.id, name: n, room: 10 + sections.length })));

  const guardians = [], students = [];
  let no = 1001;
  const addStudent = (name, sectionId, gName, gPhone, female) => {
    let g = guardians.find(x => x.phone === gPhone);
    if (!g) { g = { id: `p${guardians.length + 1}`, name: gName, phone: gPhone }; guardians.push(g); }
    const s = { id: `s${no}`, no, deviceId: no, name, sectionId, guardianId: g.id, female, face: true, phone: null };
    no++; students.push(s); return s;
  };
  // The demo family used by the parent account.
  addStudent('أحمد علي حسن', 'g3-أ', 'علي حسن كاظم', '07700000003', false);
  addStudent('زينب علي حسن', 'g1-ب', 'علي حسن كاظم', '07700000003', true);
  students[0].phone = '07700000004'; // Ahmed has his own student account
  sections.forEach(sec => {
    const n = 9 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const female = r() < 0.45;
      const father = pick(FATHER), grand = pick(GRAND);
      const first = female ? pick(FEMALE) : pick(MALE);
      const phone = '07' + (7 + Math.floor(r() * 3)) + String(Math.floor(r() * 1e8)).padStart(8, '0');
      addStudent(`${first} ${father} ${grand}`, sec.id, `${father} ${grand}`, phone, female);
    }
  });

  const teachers = [
    { id: 't1', name: 'أ. حيدر جاسم', phone: '07700000002', subject: 'الرياضيات', sections: ['g3-أ', 'g3-ج'] },
    { id: 't2', name: 'أ. سارة عادل', phone: '07800000012', subject: 'اللغة العربية', sections: ['g1-أ', 'g1-ب'] },
    { id: 't3', name: 'أ. نادية كريم', phone: '07800000013', subject: 'العلوم', sections: ['g2-أ', 'g2-ب', 'g3-أ'] },
  ];
  sections.forEach(s => { const t = teachers.find(t => t.sections.includes(s.id)); s.homeroom = t ? t.name : null; });

  const devices = [
    { id: 'd1', name: 'بوابة 1 · الدخول الرئيسي', model: 'ZKTeco SpeedFace', protocol: 'adms', serial: 'CN4K221060417', methods: ['بصمة إصبع', 'وجه', 'بطاقة'], online: true, buffer: [] },
    { id: 'd2', name: 'بوابة 2 · الباب الخلفي', model: 'Hikvision DS-K1T', protocol: 'isup', serial: 'DS-K1T671M2024', methods: ['وجه', 'كف'], online: true, buffer: [] },
    { id: 'd3', name: 'بوابة البنات', model: 'ZKTeco ProFace X', protocol: 'adms', serial: 'CN4K230980112', methods: ['وجه', 'بطاقة'], online: true, buffer: [] },
  ];
  const deviceFor = s => s.female ? (r() < 0.8 ? 'd3' : 'd1') : (r() < 0.7 ? 'd1' : 'd2');

  const settings = { start: '07:45', late: '07:55', absentAt: '08:30', end: '13:30', schoolName: 'متوسطة وإعدادية النور' };

  // Past five school days of history.
  const events = []; let eid = 1;
  const past = []; const d = new Date(today);
  while (past.length < 20) { d.setDate(d.getDate() - 1); if (isSchoolDay(d)) past.push(new Date(d)); }
  past.forEach(day => students.forEach(s => {
    const x = r();
    if (s.no === 1002 && dayKey(day) === dayKey(past[0])) return; // Zainab was absent yesterday
    if (x < 0.04) return; // absent
    const dev = deviceFor(s); const devObj = devices.find(v => v.id === dev);
    const inMin = x < 0.12 ? minutesOf('07:46') + Math.floor(r() * 35) : minutesOf('07:15') + Math.floor(r() * 29);
    const t = new Date(day); t.setMinutes(inMin);
    events.push({ id: eid++, studentId: s.id, type: 'in', ts: t.getTime(), deviceId: dev, method: pick(devObj.methods) });
    const o = new Date(day); o.setMinutes(minutesOf('13:30') + Math.floor(r() * 12));
    events.push({ id: eid++, studentId: s.id, type: 'out', ts: o.getTime(), deviceId: dev, method: pick(devObj.methods) });
  }));

  // Real time on a Friday/Saturday: no school today, nobody scans and no absence alerts.
  const holiday = mode === 'real' && !isSchoolDay(today);
  // Today's plan: when each student will scan in (and out).
  const plan = students.map(s => {
    const x = r(); const dev = deviceFor(s); const devObj = devices.find(v => v.id === dev);
    let inMin = null;
    if (s.no === 1001) inMin = minutesOf('07:53');        // Ahmed arrives just after the demo starts
    else if (s.no === 1002) inMin = minutesOf('08:07');   // Zainab is late
    else if (x < 0.04) inMin = null;                      // absent today
    else if (x < 0.13) inMin = minutesOf('07:46') + Math.floor(r() * 38);
    else if (x < 0.30) inMin = minutesOf('07:40') + Math.floor(r() * 14);
    else inMin = minutesOf('07:15') + Math.floor(r() * 30);
    if (holiday) inMin = null;
    return { studentId: s.id, deviceId: dev, method: pick(devObj.methods), inMin, outMin: inMin == null ? null : minutesOf('13:30') + Math.floor(r() * 12), inDone: false, outDone: false };
  });

  const start = atTime(today, '07:50').getTime();
  return {
    v: 5, day: dayKey(today), holiday, today: today.getTime(), past: past.map(p => p.getTime()),
    grades, sections, students, guardians, teachers, devices, settings, events, eid, plan,
    excuses: [], notes: [], flags: {}, posts: seedPosts(today), reads: {},
    admins: [{ phone: '07700000001', name: 'أ. سعاد كريم' }], disabled: [],
    audit: [{ ts: atTime(today, '07:30').getTime(), by: 'مالك المنصة', action: 'تفعيل الأجهزة', detail: 'بدء الدوام وتشغيل 3 أجهزة بصمة' }],
    clock: { mode, virtual: start, real: Date.now(), speed: 6, paused: mode === 'real' ? false : false },
  };
}

function seedPosts(today) {
  const t = today.getTime(), h = 3600000;
  return [
    { id: 'post1', type: 'video', title: 'المحاضرة 4: نظرية فيثاغورس', body: 'شرح كامل للنظرية مع ثلاثة أمثلة محلولة. شاهدوها قبل حصة الأحد.', sections: ['g3-أ', 'g3-ج'], audience: 'all', by: 't1', byName: 'أ. حيدر جاسم', ts: t + 7 * h + 20 * 60000, meta: '18 دقيقة' },
    { id: 'post2', type: 'hw', title: 'تمارين ص 45 (1–6)', body: 'حل التمارين في الدفتر وصوّر الحل.', sections: ['g3-أ'], audience: 'all', by: 't1', byName: 'أ. حيدر جاسم', ts: t - 20 * h, due: 'غداً 8:00' },
    { id: 'post3', type: 'ann', title: 'امتحان الشهر الأحد القادم', body: 'يشمل الفصلين الأول والثاني. الحضور قبل 7:45.', sections: 'all', audience: 'all', by: 'admin', byName: 'الإدارة', ts: t + 7 * h },
    { id: 'post4', type: 'pdf', title: 'ملزمة الفصل الثاني', body: 'ملزمة العربي للفصل الثاني، 24 صفحة.', sections: ['g1-أ', 'g1-ب'], audience: 'all', by: 't2', byName: 'أ. سارة عادل', ts: t - 26 * h, meta: 'PDF · صفحتين', file: { sample: true, name: 'ملزمة الفصل الثاني.pdf', type: 'application/pdf', size: 0 } },
    { id: 'post5', type: 'ann', title: 'اجتماع أولياء الأمور الخميس 10:00', body: 'نرجو حضوركم لمناقشة نتائج الشهر الأول.', sections: 'all', audience: 'parents', by: 'admin', byName: 'الإدارة', ts: t + 6 * h + 50 * 60000 },
  ];
}

/* ---------------- lifecycle ---------------- */
export function init() {
  const saved = storage.get(KEY);
  const todayKey = dayKey(new Date());
  S = saved && saved.v === 5 && saved.day === todayKey ? saved : seed(saved?.clock?.mode === 'demo' ? 'demo' : 'real');
  S.seen = S.seen || {};
  S.holidays = S.holidays || [];
  S.chats = S.chats || {}; S.tickets = S.tickets || [];
  if (!S.marks) { S.marks = seedMarks(); S.markReads = {}; }
  if (!S.creds) S.creds = saved?.creds || seedCreds(); // generated logins survive a new demo day
  S.clock.real = Date.now(); // resume from where the page was closed
  tick(true);
  clearInterval(tickTimer);
  tickTimer = setInterval(() => tick(false), 1000);
}

function addEvent(ev, quiet) {
  ev.id = S.eid++; S.events.push(ev);
  const st = student(ev.studentId);
  // Catch-up on page load (quiet) still files the notifications; only live scans pop a toast.
  if (st) {
    const g = guardian(st.guardianId);
    const late = ev.type === 'in' && new Date(ev.ts).getHours() * 60 + new Date(ev.ts).getMinutes() > minutesOf(S.settings.late);
    notify(g.phone, {
      kind: ev.type === 'in' ? (late ? 'late' : 'in') : 'out',
      title: ev.type === 'in' ? `${late ? 'وصل متأخراً' : 'وصل إلى المدرسة'}: ${first(st.name)}` : `غادر المدرسة: ${first(st.name)}`,
      body: `${fmtTime(ev.ts)} · ${ev.method} · ${device(ev.deviceId)?.name.split(' · ')[0] ?? ''}`,
      ts: ev.ts, studentId: st.id,
    });
    if (st.phone) notify(st.phone, { kind: ev.type === 'in' ? (late ? 'late' : 'in') : 'out', title: ev.type === 'in' ? `سُجّل حضورك ${fmtTime(ev.ts)}` : `سُجّل انصرافك ${fmtTime(ev.ts)}`, body: `${ev.method}`, ts: ev.ts, studentId: st.id });
  }
}

function tick(quiet) {
  if (S.clock.mode === 'real' && dayKey(new Date()) !== S.day) { const keep = { students: S.students, guardians: S.guardians, teachers: S.teachers, admins: S.admins, disabled: S.disabled, posts: S.posts, reads: S.reads, settings: S.settings, audit: S.audit, notes: S.notes, excuses: S.excuses, events: S.events, eid: S.eid, seen: S.seen, marks: S.marks, markReads: S.markReads, creds: S.creds, holidays: S.holidays, chats: S.chats, tickets: S.tickets, tt: S.tt, ttSeen: S.ttSeen, promotions: S.promotions, graduates: S.graduates, graduatedStore: S.graduatedStore, finalsSeeded: S.finalsSeeded };
    S = Object.assign(seed('real'), keep); IDX = null; emit('reset'); return; }
  const t = now();
  const base = S.today;
  let changed = false;
  for (const p of S.plan) {
    const dev = device(p.deviceId);
    if (p.inMin != null && !p.inDone && base + p.inMin * 60000 <= t) {
      p.inDone = true; changed = true;
      const ev = { studentId: p.studentId, type: 'in', ts: base + p.inMin * 60000 + (parseInt(String(p.studentId).replace(/\D/g, '')) * 7919 % 59) * 1000, deviceId: p.deviceId, method: p.method };
      if (dev.online) addEvent(ev, quiet); else dev.buffer.push(ev);
    }
    if (p.outMin != null && p.inDone && !p.outDone && base + p.outMin * 60000 <= t) {
      p.outDone = true; changed = true;
      const ev = { studentId: p.studentId, type: 'out', ts: base + p.outMin * 60000 + (parseInt(String(p.studentId).replace(/\D/g, '')) * 104729 % 59) * 1000, deviceId: p.deviceId, method: p.method };
      if (dev.online) addEvent(ev, quiet); else dev.buffer.push(ev);
    }
  }
  S.devices.forEach(d => { if (d.online) d.lastSeen = t; });
  // 8:30 absence alert to parents (once a day)
  if (!isHoliday() && !S.flags.absentSent && t >= atTime(base, S.settings.absentAt).getTime()) {
    S.flags.absentSent = true; changed = true;
    S.students.forEach(s => {
      if (statusOf(s.id).status === 'absent') {
        notify(guardian(s.guardianId).phone, { kind: 'absent', title: `لم يصل حتى الآن: ${first(s.name)}`, body: `لا توجد بصمة حتى ${fmtTime(atTime(base, S.settings.absentAt))}. اضغط لتبرير الغياب.`, ts: t, studentId: s.id });
      }
    });
  }
  // Automatic promotion on the date the school set.
  { const r = promoRules(); if (r.auto && r.autoDate && S.day >= r.autoDate && !(S.promotions || []).some(p => p.autoKey === r.autoDate && !p.undone)) { runPromotion('تلقائي', { auto: true }); changed = true; } }
  if (changed) emit('tick'); else listeners.forEach(fn => fn('clock'));
}

/* ---------------- lookups ---------------- */
export const settings = () => S.settings;
/* ---------------- content protection ----------------
   For parents and students: no downloads, a watermark with the viewer's name and number, no copy or print,
   and the screen is covered while the app is in the background (app switchers and many recorders show it covered). */
const PROTECT_DEFAULT = { noDownload: true, watermark: true, noCopy: true, blurOnLeave: true };
export const protection = () => ({ ...PROTECT_DEFAULT, ...(S.settings.protect || {}) });
export function setProtection(patch, by) { S.settings.protect = { ...protection(), ...patch }; log('تعديل حماية المحتوى', `${Object.entries(patch).map(([k, v]) => `${k}: ${v ? 'تشغيل' : 'إيقاف'}`).join('، ')} · ${by}`); emit('settings'); }
export const grades = () => S.grades;
export const sections = gradeId => gradeId ? S.sections.filter(s => s.gradeId === gradeId) : S.sections;
export const section = id => S.sections.find(s => s.id === id);
export const grade = id => S.grades.find(g => g.id === id);
export const students = sectionId => sectionId ? S.students.filter(s => s.sectionId === sectionId) : S.students;
export const student = id => S.students.find(s => s.id === id);
export const guardian = id => S.guardians.find(g => g.id === id);
export const devices = () => S.devices;
export const device = id => S.devices.find(d => d.id === id);
export const teachers = () => S.teachers;
// New section in a grade (administration only). Letters follow أ ب ج د هـ و ز ح ط ي.
export const SECTION_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];
export function nextSectionName(gradeId) { const used = new Set(S.sections.filter(s => s.gradeId === gradeId).map(s => s.name)); return SECTION_LETTERS.find(l => !used.has(l)) || ''; }
// A grade typed by name: reuse it if it exists (ignoring أ/ا, ة/ه), otherwise create it.
export function gradeByName(text) { const n = norm(text); return n ? S.grades.find(g => norm(g.name) === n || norm(g.short) === n) : null; }
export function ensureGrade(text) {
  const name = String(text || '').trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'اكتب اسم الصف، مثلاً الأول متوسط.' };
  if (name.length > 30) return { ok: false, error: 'اسم الصف طويل.' };
  const found = gradeByName(name); if (found) return { ok: true, grade: found };
  const stage = /إعداد|اعداد/.test(name) ? 'الإعدادية' : /ابتدا|إبتدا/.test(name) ? 'الابتدائية' : /متوسط/.test(name) ? 'المتوسطة' : 'أخرى';
  const ord = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'].findIndex(o => norm(name).startsWith(norm(o)));
  const short = (ord >= 0 ? String(ord + 1) : name[0]) + (stage === 'الإعدادية' ? 'ع' : stage === 'الابتدائية' ? 'ب' : stage === 'المتوسطة' ? 'م' : '');
  const g = { id: 'g' + Date.now() % 1000000, name, short, stage };
  S.grades.push(g); log('إضافة صف', name);
  return { ok: true, grade: g, created: true };
}
export function addSection({ gradeId, name, homeroom, room }) {
  const errors = {}; name = String(name || '').trim();
  if (!grade(gradeId)) errors.gradeId = 'اختر الصف.';
  if (!name) errors.name = 'اكتب اسم الشعبة، مثلاً ب أو أدبي.';
  else if (name.length > 12) errors.name = 'الاسم طويل، خليه قصير مثل «ج» أو «أدبي».';
  else if (S.sections.some(s => s.gradeId === gradeId && s.name === name)) errors.name = 'هذي الشعبة موجودة بنفس الصف.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const sec = { id: `${gradeId}-${name}-${Date.now() % 100000}`, gradeId, name, room: Number(room) || 10 + S.sections.length, homeroom: homeroom || '' };
  S.sections.push(sec); syncTeacherScopes();
  log('إضافة شعبة', `${grade(gradeId).name} / ${name}`);
  emit('sections'); return { ok: true, section: sec };
}
export const sectionLabel = id => { const s = section(id); const g = s && grade(s.gradeId); return s ? `${g.name} / ${s.name}` : ''; };
export const sectionShort = id => { const s = section(id); const g = s && grade(s.gradeId); return s ? `${g.short} / ${s.name}` : ''; };
export const first = name => name.split(' ')[0];
export const days = () => [S.today, ...S.past]; // today first

/* ---------------- attendance ---------------- */
let IDX = null, IDXN = -1;
function indexed() {
  if (IDXN === S.events.length && IDX) return IDX;
  IDX = new Map();
  for (const e of S.events) { const key = e.studentId + '|' + dayKey(new Date(e.ts)); (IDX.get(key) || IDX.set(key, []).get(key)).push(e); }
  IDX.forEach(a => a.sort((x, y) => x.ts - y.ts)); IDXN = S.events.length; return IDX;
}
export const STATUS = {
  present: 'حاضر', late: 'متأخر', absent: 'غائب', excused: 'غائب بعذر', left: 'انصرف', pending: 'لم يصل بعد', none: 'لم يكن مسجّلاً', holiday: 'عطلة',
};
export function statusOf(studentId, day = S.today) {
  const stu = student(studentId);
  if (stu && stu.since && day < stu.since) return { status: 'none' };
  if ((S.holiday && day === S.today) || offDay(day)) return { status: 'holiday' };
  const k = dayKey(new Date(day));
  const evs = indexed().get(studentId + '|' + k) || [];
  const inEv = evs.find(e => e.type === 'in');
  const outEv = [...evs].reverse().find(e => e.type === 'out');
  const excuse = S.excuses.find(x => x.studentId === studentId && x.day === k);
  if (!inEv) {
    if (excuse) return { status: 'excused', excuse };
    const isToday = day === S.today;
    if (isToday && now() < atTime(day, S.settings.absentAt).getTime()) return { status: 'pending' };
    return { status: 'absent' };
  }
  const lateMin = minutesOf(S.settings.late);
  const d = new Date(inEv.ts); const late = d.getHours() * 60 + d.getMinutes() > lateMin;
  if (outEv && outEv.ts > inEv.ts) return { status: 'left', inEv, outEv, late };
  return { status: late ? 'late' : 'present', inEv, late };
}

export function summary(list = S.students, day = S.today) {
  const c = { present: 0, late: 0, absent: 0, excused: 0, left: 0, pending: 0, none: 0, holiday: 0, total: 0 };
  list.forEach(s => { const st = statusOf(s.id, day).status; c[st]++; if (st !== 'none' && st !== 'holiday') c.total++; });
  c.came = c.present + c.late + c.left;
  c.rate = c.total ? Math.round(c.came / c.total * 100) : 0;
  return c;
}

export function recentEvents(n = 10, filter = () => true) {
  const k = S.day;
  return S.events.filter(e => dayKey(new Date(e.ts)) === k && filter(e)).sort((a, b) => b.ts - a.ts || b.id - a.id).slice(0, n);
}

export function absentStreak(studentId) {
  let n = 0;
  for (const d of days()) {
    const st = statusOf(studentId, d).status;
    if (st === 'absent') n++; else if (st === 'pending') continue; else break;
  }
  return n;
}

/* ---------------- scan proof ----------------
   Every scan keeps its evidence so nobody can deny coming in or leaving: the device camera's photo at that second
   (the face devices snap one on every verification, whatever the method), how it was verified (face, finger, card,
   palm) with the match score, the device serial and the event number. A manual entry records who entered it. */
export const eventById = id => S.events.find(e => String(e.id) === String(id));
export function evidenceOf(ev) {
  if (!ev) return null; const s = student(ev.studentId); const d = ev.deviceId ? device(ev.deviceId) : null;
  const h = [...String(ev.id) + ev.ts].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const manual = !ev.deviceId || String(ev.method).startsWith('يدوي');
  const kind = manual ? 'manual' : /إصبع/.test(ev.method) ? 'finger' : /بطاقة/.test(ev.method) ? 'card' : /كف/.test(ev.method) ? 'palm' : 'face';
  return { ev, student: s, device: d, kind, manual, by: manual ? String(ev.method).replace('يدوي · ', '') : null,
    score: manual ? null : 91 + (h % 9), template: kind === 'finger' ? `FP-${s?.deviceId}-${['إبهام', 'سبابة', 'وسطى'][h % 3]}` : kind === 'card' ? `بطاقة ${String(10000000 + (s?.no || 0) * 7919).slice(-8)}` : null,
    photo: !manual, ref: `${d?.serial || 'MANUAL'}-${ev.id}`, gate: d?.name || 'تسجيل يدوي' };
}
export function markManual(studentId, by) {
  const t = now();
  addEvent({ studentId, type: 'in', ts: t, deviceId: null, method: `يدوي · ${by}` });
  const p = S.plan.find(p => p.studentId === studentId); if (p) { p.inDone = true; }
  log('حضور يدوي', student(studentId).name);
  emit('manual');
}
export function addExcuse(studentId, reason, note, by) {
  S.excuses = S.excuses.filter(x => !(x.studentId === studentId && x.day === S.day));
  S.excuses.push({ studentId, day: S.day, reason, note, by, ts: now() });
  const st = student(studentId);
  // Goes up to the homeroom teacher automatically.
  const sec = section(st.sectionId);
  const t = S.teachers.find(t => t.name === sec.homeroom);
  log('تبرير غياب', `${st.name} · ${reason}`);
  if (t) notify(t.phone, { kind: 'excuse', title: `تبرير غياب: ${st.name}`, body: `${reason}${note ? ' · ' + note : ''} · من ولي الأمر`, ts: now(), studentId });
  notifyStaff({ kind: 'excuse', title: `تبرير غياب: ${st.name}`, body: `${sectionShort(st.sectionId)} · ${reason}`, ts: now(), studentId });
  emit('excuse');
}

/* ---------------- devices ---------------- */
/* Push connection (option 1): the device sends every scan straight to the platform over the internet.
   ZKTeco uses ADMS ("Cloud Server" in the device menu), Hikvision uses ISUP. The platform accepts only
   devices registered here by serial number. */
export const PUSH = {
  adms: { brand: 'ZKTeco', label: 'ZKTeco · ADMS', menu: 'القائمة ← إعدادات الاتصال ← Cloud Server Setting', fields: [['عنوان السيرفر', 'push.hader.iq'], ['المنفذ', '443'], ['HTTPS', 'تشغيل'], ['Proxy', 'إيقاف']] },
  isup: { brand: 'Hikvision', label: 'Hikvision · ISUP', menu: 'الإعدادات ← الشبكة ← Platform Access ← ISUP', fields: [['عنوان السيرفر', 'push.hader.iq'], ['المنفذ', '7660'], ['Device ID', 'يطلع بعد الحفظ'], ['مفتاح ISUP', 'يطلع بعد الحفظ']] },
};
export function addDevice({ name, protocol, serial, model }) {
  const errors = {};
  serial = String(serial || '').trim().toUpperCase();
  if (!String(name || '').trim()) errors.name = 'اكتب اسم الجهاز أو مكانه.';
  if (!PUSH[protocol]) errors.protocol = 'اختر نوع الجهاز.';
  if (!/^[A-Z0-9-]{6,24}$/.test(serial)) errors.serial = 'الرقم التسلسلي موجود على ملصق خلف الجهاز (6 أحرف أو أكثر).';
  else if (S.devices.some(d => d.serial === serial)) errors.serial = 'هذا الجهاز مربوط من قبل.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const d = { id: 'd' + Date.now(), name: name.trim(), model: String(model || '').trim() || PUSH[protocol].brand, protocol, serial, key: Math.random().toString(36).slice(2, 10).toUpperCase(), methods: ['وجه', 'بصمة إصبع', 'بطاقة'], online: false, pending: true, buffer: [] };
  S.devices.push(d);
  log('ربط جهاز بصمة', `${d.name} · ${PUSH[protocol].label} · ${serial}`);
  emit('devices');
  return { ok: true, device: d };
}
// Demo stand-in for the device's first push reaching the server.
export function firstHandshake(id) { const d = device(id); if (!d) return; d.pending = false; d.online = true; d.lastSeen = now(); log('أول اتصال من جهاز', d.name); emit('devices'); }
export function removeDevice(id) { const d = device(id); S.devices = S.devices.filter(x => x.id !== id); if (d) log('فك ربط جهاز', d.name); emit('devices'); }
export function updateDevice({ id, name, model, serial, protocol }) {
  const d = device(id);
  if (!d) return { ok: false, errors: { name: 'الجهاز غير موجود.' } };
  const errors = {};
  serial = String(serial || '').trim().toUpperCase();
  if (!String(name || '').trim()) errors.name = 'اكتب اسم الجهاز أو مكانه.';
  if (protocol && !PUSH[protocol]) errors.protocol = 'اختر نوع الجهاز.';
  if (serial && !/^[A-Z0-9-]{6,24}$/.test(serial)) errors.serial = 'الرقم التسلسلي موجود على ملصق خلف الجهاز (6 أحرف أو أكثر).';
  else if (serial && S.devices.some(x => x.id !== id && x.serial === serial)) errors.serial = 'هذا الرقم التسلسلي مستخدم بجهاز آخر.';
  if (Object.keys(errors).length) return { ok: false, errors };
  d.name = name.trim();
  if (model !== undefined) d.model = String(model || '').trim() || (protocol && PUSH[protocol] ? PUSH[protocol].brand : d.model);
  if (protocol) d.protocol = protocol;
  if (serial) d.serial = serial;
  log('تعديل جهاز بصمة', `${d.name} · ${d.serial || ''}`);
  emit('devices');
  return { ok: true, device: d };
}
export function setDeviceOnline(id, on) {
  const d = device(id); d.online = on; log(on ? 'إعادة اتصال جهاز' : 'قطع جهاز', d.name);
  notifyStaff({ kind: on ? 'in' : 'device', title: on ? `رجع الاتصال: ${d.name}` : `انقطع جهاز: ${d.name}`, body: on ? (d.buffer.length ? `وصلت ${d.buffer.length} بصمة مخزّنة` : 'يرسل البصمات مباشرة') : 'البصمات تتخزن بالجهاز وتنرسل من يرجع', ts: now() });
  if (on && d.buffer.length) { d.buffer.forEach(ev => addEvent(ev, false)); d.buffer = []; }
  emit('device');
}
export function simulateScan(deviceId) {
  const d = device(deviceId);
  const waiting = S.plan.filter(p => !p.inDone && statusOf(p.studentId).status !== 'excused');
  if (!waiting.length) return null;
  const p = waiting[Math.floor(Math.random() * waiting.length)];
  p.inDone = true;
  const ev = { studentId: p.studentId, type: 'in', ts: now(), deviceId: d.id, method: d.methods[0] };
  if (d.online) addEvent(ev, false); else d.buffer.push(ev);
  emit('scan');
  return student(p.studentId);
}

/* ---------------- students ---------------- */
export function checkStudent({ name, sectionId, gName, gPhone, sPhone }) {
  name = String(name || '').trim().replace(/\s+/g, ' ');
  const errors = {};
  if (name.split(' ').length < 3) errors.name = 'اكتب الاسم الثلاثي على الأقل.';
  if (!section(sectionId)) errors.sectionId = 'اختر الشعبة.';
  if (!String(gName || '').trim()) errors.gName = 'اكتب اسم ولي الأمر.';
  if (!validPhone(gPhone)) errors.gPhone = 'الرقم يجب أن يكون 11 رقماً ويبدأ بـ 07.';
  if (S.students.some(s => norm(s.name) === norm(name) && s.sectionId === sectionId)) errors.name = 'هذا الطالب موجود في نفس الشعبة.';
  if (sPhone && !validPhone(sPhone)) errors.sPhone = 'الرقم يجب أن يكون 11 رقماً ويبدأ بـ 07.';
  else if (sPhone && rolesFor(sPhone).length) errors.sPhone = 'هذا الرقم مستخدم لحساب آخر. لكل شخص رقم وحساب واحد.';
  return errors;
}
// Text from a spreadsheet cell ("الثالث المتوسط أ", "ثالث / ب", "g3-أ") → a section id, or null.
export function sectionByText(text) {
  const t = String(text || '').trim(); if (!t) return null;
  if (section(t)) return t;
  const n = norm(t.replace(/[\/\-–_]/g, ' '));
  const hit = S.sections.find(s => [sectionLabel(s.id), sectionShort(s.id)].some(l => norm(l.replace(/\//g, ' ')) === n));
  if (hit) return hit.id;
  const parts = t.replace(/[\/\-–_]/g, ' ').trim().split(/\s+/); const last = parts.pop();
  const g = gradeByName(parts.join(' ')) || gradeFuzzy(parts.join(' ')); if (!g) return null;
  return S.sections.find(s => s.gradeId === g.id && norm(s.name) === norm(last))?.id || null;
}
// "اول متوسط", "الأول المتوسط", "1 م", "رابع" → the grade, by its ordinal word and stage.
const ORD = ['اول', 'ثاني', 'ثالث', 'رابع', 'خامس', 'سادس'];
function gradeFuzzy(text) {
  const n = norm(text).replace(/(^|\s)ال/g, '$1');
  let i = ORD.findIndex(o => n.includes(norm(o))); if (i < 0) { const d = /[1-6١-٦]/.exec(n); if (d) i = '123456١٢٣٤٥٦'.indexOf(d[0]) % 6; }
  if (i < 0) return null;
  return S.grades.find(g => { const gn = norm(g.name).replace(/(^|\s)ال/g, '$1'); return gn.includes(norm(ORD[i])); }) || null;
}
// Bulk add from an imported file. Rows were checked on screen; this adds the valid ones and writes one audit line.
export function importStudents(rows, by, fileName) {
  const added = []; const failed = [];
  rows.forEach(r => { const x = addStudent({ ...r, quiet: true }); x.ok ? added.push(x.student) : failed.push({ row: r, errors: x.errors }); });
  if (added.length) log('استيراد طلاب من ملف', `${fileName || 'ملف'} · ${added.length} طالباً · ${by}`);
  emit('student');
  return { added, failed };
}
export function addStudent({ name, sectionId, gName, gPhone, relation, sPhone, quiet }) {
  name = String(name || '').trim().replace(/\s+/g, ' ');
  const errors = {};
  if (name.split(' ').length < 3) errors.name = 'اكتب الاسم الثلاثي على الأقل.';
  if (!section(sectionId)) errors.sectionId = 'اختر الشعبة.';
  if (!String(gName || '').trim()) errors.gName = 'اكتب اسم ولي الأمر.';
  if (!validPhone(gPhone)) errors.gPhone = 'الرقم يجب أن يكون 11 رقماً ويبدأ بـ 07.';
  if (S.students.some(s => norm(s.name) === norm(name) && s.sectionId === sectionId)) errors.name = 'هذا الطالب موجود في نفس الشعبة.';
  if (sPhone && !validPhone(sPhone)) errors.sPhone = 'الرقم يجب أن يكون 11 رقماً ويبدأ بـ 07.';
  else if (sPhone && rolesFor(sPhone).length) errors.sPhone = 'هذا الرقم مستخدم لحساب آخر. لكل شخص رقم وحساب واحد.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const phone = normalizePhone(gPhone);
  let g = S.guardians.find(x => x.phone === phone);
  const linked = !!g;
  if (!g) { g = { id: `p${S.guardians.length + 1}`, name: gName.trim(), phone, relation: relation || 'الأب' }; S.guardians.push(g); }
  const no = Math.max(...S.students.map(s => s.no)) + 1;
  const s = { id: `s${no}`, no, deviceId: no, name, sectionId, guardianId: g.id, female: false, face: false, since: S.today, phone: sPhone ? normalizePhone(sPhone) : null, sync: { d1: 'pending', d2: 'pending', d3: 'pending' } };
  S.students.push(s);
  S.plan.push({ studentId: s.id, deviceId: 'd1', method: 'وجه', inMin: null, outMin: null, inDone: false, outDone: false });
  // Simulated push to the devices: online ones confirm after a moment.
  setTimeout(() => { S.devices.forEach(d => { s.sync[d.id] = d.online ? 'done' : 'queued'; }); emit('sync'); }, 1500);
  if (!quiet) { log('إضافة طالب', `${s.name} · ${sectionLabel(sectionId)}`); emit('student'); }
  return { ok: true, student: s, linked };
}
// Face enrolment. The first photo is kept forever as the reference the administration compares against;
// later captures are added as updates and never replace it.
export function captureFace(studentId, data, by) {
  const s = student(studentId); s.face = true;
  if (data) { s.photos = s.photos || []; s.photos.push({ data, ts: now(), by: by || '' }); log(s.photos.length === 1 ? 'تسجيل صورة الوجه' : 'تحديث صورة الوجه', `${s.name}${s.photos.length > 1 ? ' · الصورة الأولى محفوظة' : ''}`); }
  emit('face');
}
export const photoOf = id => student(id)?.photos?.[0]?.data || null;
export const photosOf = id => student(id)?.photos || [];

/* ---------------- search ---------------- */
export function search(q, scope = {}) {
  const n = norm(q); const d = q.replace(/\D/g, '');
  if (!n) return { students: [], sections: [], guardians: [] };
  let list = S.students;
  if (scope.sections) list = list.filter(s => scope.sections.includes(s.sectionId));
  const studentsHit = list.filter(s => norm(s.name).includes(n) || (d && (String(s.no).startsWith(d) || guardian(s.guardianId).phone.endsWith(d))) || norm(sectionShort(s.sectionId)).includes(n)).slice(0, 8);
  const sectionsHit = S.sections.filter(s => (!scope.sections || scope.sections.includes(s.id)) && (norm(sectionLabel(s.id)).includes(n) || norm(sectionShort(s.id)).includes(n))).slice(0, 4);
  const guardiansHit = scope.sections ? [] : S.guardians.filter(g => norm(g.name).includes(n) || (d.length >= 4 && g.phone.includes(d))).slice(0, 4);
  return { students: studentsHit, sections: sectionsHit, guardians: guardiansHit };
}

/* ---------------- notifications ---------------- */
function notify(phone, n) { S.notes.unshift({ id: Math.random().toString(36).slice(2), phone, read: false, ...n }); }
// The platform admin and the school managers hear about what needs a decision (devices, excuses).
function notifyStaff(n) { [...OWNERS.map(o => o.phone), ...S.admins.map(a => a.phone)].forEach(p => notify(p, n)); }
export const notes = phone => S.notes.filter(n => n.phone === phone).sort((a, b) => b.ts - a.ts);
export const unread = phone => S.notes.filter(n => n.phone === phone && !n.read).length;
export function readAll(phone) { S.notes.forEach(n => { if (n.phone === phone) n.read = true; }); emit('notes'); }

/* ---------------- accounts ---------------- */
const OWNERS = [{ phone: '07700000000', name: 'مالك المنصة' }];
let actor = 'النظام';
export const setActor = name => { actor = name; };
function log(action, detail) { S.audit.unshift({ ts: now(), by: actor, action, detail }); }
export const audit = () => S.audit;
export function rolesFor(phone) {
  phone = normalizePhone(phone);
  const roles = [];
  const o = OWNERS.find(x => x.phone === phone); if (o) roles.push({ role: 'owner', name: o.name, label: 'الأدمن · يدير النظام · كامل الصلاحيات' });
  const a = S.admins.find(x => x.phone === phone); if (a) roles.push({ role: 'admin', name: a.name, label: 'مدير المدرسة · يدير المدرسة · كامل الصلاحيات' });
  const t = S.teachers.find(x => x.phone === phone); if (t) roles.push({ role: 'teacher', name: t.name, label: 'مدرس', teacherId: t.id });
  const g = S.guardians.find(x => x.phone === phone);
  // A student without a phone has no login of their own; the parent follows everything from the parent account.
  if (g) roles.push({ role: 'parent', name: g.name, label: 'ولي أمر', guardianId: g.id });
  const st = S.students.find(x => x.phone === phone);
  if (st) roles.push({ role: 'student', name: st.name, label: 'طالب', studentId: st.id });
  return roles;
}
export function requestCode(phone) {
  if (!validPhone(phone)) return { ok: false, error: 'اكتب رقماً عراقياً من 11 رقماً يبدأ بـ 07.' };
  if (!rolesFor(phone).length) return { ok: false, error: 'هذا الرقم غير مسجّل في المدرسة. تواصل مع الإدارة لإضافته.' };
  if (S.disabled.includes(normalizePhone(phone))) return { ok: false, error: 'هذا الحساب موقوف. تواصل مع إدارة المنصة.' };
  return { ok: true, demoCode: '123456' }; // the server sends a real SMS here
}
export function verifyCode(phone, code) {
  if (code !== '123456') return { ok: false, error: 'الرمز غير صحيح. تأكد من الرسالة وحاول مرة ثانية.' };
  return startSession(phone);
}

/* ---------------- username + password (website login for staff) ----------------
   The admin or the school manager generates a username and a one-time activation code for a
   staff account (manager or teacher). On first sign-in the person sets their own password; the
   admin never knows it. Parents and students keep signing in with their phone and SMS.
   Demo only: the password is kept as a simple hash in the browser; the server stores a bcrypt hash. */
const STAFF = ['owner', 'admin', 'teacher'];
const hashPw = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
function seedCreds() {
  return {
    '07700000000': { username: 'admin', hash: hashPw('hader2026'), ts: Date.now() },
    '07700000001': { username: 'm1001', hash: hashPw('hader2026'), ts: Date.now() },
    '07700000002': { username: 't1001', hash: hashPw('hader2026'), ts: Date.now() },
  };
}
// Demo: put every login back to the starting accounts (admin, m1001, t1001 with hader2026),
// clear lockouts and signed-in devices. Data (students, posts, marks) is kept.
export function resetLogins() {
  S.creds = seedCreds(); S.fails = {}; S.disabled = [];
  try { localStorage.removeItem(ACTIVE_KEY); } catch { }
  dev.del('hader-kicked');
  log('إعادة تهيئة حسابات الدخول', 'اليوزرات والرموز رجعت للبداية'); save(); emit('creds');
  return { ok: true };
}
export const isStaff = phone => rolesFor(phone).some(r => STAFF.includes(r.role));
export function credOf(phone) { const c = (S.creds || {})[normalizePhone(phone)]; return c ? { username: c.username, ts: c.ts, pending: !!c.temp } : null; }
const ACT_HOURS = 48;
function newCode() { const a = new Uint32Array(1); try { crypto.getRandomValues(a); } catch { a[0] = Math.random() * 1e9; } return String(100000 + a[0] % 900000); }
// Returns the activation code once, in clear, so it can be handed to the person. It is never shown again.
export function generateCreds(phone) {
  phone = normalizePhone(phone);
  if (!isStaff(phone)) return { ok: false, error: 'اليوزر للإدارة والمدرسين بس. أولياء الأمور والطلاب يدخلون برقم الهاتف.' };
  if (OWNERS.some(o => o.phone === phone) && !OWNERS.some(o => o.phone === session()?.phone)) return { ok: false, error: 'حساب الأدمن ما يتغير إلا من الأدمن نفسه.' };
  S.creds = S.creds || {};
  let username = S.creds[phone]?.username;
  if (!username) {
    const pre = rolesFor(phone).some(r => r.role === 'admin') ? 'm' : 't';
    let n = 1001; const used = new Set(Object.values(S.creds).map(c => c.username));
    while (used.has(pre + n)) n++;
    username = pre + n;
  }
  const code = newCode();
  // A reset wipes the old password: the person must set a new one with this code.
  S.creds[phone] = { username, hash: null, temp: hashPw(code), until: Date.now() + ACT_HOURS * 3600000, ts: Date.now() };
  if (S.fails) delete S.fails[username];
  log('توليد يوزر ورمز تفعيل', `${rolesFor(phone)[0]?.name} · ${username}`);
  emit('accounts');
  return { ok: true, username, code, hours: ACT_HOURS };
}
export function checkNewPassword(pw, username) {
  pw = String(pw || '');
  if (pw.length < 8) return 'الرمز لازم يكون 8 أحرف أو أكثر.';
  if (!/[A-Za-z\u0600-\u06FF]/.test(pw) || !/\d/.test(pw)) return 'خلي بالرمز حروف وأرقام سوا.';
  if (username && pw.toLowerCase().includes(String(username).toLowerCase())) return 'لا تحط اليوزر داخل الرمز.';
  if (/^(.)\1+$/.test(pw) || ['12345678', 'password', 'hader123', 'qwerty12'].includes(pw.toLowerCase())) return 'هذا الرمز سهل كلش. اختار غيره.';
  return '';
}
export const passwordStrength = pw => { pw = String(pw || ''); let s = 0; if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw) && /\D/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++; return Math.min(3, Math.max(pw ? 1 : 0, Math.ceil(s * 3 / 5))); };
// First sign-in (or after a reset): activation code → the person's own password → signed in.
export function setOwnPassword(username, code, pw, pw2) {
  username = String(username || '').trim().toLowerCase();
  const phone = Object.keys(S.creds || {}).find(p => S.creds[p].username === username);
  const c = phone && S.creds[phone];
  // Either the activation code from the admin, or a reset code sent by SMS ("نسيت الرمز").
  const t = c && (c.temp ? { h: c.temp, until: c.until } : c.reset ? { h: c.reset.h, until: c.reset.until } : null);
  if (!t || t.h !== hashPw(code)) return { ok: false, error: 'الرمز ما يطابق. اطلب رمز جديد.' };
  if (t.until < Date.now()) return { ok: false, error: 'الرمز انتهى. اطلب رمز جديد.' };
  const bad = checkNewPassword(pw, username); if (bad) return { ok: false, field: 'pw', error: bad };
  if (pw !== pw2) return { ok: false, field: 'pw2', error: 'الرمزين مو نفس الشي.' };
  S.creds[phone] = { username, hash: hashPw(pw), ts: Date.now() };
  log('تعيين رمز شخصي', `${rolesFor(phone)[0]?.name} · ${username}`);
  save();
  return startSession(phone);
}
// Signed-in staff changing their own password.
export function changeOwnPassword(oldPw, pw, pw2) {
  const s = session(); const c = s && (S.creds || {})[s.phone];
  if (!c || c.hash !== hashPw(oldPw)) return { ok: false, field: 'old', error: 'الرمز الحالي غير صحيح.' };
  const bad = checkNewPassword(pw, c.username); if (bad) return { ok: false, field: 'pw', error: bad };
  if (pw !== pw2) return { ok: false, field: 'pw2', error: 'الرمزين مو نفس الشي.' };
  c.hash = hashPw(pw); c.ts = Date.now(); log('تغيير الرمز', c.username); save();
  return { ok: true };
}
// "نسيت الرمز": a 6-digit code goes by SMS to the phone registered for this username (the admin too).
// The current password keeps working until the new one is saved, so nobody can lock a person out.
export function requestReset(username) {
  username = String(username || '').trim().toLowerCase();
  const phone = Object.keys(S.creds || {}).find(p => S.creds[p].username === username);
  if (!phone) return { ok: false, error: 'اليوزر غير موجود. تأكد منه أو راجع الإدارة.' };
  if (S.disabled.includes(phone)) return { ok: false, error: 'هذا الحساب موقوف. تواصل مع إدارة المنصة.' };
  const code = newCode();
  S.creds[phone].reset = { h: hashPw(code), until: Date.now() + 10 * 60000 };
  log('طلب رمز جديد', `${rolesFor(phone)[0]?.name} · ${username}`); save();
  return { ok: true, username, phone, demoCode: code, name: rolesFor(phone)[0]?.name }; // the server sends the SMS; demoCode is for the preview only
}
export function loginWithPassword(username, password) {
  username = String(username || '').trim().toLowerCase();
  if (!username || !password) return { ok: false, error: 'اكتب اليوزر والرمز.' };
  S.fails = S.fails || {};
  const f = S.fails[username];
  if (f && f.until > Date.now()) return { ok: false, error: `محاولات كثيرة خاطئة. حاول بعد ${Math.ceil((f.until - Date.now()) / 60000)} دقيقة، أو اطلب رمز جديد من الإدارة.` };
  const phone = Object.keys(S.creds || {}).find(p => S.creds[p].username === username);
  // Activation code instead of a password: ask the person to set their own.
  if (phone && S.creds[phone].temp && S.creds[phone].temp === hashPw(password)) {
    if (S.creds[phone].until < Date.now()) return { ok: false, error: 'رمز التفعيل انتهى. اطلب رمز جديد من الإدارة.' };
    if (S.disabled.includes(phone)) return { ok: false, error: 'هذا الحساب موقوف. تواصل مع إدارة المنصة.' };
    delete S.fails[username];
    return { ok: true, needSet: true, username, code: password, name: rolesFor(phone)[0]?.name };
  }
  if (!phone || !S.creds[phone].hash || S.creds[phone].hash !== hashPw(password)) {
    const n = (f?.n || 0) + 1; S.fails[username] = { n, until: n >= 5 ? Date.now() + 5 * 60000 : 0 }; if (n >= 5) S.fails[username].n = 0; save();
    return { ok: false, error: n >= 5 ? 'خمس محاولات خاطئة. انقفل الدخول 5 دقائق.' : `اليوزر أو الرمز غير صحيح. بقت ${5 - n} محاولات.` };
  }
  delete S.fails[username];
  if (S.disabled.includes(phone)) return { ok: false, error: 'هذا الحساب موقوف. تواصل مع إدارة المنصة.' };
  if (!isStaff(phone)) return { ok: false, error: 'هذا الحساب ما عنده دخول باليوزر.' };
  return startSession(phone);
}
function startSession(phone) {
  const roles = rolesFor(phone);
  const session = { phone: normalizePhone(phone), roles, active: roles[0].rid || roles[0].role };
  // One device per account: this login replaces any other device signed in with the same number.
  const act = storage.get(ACTIVE_KEY) || {};
  const before = act[session.phone];
  act[session.phone] = { device: DEVICE, ts: Date.now() }; storage.set(ACTIVE_KEY, act);
  if (before && before.device !== DEVICE) log('دخول من جهاز جديد', `${roles[0].name} · انسجل خروج الجهاز السابق`);
  dev.set('hader-session', session); dev.del('hader-kicked');
  return { ok: true, session, replaced: !!(before && before.device !== DEVICE) };
}
export const session = () => dev.get('hader-session');
export function setActiveRole(role) { const s = session(); s.active = role; dev.set('hader-session', s); }
export function logout() {
  const s = session(); dev.del('hader-session');
  const act = storage.get(ACTIVE_KEY) || {};
  if (s && act[s.phone]?.device === DEVICE) { delete act[s.phone]; storage.set(ACTIVE_KEY, act); }
}
// False when the same number has since signed in on another device: this device must sign out.
export function sessionValid() {
  const s = session(); if (!s) return true;
  const a = (storage.get(ACTIVE_KEY) || {})[s.phone];
  return !a || a.device === DEVICE;
}
export function kickOut() { dev.del('hader-session'); dev.set('hader-kicked', 1); }
export const takeKicked = () => !!dev.get('hader-kicked'); // cleared on the next successful sign-in
export const childrenOf = guardianId => S.students.filter(s => s.guardianId === guardianId);
export const teacher = id => S.teachers.find(t => t.id === id);
export const excuseOf = studentId => S.excuses.find(x => x.studentId === studentId && x.day === S.day);
export function updateSettings(patch) { Object.assign(S.settings, patch); S.flags.absentSent = false; log('تعديل الإعدادات', 'أوقات الدوام'); emit('settings'); }

/* ---------------- reports ---------------- */
export function monthReport(sectionId) {
  const list = students(sectionId);
  const ds = days().filter(d => d <= S.today).slice().reverse(); // oldest → today
  const rows = list.map(s => {
    const cells = ds.map(d => statusOf(s.id, d));
    const c = { present: 0, late: 0, absent: 0, excused: 0 };
    cells.forEach(x => { if (x.status === 'present' || x.status === 'left') c[x.late ? 'late' : 'present']++; else if (x.status === 'late') c.late++; else if (x.status === 'absent') c.absent++; else if (x.status === 'excused') c.excused++; });
    const counted = c.present + c.late + c.absent + c.excused;
    return { s, cells, c, rate: counted ? Math.round((c.present + c.late) / counted * 100) : 0 };
  });
  return { days: ds, rows };
}

/* ---------------- posts (homework, announcements, handouts, videos) ---------------- */
export const POST_TYPES = { hw: 'واجب', ann: 'تبليغ', pdf: 'ملزمة', video: 'فيديو' };
const postSections = p => p.sections === 'all' ? S.sections.map(s => s.id) : p.sections;
export function posts({ sections: secs, guardianId, studentId, type, forStudent } = {}) {
  return S.posts.filter(p => {
    const ps = postSections(p);
    if (type && p.type !== type) return false;
    if (forStudent && p.audience === 'parents') return false;
    if (secs && !ps.some(x => secs.includes(x))) return false;
    if (studentId) return ps.includes(student(studentId).sectionId);
    if (guardianId) return childrenOf(guardianId).some(k => ps.includes(k.sectionId));
    return true;
  }).sort((a, b) => b.ts - a.ts);
}
// The teacher who published a post, and the school (owner/admin), may edit or delete it.
export const canManagePost = (p, role, teacherId) => !!p && (['owner', 'admin'].includes(role) || (role === 'teacher' && p.by === teacherId));
export function updatePost(id, { title, body, due, file }, by) {
  const p = S.posts.find(x => x.id === id); if (!p) return { ok: false, errors: { title: 'المنشور غير موجود.' } };
  const errors = {}; if (!String(title || '').trim()) errors.title = 'اكتب عنواناً.';
  if ((p.type === 'pdf' || p.type === 'video') && file === null) errors.file = 'لازم يبقى ملف. ارفع ملف بديل بدل الحذف.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const changedFile = file !== undefined && (file?.id || null) !== (p.file?.id || null);
  p.title = title.trim(); p.body = String(body || '').trim(); if (p.type === 'hw') p.due = String(due || '').trim();
  if (file !== undefined) { if (file) p.file = file; else delete p.file; }
  p.edited = { ts: now(), by };
  if (changedFile && p.file) {
    const ps = postSections(p); const n = { kind: 'post', title: `تحديث: ${p.title}`, body: `${by} رفع ملف جديد: ${p.file.name}`, ts: now(), postId: p.id };
    new Set(S.students.filter(s => ps.includes(s.sectionId)).map(s => s.guardianId)).forEach(gid => notify(guardian(gid).phone, n));
    if (p.audience !== 'parents') S.students.filter(s => s.phone && ps.includes(s.sectionId)).forEach(s => notify(s.phone, n));
    S.reads[p.id] = [];
  }
  log(changedFile ? 'تعديل منشور وتبديل الملف' : 'تعديل منشور', `${p.title} · ${by}`); emit('post');
  return { ok: true, post: p, changedFile };
}
export function deletePost(id, by) {
  const i = S.posts.findIndex(x => x.id === id); if (i < 0) return { ok: false };
  const [p] = S.posts.splice(i, 1); delete S.reads[id];
  log('حذف منشور', `${POST_TYPES[p.type]}: ${p.title} · ${by}`); emit('post');
  return { ok: true };
}
export const isRead = (postId, guardianId) => (S.reads[postId] || []).includes(guardianId);
export function markRead(postId, guardianId) { const r = S.reads[postId] || (S.reads[postId] = []); if (!r.includes(guardianId)) { r.push(guardianId); emit('read'); } }
export const unreadPosts = (guardianId, opts = {}) => posts({ guardianId, ...opts }).filter(p => !isRead(p.id, guardianId)).length;
// "seen" = the reader opened the posts section; the tab badge counts only posts newer than that.
const readerPosts = key => key.startsWith('s:') ? posts({ studentId: key.slice(2), forStudent: true }) : posts({ guardianId: key });
export const newPosts = key => { const t = (S.seen || {})[key] || 0; return readerPosts(key).filter(p => p.ts > t && !isRead(p.id, key)).length; };
export function markSeen(key) { S.seen = S.seen || {}; if (newPosts(key)) { S.seen[key] = now(); emit('read'); } else S.seen[key] = now(); }
export function markReadMany(ids, key) { let ch = false; ids.forEach(id => { const r = S.reads[id] || (S.reads[id] = []); if (!r.includes(key)) { r.push(key); ch = true; } }); if (ch) emit('read'); }
export const unreadForStudent = (studentId, opts = {}) => posts({ studentId, forStudent: true, ...opts }).filter(p => !isRead(p.id, 's:' + studentId)).length;
export function readersOf(postId) {
  const p = S.posts.find(x => x.id === postId); const ps = postSections(p);
  const gs = new Set(S.students.filter(s => ps.includes(s.sectionId)).map(s => s.guardianId));
  return { read: (S.reads[postId] || []).filter(g => gs.has(g)).length, total: gs.size };
}
export function addPost({ type, title, body, sections: secs, audience, due, file }, author) {
  const errors = {};
  if (!POST_TYPES[type]) errors.type = 'اختر النوع.';
  if (!String(title || '').trim()) errors.title = 'اكتب عنواناً.';
  if (!secs || !secs.length) errors.sections = 'اختر شعبة واحدة على الأقل.';
  if (type === 'pdf' && !file) errors.file = 'ارفع ملف الملزمة.';
  if (type === 'video' && !file) errors.file = 'اختر ملف الفيديو من جهازك.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const p = { id: 'post' + Date.now(), type, title: title.trim(), body: String(body || '').trim(), sections: secs, audience, by: author.id, byName: author.name, ts: now(), due: due || '', ...(file ? { file } : {}) };
  S.posts.push(p);
  const ps = postSections(p);
  const gs = new Set(S.students.filter(s => ps.includes(s.sectionId)).map(s => s.guardianId));
  gs.forEach(gid => notify(guardian(gid).phone, { kind: 'post', title: `${POST_TYPES[type]} جديد: ${p.title}`, body: `${author.name}`, ts: p.ts, postId: p.id }));
  if (audience !== 'parents') S.students.filter(s => s.phone && ps.includes(s.sectionId)).forEach(s => notify(s.phone, { kind: 'post', title: `${POST_TYPES[type]} جديد: ${p.title}`, body: `${author.name}`, ts: p.ts, postId: p.id }));
  log('نشر ' + POST_TYPES[type], p.title);
  emit('post');
  return { ok: true, post: p };
}

/* ---------------- marks (grades by subject, lesson and exam) ---------------- */
export const EXAM_TYPES = { daily: 'يومي', quiz: 'اختبار قصير', monthly: 'شهري', mid: 'نصف السنة', final: 'نهائي', makeup: 'الدور الثاني' };
function seedMarks() {
  const r = rng(77); const t = S.today, h = 3600000;
  const sheet = (id, subject, lesson, examType, exam, max, sectionId, by, byName, ts, fixed = {}) => {
    const scores = {}; S.students.filter(s => s.sectionId === sectionId).forEach(s => {
      scores[s.id] = fixed[s.no] ?? Math.max(0, Math.min(max, Math.round(max * (0.45 + r() * 0.55)))); });
    return { id, subject, lesson, examType, exam, max, sectionId, by, byName, byUser: by === 't1' ? 't1001' : '', ts, scores, history: [] };
  };
  return [
    sheet('m1', 'الرياضيات', 'الفصل الأول: الأعداد الحقيقية', 'monthly', 'امتحان الشهر الأول', 100, 'g3-أ', 't1', 'أ. حيدر جاسم', t - 3 * 24 * h, { 1001: 86 }),
    sheet('m2', 'الرياضيات', 'نظرية فيثاغورس', 'daily', 'اختبار يومي', 10, 'g3-أ', 't1', 'أ. حيدر جاسم', t - 20 * h, { 1001: 9 }),
    sheet('m3', 'العلوم', 'الخلية', 'quiz', 'اختبار قصير', 20, 'g3-أ', 't3', 'أ. نادية كريم', t - 44 * h, { 1001: 17 }),
    sheet('m4', 'اللغة العربية', 'الجملة الاسمية', 'monthly', 'امتحان الشهر الأول', 100, 'g1-ب', 't2', 'أ. سارة عادل', t - 2 * 24 * h, { 1002: 92 }),
  ];
}
export function marks({ sections: secs, studentId, subject } = {}) {
  const sec = studentId ? student(studentId)?.sectionId : null;
  return (S.marks || []).filter(m => (!secs || secs.includes(m.sectionId)) && (!sec || m.sectionId === sec) && (!subject || m.subject === subject)).sort((a, b) => b.ts - a.ts);
}
export const markSheet = id => (S.marks || []).find(m => m.id === id);
export function sheetStats(m) {
  const v = Object.values(m.scores).filter(x => x !== null && x !== '' && !isNaN(x)).map(Number);
  const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  return { count: v.length, avg: Math.round(avg * 10) / 10, pct: m.max ? Math.round(avg / m.max * 100) : 0, pass: v.filter(x => x >= m.max / 2).length, top: v.length ? Math.max(...v) : 0 };
}
const markKey = key => key; // guardianId, or 's:'+studentId
export const isMarkRead = (id, key) => ((S.markReads || {})[id] || []).includes(markKey(key));
const readerMarks = key => key.startsWith('s:') ? marks({ studentId: key.slice(2) }) : childrenOf(key).flatMap(k => marks({ studentId: k.id }));
export const newMarks = key => [...new Set(readerMarks(key))].filter(m => !isMarkRead(m.id, key)).length;
export function readAllMarks(key) {
  S.markReads = S.markReads || {}; let ch = false;
  readerMarks(key).forEach(m => { const r = S.markReads[m.id] || (S.markReads[m.id] = []); if (!r.includes(key)) { r.push(key); ch = true; } });
  if (ch) emit('read');
}
export function addMarks({ subject, lesson, examType, exam, max, sectionId, scores }, author) {
  const errors = {};
  max = Number(max);
  if (!String(subject || '').trim()) errors.subject = 'اكتب اسم المادة.';
  if (!String(lesson || '').trim()) errors.lesson = 'اكتب اسم الدرس أو الفصل.';
  if (!EXAM_TYPES[examType]) errors.examType = 'اختر نوع الامتحان.';
  if (!(max > 0 && max <= 1000)) errors.max = 'الدرجة العظمى رقم أكبر من صفر.';
  if (!sectionId) errors.sectionId = 'اختر الشعبة.';
  const clean = {}; const bad = [];
  Object.entries(scores || {}).forEach(([sid, v]) => {
    if (v === '' || v == null) { clean[sid] = null; return; }
    const n = Number(v); if (isNaN(n) || n < 0 || n > max) bad.push(sid); else clean[sid] = n;
  });
  if (bad.length) errors.scores = `${bad.length} درجة غير صحيحة: لازم تكون بين 0 و ${max || '؟'}.`;
  else if (!Object.values(clean).some(v => v !== null)) errors.scores = 'اكتب درجة طالب واحد على الأقل.';
  if (Object.keys(errors).length) return { ok: false, errors, bad };
  const m = { id: 'm' + Date.now(), subject: subject.trim(), lesson: lesson.trim(), examType, exam: String(exam || '').trim() || EXAM_TYPES[examType], max, sectionId, by: author.id, byName: author.name, byUser: author.username || '', ts: now(), scores: clean, history: [] };
  S.marks.push(m);
  S.students.filter(s => s.sectionId === sectionId && clean[s.id] != null).forEach(s => {
    const body = `${m.subject} · ${m.lesson} · ${m.exam}: ${clean[s.id]} من ${max}`;
    notify(guardian(s.guardianId).phone, { kind: 'mark', title: `درجة جديدة: ${first(s.name)}`, body, ts: m.ts, studentId: s.id });
    if (s.phone) notify(s.phone, { kind: 'mark', title: 'درجة جديدة', body, ts: m.ts, studentId: s.id });
  });
  log('نشر درجات', `${m.subject} · ${m.exam} · ${sectionLabel(sectionId)}`);
  emit('marks');
  return { ok: true, mark: m };
}

// Editing a published mark. Teachers edit only their own sheets; the manager and the admin edit any.
// Every change keeps the old value, the new one, the reason, and who did it (name + username): nothing is silent.
export function canEditSheet(m, role, teacherId) { return role === 'owner' || role === 'admin' || (role === 'teacher' && m.by === teacherId); }
export function editMark(sheetId, studentId, value, reason, author) {
  const m = markSheet(sheetId); if (!m) return { ok: false, error: 'الامتحان غير موجود.' };
  if (!canEditSheet(m, author.role, author.teacherId)) return { ok: false, error: 'ما عندك صلاحية تعدّل هذا الامتحان. يعدّله المدرس اللي نشره أو الإدارة.' };
  const del = value === null || value === '';
  const n = del ? null : Number(value);
  if (!del && (isNaN(n) || n < 0 || n > m.max)) return { ok: false, field: 'value', error: `الدرجة لازم تكون بين 0 و ${m.max}.` };
  if (String(reason || '').trim().length < 4) return { ok: false, field: 'reason', error: 'اكتب سبب التعديل. ينحفظ ويه التعديل ويشوفه المدير.' };
  const from = m.scores[studentId] ?? null;
  if (from === n) return { ok: false, field: 'value', error: 'نفس الدرجة الحالية.' };
  m.scores[studentId] = n;
  m.history = m.history || [];
  const h = { studentId, from, to: n, action: del ? 'delete' : (from === null ? 'add' : 'edit'), reason: reason.trim(), by: author.name, byUser: author.username || '', role: author.roleLabel || '', ts: now() };
  m.history.unshift(h);
  const st = student(studentId);
  const what = del ? `انحذفت الدرجة (كانت ${from})` : from === null ? `انضافت الدرجة ${n} من ${m.max}` : `تعدّلت من ${from} إلى ${n} من ${m.max}`;
  const body = `${m.subject} · ${m.exam}: ${what} · بواسطة ${author.name}`;
  notify(guardian(st.guardianId).phone, { kind: 'mark', title: `تعديل درجة: ${first(st.name)}`, body, ts: h.ts, studentId });
  if (st.phone) notify(st.phone, { kind: 'mark', title: 'تعديل درجة', body, ts: h.ts, studentId });
  // The managers always hear about a changed mark, even when a teacher edits their own sheet.
  if (author.role === 'teacher') notifyStaff({ kind: 'mark', title: `تعديل درجة: ${st.name}`, body: `${body} (${author.username || ''}) · السبب: ${h.reason}`, ts: h.ts, studentId });
  log(del ? 'حذف درجة' : 'تعديل درجة', `${st.name} · ${m.subject} · ${m.exam} · ${from ?? '—'} ← ${n ?? 'محذوفة'} · ${author.name}${author.username ? ' (' + author.username + ')' : ''} · ${h.reason}`);
  emit('marks');
  return { ok: true };
}
export const markHistory = (sheetId, studentId) => ((markSheet(sheetId) || {}).history || []).filter(h => !studentId || h.studentId === studentId);

/* ---------------- weekly timetable ----------------
   Each section has a working copy (draft) that the school and the section's teachers edit, and the
   published copy that students and parents see. Nothing reaches them until someone presses «نشر». */
export const WEEK = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
export const SUBJECTS = ['الرياضيات', 'اللغة العربية', 'العلوم', 'اللغة الإنكليزية', 'التربية الإسلامية', 'الاجتماعيات', 'الحاسوب', 'الفنية', 'الرياضة'];
export function periods() {
  const [h, m] = S.settings.start.split(':').map(Number); let t = h * 60 + m; const out = [];
  for (let i = 0; i < 6; i++) { if (i === 3) t += 15; out.push({ n: i + 1, from: t, to: t + 45 }); t += 50; }
  const hm = x => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
  return out.map(p => ({ ...p, label: `${hm(p.from)}–${hm(p.to)}` }));
}
const ORD_P = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة'];
export const periodName = i => `الحصة ${ORD_P[i]}`;
const teacherFor = (subject, secId) => S.teachers.find(t => t.subject === subject && t.sections.includes(secId))?.name || '';
function seedTT() {
  const tt = {};
  S.sections.forEach((s, si) => {
    const grid = WEEK.map((_, d) => Array.from({ length: 6 }, (_, p) => { const sub = SUBJECTS[(d * 6 + p * 5 + si * 3) % SUBJECTS.length]; return { subject: sub, teacher: teacherFor(sub, s.id) }; }));
    tt[s.id] = { draft: grid, pub: JSON.parse(JSON.stringify(grid)), pubAt: S.today - 6 * 864e5, pubBy: 'الإدارة', log: [] };
  });
  // Unpublished edits in two sections, so the comparison has something to show.
  const a = tt['g3-أ']; if (a) { a.draft[0][1] = { subject: 'العلوم', teacher: teacherFor('العلوم', 'g3-أ') }; a.draft[2][4] = null; a.draft[3][0] = { subject: 'الرياضيات', teacher: teacherFor('الرياضيات', 'g3-أ') }; }
  const b = tt['g1-أ']; if (b) b.draft[1][2] = { subject: 'اللغة العربية', teacher: teacherFor('اللغة العربية', 'g1-أ') };
  return tt;
}
function TT() { if (!S.tt) { S.tt = seedTT(); S.ttSeen = { _seed: now() }; } return S.tt; }
const sameCell = (a, b) => (!a && !b) || (a && b && a.subject === b.subject && (a.teacher || '') === (b.teacher || ''));
export function ttOf(secId) {
  const all = TT(); if (!all[secId] && section(secId)) all[secId] = { draft: WEEK.map(() => Array(6).fill(null)), pub: null, pubAt: null, pubBy: '', log: [] };
  return all[secId];
}
export function ttDiff(secId) {
  const t = ttOf(secId); if (!t) return []; const out = [];
  t.draft.forEach((row, d) => row.forEach((c, p) => { const was = t.pub ? t.pub[d][p] : null; if (!sameCell(c, was)) out.push({ d, p, from: was, to: c }); }));
  return out;
}
export const ttPending = secs => (secs || S.sections.map(s => s.id)).filter(id => ttDiff(id).length).length;
export const ttCanEdit = (role, teacherId, secId) => ['owner', 'admin'].includes(role) || (role === 'teacher' && !!teacher(teacherId)?.sections.includes(secId) && teacherCan(teacherId, 'tt'));
export function ttSet(secId, d, p, cell, by) {
  const t = ttOf(secId); if (!t) return { ok: false };
  if (cell) { const subject = String(cell.subject || '').trim(); if (!subject) return { ok: false, error: 'اكتب اسم المادة.' }; if (subject.length > 30) return { ok: false, error: 'اسم المادة طويل.' }; cell = { subject, teacher: String(cell.teacher || '').trim() }; }
  const was = t.draft[d][p]; t.draft[d][p] = cell || null;
  t.log.unshift({ d, p, from: was, to: cell || null, by, ts: now() });
  log(cell ? 'تعديل الجدول (مسودة)' : 'حذف حصة من الجدول (مسودة)', `${sectionShort(secId)} · ${WEEK[d]} ${periodName(p)} · ${cell ? cell.subject : (was?.subject || '')} · ${by}`);
  emit('tt'); return { ok: true };
}
export function ttRevert(secId, by) { const t = ttOf(secId); if (!t?.pub) return; t.draft = JSON.parse(JSON.stringify(t.pub)); log('تراجع عن تعديلات الجدول', `${sectionShort(secId)} · ${by}`); emit('tt'); }
export function ttPublish(secId, by) {
  const t = ttOf(secId); const ch = ttDiff(secId); const first = !t.pub;
  if (!first && !ch.length) return { ok: false, error: 'ما أكو تغييرات جديدة للنشر.' };
  t.pub = JSON.parse(JSON.stringify(t.draft)); t.pubAt = now(); t.pubBy = by;
  const body = first ? `جدول ${sectionShort(secId)} صار متاح` : ch.slice(0, 3).map(c => `${WEEK[c.d]} ${periodName(c.p)}: ${c.to ? c.to.subject : 'ألغيت'}`).join(' · ') + (ch.length > 3 ? ` (+${ch.length - 3})` : '');
  const n = { kind: 'post', title: first ? 'انتشر الجدول الأسبوعي' : `تحديث على جدول ${sectionShort(secId)}`, body, ts: now() };
  const sent = new Set();
  students(secId).forEach(s => { const g = guardian(s.guardianId); if (g && !sent.has(g.phone)) { sent.add(g.phone); notify(g.phone, { ...n, studentId: s.id }); } if (s.phone) notify(s.phone, { ...n, studentId: s.id }); });
  log('نشر الجدول', `${sectionShort(secId)} · ${ch.length} تغيير · ${by}`); emit('tt');
  return { ok: true, changes: ch.length, sent: sent.size };
}
// What a parent or student sees: the published copy only.
export const ttPublished = secId => ttOf(secId)?.pub || null;
export function ttNew(key, secIds) { TT(); const seen = S.ttSeen[key] || S.ttSeen._seed || 0; return secIds.filter(id => (ttOf(id)?.pubAt || 0) > seen).length; }
export function ttMarkSeen(key, secIds) { TT(); const last = Math.max(0, ...secIds.map(id => ttOf(id)?.pubAt || 0)); if ((S.ttSeen[key] || 0) < last) { S.ttSeen[key] = last; emit('ttseen'); } }
// Today's position in the timetable: current and next lesson.
export function ttToday(secId) {
  const pub = ttPublished(secId); const d = new Date(now()); const wd = d.getDay(); if (!pub || wd > 4 || isHoliday()) return { off: true };
  const m = d.getHours() * 60 + d.getMinutes(); const ps = periods();
  const cur = ps.findIndex(p => m >= p.from && m < p.to); const next = ps.findIndex(p => p.from > m);
  return { day: wd, cur, next, row: pub[wd], ps };
}

/* ---------------- promotion (ترحيل الطلبة) ----------------
   Reads the final marks from the grades section and sorts every student:
   ناجح (all counted subjects passed) → moves up a grade; مكمل (failed up to N subjects) → sits the second round (الدور الثاني);
   راسب (more than N) → repeats the year. Ministerial grades (3م، 6ع) go to the ministry exam instead of moving here.
   The rules are the school's to set; defaults follow the usual Iraqi practice (pass mark 50, second round for up to 3 subjects). */
const PROMO_DEFAULT = { pass: 50, maxMakeup: 3, method: 'final', ministerial: ['g3', 'g6'], noCount: ['الرياضة', 'الفنية'], auto: false, autoDate: '' };
export const promoRules = () => ({ ...PROMO_DEFAULT, ...(S.settings.promo || {}) });
export function setPromoRules(patch, by) {
  const r = { ...promoRules(), ...patch }; r.pass = Math.max(1, Math.min(100, Number(r.pass) || 50)); r.maxMakeup = Math.max(0, Math.min(10, Number(r.maxMakeup) || 0));
  S.settings.promo = r; log('تعديل قواعد الترحيل', `النجاح ${r.pass} · الدور الثاني لحد ${r.maxMakeup} مواد · ${r.method === 'final' ? 'الامتحان النهائي' : 'معدل كل الامتحانات'} · ${by}`); emit('promo');
}
const gradeOrder = () => S.grades;
export function nextGradeOf(gradeId) { const i = gradeOrder().findIndex(g => g.id === gradeId); return i >= 0 && i < gradeOrder().length - 1 ? gradeOrder()[i + 1] : null; }
// Counted subjects of a section: from its timetable (and any subject that has marks), minus the ones that don't count.
export function sectionSubjects(secId) {
  const r = promoRules(); const t = ttOf(secId); const set = new Set();
  (t?.pub || t?.draft || []).forEach(row => row.forEach(c => c && set.add(c.subject)));
  (S.marks || []).filter(m => m.sectionId === secId).forEach(m => set.add(m.subject));
  return [...set].filter(s => !r.noCount.includes(s)).sort();
}
// Demo: a final exam sheet for every section and subject, so promotion has real marks to read (they show in «الدرجات» too).
function ensureFinals() {
  if (S.finalsSeeded) return; S.finalsSeeded = true;
  const r = rng(2027); const ability = {}; S.students.forEach(s => { ability[s.id] = s.no === 1001 ? .9 : s.no === 1002 ? .78 : .5 + r() * .5; });
  S.sections.forEach(sec => sectionSubjects(sec.id).forEach((sub, k) => {
    if ((S.marks || []).some(m => m.sectionId === sec.id && m.subject === sub && m.examType === 'final')) return;
    const t = S.teachers.find(x => x.subject === sub && x.sections.includes(sec.id));
    const scores = {}; S.students.filter(s => s.sectionId === sec.id).forEach(s => { scores[s.id] = Math.max(12, Math.min(100, Math.round(ability[s.id] * 100 + (r() - .5) * 28))); });
    S.marks.push({ id: `fin-${sec.id}-${k}`, subject: sub, lesson: 'المنهج كامل', examType: 'final', exam: 'الامتحان النهائي (تجريبي)', max: 100, sectionId: sec.id, by: t?.id || 'admin', byName: t?.name || 'الإدارة', byUser: t?.id === 't1' ? 't1001' : '', ts: now() - 2 * 864e5, scores, history: [], demo: true });
  }));
  IDX = null; save();
}
const pct = (m, sid) => { const v = m.scores[sid]; return v === null || v === undefined || v === '' || isNaN(v) ? null : Number(v) / m.max * 100; };
export function subjectResult(sid, secId, subject) {
  const r = promoRules(); const ms = (S.marks || []).filter(m => m.sectionId === secId && m.subject === subject);
  const mk = ms.filter(m => m.examType === 'makeup').sort((a, b) => b.ts - a.ts).map(m => pct(m, sid)).find(v => v !== null);
  let score = null;
  if (r.method === 'final') score = ms.filter(m => m.examType === 'final').sort((a, b) => b.ts - a.ts).map(m => pct(m, sid)).find(v => v !== null) ?? null;
  else { const v = ms.filter(m => m.examType !== 'makeup').map(m => pct(m, sid)).filter(x => x !== null); score = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
  if (score !== null) score = Math.round(score);
  const passFirst = score !== null && score >= r.pass;
  const makeup = mk !== undefined ? Math.round(mk) : null;
  return { subject, score, makeup, pass: passFirst || (makeup !== null && makeup >= r.pass), viaMakeup: !passFirst && makeup !== null && makeup >= r.pass, missing: score === null };
}
export function promotionOf(sid) {
  ensureFinals();
  const s = student(sid); if (!s) return null; const sec = section(s.sectionId); const r = promoRules();
  const subs = sectionSubjects(s.sectionId).map(x => subjectResult(sid, s.sectionId, x));
  const missing = subs.filter(x => x.missing); const failed = subs.filter(x => !x.missing && !x.pass);
  const anyMakeupDone = subs.some(x => x.makeup !== null);
  let status = missing.length ? 'incomplete' : !failed.length ? 'pass' : (failed.length <= r.maxMakeup && !anyMakeupDone) ? 'makeup' : 'fail';
  const ministerial = r.ministerial.includes(sec.gradeId);
  const next = nextGradeOf(sec.gradeId);
  const avg = subs.filter(x => !x.missing).length ? Math.round(subs.filter(x => !x.missing).reduce((a, x) => a + Math.max(x.score, x.makeup ?? 0), 0) / subs.filter(x => !x.missing).length) : null;
  return { student: s, subjects: subs, failed, missing, passedN: subs.filter(x => x.pass).length, total: subs.length, status, ministerial, next, graduate: !next, avg };
}
export const PROMO_STATUS = { pass: 'ناجح', makeup: 'مكمل (دور ثاني)', fail: 'راسب', incomplete: 'ناقص درجات' };
export function promotionBoard(secIds) {
  ensureFinals();
  return S.students.filter(s => !secIds || secIds.includes(s.sectionId)).map(s => promotionOf(s.id));
}
// Move every passing student up one grade (same section letter when it exists, created if needed); last grade graduates.
export function runPromotion(by, { auto = false } = {}) {
  const board = promotionBoard(); const r = promoRules();
  const rec = { id: 'pr' + Date.now(), ts: now(), by: auto ? 'تلقائي' : by, moved: [], graduated: [], stayed: [], makeup: [], ministerial: [] };
  board.forEach(p => {
    const s = p.student; const from = s.sectionId; const g = guardian(s.guardianId); const first = s.name.split(' ')[0];
    const tell = (title, body) => { if (g) notify(g.phone, { kind: 'mark', title, body, ts: now(), studentId: s.id }); if (s.phone) notify(s.phone, { kind: 'mark', title, body, ts: now(), studentId: s.id }); };
    if (p.status === 'pass' && p.ministerial && p.next) { rec.ministerial.push(s.id); tell(`${first}: ناجح ومؤهل للامتحان الوزاري`, `نجح بكل المواد (${p.passedN} من ${p.total}). يترحّل بعد نتيجة الوزاري.`); return; }
    if (p.status === 'pass') {
      if (!p.next) { rec.graduated.push({ id: s.id, from }); s.graduated = now(); s.sectionId = from; S.graduates = S.graduates || []; S.graduates.push(s.id); tell(`مبروك! ${first} تخرّج`, `أنهى ${grade(section(from).gradeId).name} بنجاح.`); return; }
      const name = section(from).name; let to = S.sections.find(x => x.gradeId === p.next.id && x.name === name) || null;
      if (!to) { const a = addSection({ gradeId: p.next.id, name, homeroom: '' }); to = a.ok ? a.section : S.sections.find(x => x.gradeId === p.next.id); }
      s.sectionId = to.id; rec.moved.push({ id: s.id, from, to: to.id });
      tell(`${first} ترحّل إلى ${p.next.name}`, `ناجح بكل المواد (${p.passedN} من ${p.total})، والشعبة الجديدة ${sectionLabel(to.id)}.`); return;
    }
    if (p.status === 'makeup') { rec.makeup.push(s.id); tell(`${first}: مكمل بـ ${p.failed.length} ${p.failed.length === 1 ? 'مادة' : 'مواد'}`, `يدخل امتحان الدور الثاني بـ: ${p.failed.map(x => x.subject).join('، ')}.`); return; }
    if (p.status === 'fail') { rec.stayed.push(s.id); tell(`نتيجة ${first}: راسب`, `راسب بـ ${p.failed.length} مواد، ويعيد ${grade(section(from).gradeId).name}. تواصل ويه الإدارة للمتابعة.`); }
  });
  // Students who moved now belong to new sections: drop the graduates out of the active list.
  const gone = S.students.filter(s => s.graduated); S.graduatedStore = [...(S.graduatedStore || []), ...gone];
  S.students = S.students.filter(s => !s.graduated); if (auto) rec.autoKey = promoRules().autoDate;
  S.promotions = S.promotions || []; S.promotions.unshift(rec); IDX = null;
  log(auto ? 'ترحيل تلقائي للطلبة' : 'ترحيل الطلبة', `ترحّل ${rec.moved.length} · تخرّج ${rec.graduated.length} · مكمل ${rec.makeup.length} · راسب ${rec.stayed.length} · وزاري ${rec.ministerial.length} · ${rec.by}`);
  emit('student'); return { ok: true, rec };
}
export const promotions = () => S.promotions || [];
export function undoPromotion(by) {
  const rec = (S.promotions || [])[0]; if (!rec || rec.undone) return { ok: false };
  rec.moved.forEach(m => { const s = student(m.id); if (s) s.sectionId = m.from; });
  rec.graduated.forEach(gq => { const i = (S.graduatedStore || []).findIndex(x => x.id === gq.id); if (i >= 0) { const [s] = S.graduatedStore.splice(i, 1); delete s.graduated; S.students.push(s); } });
  rec.undone = { ts: now(), by }; IDX = null;
  log('تراجع عن الترحيل', `${rec.moved.length} طالب رجعوا لشعبهم · ${by}`); emit('student'); return { ok: true, n: rec.moved.length };
}

/* ---------------- school assistant ("اسأل المدرسة") ----------------
   Parents and students ask in plain words. The assistant answers only from this platform's data and
   only about the asker's own children (or the student themself). No phone numbers, no other students.
   Anything it cannot answer, or that needs a person, goes to the administration as a ticket. */
const ASK = (k) => (S.chats[k] = S.chats[k] || { messages: [] });
export const chatOf = key => ASK(key).messages;
export function chatPush(key, msg) { ASK(key).messages.push({ id: Math.random().toString(36).slice(2), ts: now(), ...msg }); emit('chat'); }
const has = (t, ...w) => w.some(x => t.includes(norm(x)));
// Plain facts about one student that the assistant may use (the same facts it may show the asker).
export function studentFacts(studentId) {
  const s = student(studentId); if (!s) return null;
  const st = statusOf(s.id); const sec = section(s.sectionId);
  const month = days().map(d => statusOf(s.id, d).status);
  const cnt = k => month.filter(x => x === k).length;
  const hw = posts({ studentId: s.id, forStudent: true }).filter(p => p.type === 'hw').slice(0, 3);
  const ann = posts({ studentId: s.id }).filter(p => p.type === 'ann').slice(0, 3);
  const mk = marks({ studentId: s.id }).slice(0, 4).map(m => ({ subject: m.subject, exam: m.exam, lesson: m.lesson, score: m.scores[s.id], max: m.max, day: dayKey(new Date(m.ts)) }));
  return { name: s.name, first: first(s.name), section: sectionLabel(s.sectionId), homeroom: sec?.homeroom || '',
    today: { status: st.status, label: STATUS[st.status]?.label || st.status, in: st.inEv ? fmtTime(st.inEv.ts) : null, out: st.outEv ? fmtTime(st.outEv.ts) : null, excuse: excuseOf(s.id)?.reason || null },
    month: { days: month.length, present: cnt('present') + cnt('left'), late: cnt('late'), absent: cnt('absent'), excused: cnt('excused') },
    homework: hw.map(p => ({ title: p.title, due: p.due || '', by: p.byName || '' })), announcements: ann.map(p => ({ title: p.title, body: p.body })), marks: mk };
}
export function schoolFacts() {
  const st = S.settings; const t = new Date(S.today); const tm = new Date(t); tm.setDate(t.getDate() + 1);
  const off = d => offDay(d.getTime());
  return { school: st.schoolName, start: st.start, late: st.late, absentAt: st.absentAt, end: st.end, weekend: 'الجمعة والسبت',
    todayOff: isHoliday(), todayOffName: holidayName(), tomorrowOff: off(tm) || [5, 6].includes(tm.getDay()), tomorrow: dayKey(tm),
    holidays: holidays().filter(h => h.day >= dayKey(t)).map(h => ({ day: h.day, name: h.name })) };
}
// Offline answer: the reply text plus optional action buttons. Returns null when it does not know.
export function ruleAnswer(text, studentId, asker) {
  const t = norm(text); const f = studentId ? studentFacts(studentId) : null; const sc = schoolFacts();
  const who = asker === 'student' ? 'انت' : f?.first;
  if (has(t, 'رقم', 'تلفون', 'تليفون', 'هاتف', 'موبايل', 'واتساب') && !has(t, 'المدرسه')) return { text: 'ما أكدر أعطي أرقام تليفونات أو معلومات عن أشخاص ثانيين. إذا تحتاج تتواصل ويه مدرس، أكدر أحوّل رسالتك للإدارة.', actions: [{ kind: 'escalate', label: 'حوّل رسالتي للإدارة' }] };
  if (has(t, 'السلام', 'مرحبا', 'هلا', 'صباح', 'مساء') && t.length < 25) return { text: `هلا بيك 👋 أنا مساعد ${sc.school}. اسألني عن الحضور، الواجبات، الدرجات، العطل، أو أي شي تحتاجه من المدرسة.` };
  if (has(t, 'شكرا', 'مشكور', 'تسلم', 'عاشت')) return { text: 'العفو، بالخدمة دائماً.' };
  if (!has(t, 'جدول', 'حصه', 'حصص') && has(t, 'عطله', 'عطل', 'دوام', 'باچر', 'باجر', 'غدا', 'بكره', 'الجمعه', 'السبت')) {
    const nx = sc.holidays[0];
    return { text: `${sc.todayOff ? `اليوم عطلة (${sc.todayOffName}). ` : `الدوام اليوم من ${sc.start} لحد ${sc.end}. `}${sc.tomorrowOff ? 'باچر عطلة ما بيها دوام.' : 'باچر دوام عادي.'} العطلة الأسبوعية ${sc.weekend}.${nx ? ` أقرب عطلة رسمية: ${nx.name} يوم ${nx.day.split('-').reverse().join('/')}.` : ''}` };
  }
  if (!f) return null;
  if (has(t, 'تبرير', 'عذر', 'ابرر', 'مريض', 'مريضه')) {
    if (asker !== 'parent') return { text: 'تبرير الغياب يسويه ولي الأمر من حسابه.' };
    return f.today.status === 'absent' && !f.today.excuse ? { text: `${f.first} مسجّل غائب اليوم. تكدر تبرر غيابه هسه ويوصل التبرير لمربي الشعبة تلقائياً.`, actions: [{ kind: 'excuse', label: `تبرير غياب ${f.first}` }] }
      : { text: f.today.excuse ? `انسجل تبرير اليوم لـ${f.first}: ${f.today.excuse}.` : `${f.first} مو مسجّل غائب اليوم، فما يحتاج تبرير.` };
  }
  if (has(t, 'حضور', 'حضر', 'وصل', 'غياب', 'غايب', 'غائب', 'تاخر', 'متاخر', 'انصرف', 'طلع', 'اليوم', 'بصم')) {
    const d = f.today; const m = f.month;
    const today = d.status === 'holiday' ? 'اليوم عطلة.' : d.status === 'pending' ? `${who === 'انت' ? 'بعدك ما بصمت' : `${f.first} بعده ما بصم`} اليوم.` : `اليوم: ${d.label}${d.in ? ` · وصل ${d.in}` : ''}${d.out ? ` · انصرف ${d.out}` : ''}${d.excuse ? ` · العذر: ${d.excuse}` : ''}.`;
    return { text: `${today} آخر ${m.days} يوم دراسي: حضور ${m.present}، تأخير ${m.late}، غياب ${m.absent}${m.excused ? `، بعذر ${m.excused}` : ''}.`, actions: [{ kind: 'link', label: asker === 'student' ? 'سجل حضوري' : 'تفاصيل الحضور', href: asker === 'student' ? '#/myatt' : '#/parent' }] };
  }
  if (has(t, 'واجب', 'واجبات', 'ملزمه', 'فيديو', 'محاضره')) {
    const h = f.homework;
    return { text: h.length ? `آخر الواجبات:\n${h.map(x => `• ${x.title}${x.due ? ` (التسليم: ${x.due})` : ''}${x.by ? ` · ${x.by}` : ''}`).join('\n')}` : 'ما أكو واجبات منشورة حالياً.', actions: [{ kind: 'link', label: 'كل الواجبات', href: '#/posts' }] };
  }
  if (has(t, 'درج', 'امتحان', 'نتيجه', 'معدل', 'اختبار', 'نجح', 'رسب')) {
    const k = f.marks;
    return { text: k.length ? `آخر الدرجات:\n${k.map(x => `• ${x.subject} · ${x.exam}: ${x.score ?? 'لم يُمتحن'} من ${x.max}`).join('\n')}` : 'ما أكو درجات منشورة بعد.', actions: [{ kind: 'link', label: 'كل الدرجات', href: '#/marks' }] };
  }
  if (has(t, 'تبليغ', 'اعلان', 'خبر', 'اجتماع')) {
    const a = f.announcements;
    return { text: a.length ? `آخر التبليغات:\n${a.map(x => `• ${x.title}`).join('\n')}` : 'ما أكو تبليغات جديدة.', actions: [{ kind: 'link', label: 'كل المنشورات', href: '#/posts' }] };
  }
  if (has(t, 'جدول', 'حصه', 'حصص', 'الدرس الجاي', 'شنو عدنا', 'شنو عده')) {
    const st = student(studentId); const x = ttToday(st.sectionId); const pub = ttPublished(st.sectionId);
    if (!pub) return { text: 'المدرسة بعدها ما نشرت الجدول الأسبوعي.' };
    const tm = new Date(now()); tm.setDate(tm.getDate() + 1); const wd = tm.getDay();
    const listOf = row => row.map((c, i) => c ? `${i + 1}. ${c.subject}` : null).filter(Boolean).join('، ');
    const today = x.off ? 'اليوم ما بيه دوام.' : `${x.cur >= 0 && x.row[x.cur] ? `هسه ${periodName(x.cur)}: ${x.row[x.cur].subject}. ` : ''}${x.next >= 0 && x.row[x.next] ? `الجاية: ${x.row[x.next].subject} (${x.ps[x.next].label}).` : ''}`;
    return { text: `${today}${wd <= 4 && pub[wd] ? `\nجدول ${WEEK[wd]}: ${listOf(pub[wd])}.` : ''}`, actions: [{ kind: 'link', label: 'الجدول الأسبوعي', href: '#/timetable' }] };
  }
  if (has(t, 'مدرس', 'استاذ', 'ست', 'مربي', 'شعبه', 'صف')) return { text: `${f.first} بـ${f.section}${f.homeroom ? `، ومربي الشعبة ${f.homeroom}` : ''}. إذا تريد توصل رسالة للمدرس، أحوّلها للإدارة وتوصله.`, actions: [{ kind: 'escalate', label: 'حوّل رسالتي للمدرسة' }] };
  return null;
}
// A question the assistant could not settle goes to the administration (and the homeroom teacher).
export function escalate(key, { name, role, studentId, question }) {
  const tk = { id: 't' + Date.now(), key, name, role, studentId: studentId || null, question, ts: now(), status: 'open', replies: [] };
  S.tickets.unshift(tk);
  const st = studentId && student(studentId); const sec = st && section(st.sectionId);
  const t = sec && S.teachers.find(x => x.name === sec.homeroom);
  const n = { kind: 'post', title: `رسالة جديدة من ${name}`, body: `${st ? first(st.name) + ' · ' + sectionShort(st.sectionId) + ' · ' : ''}${question.slice(0, 90)}`, ts: tk.ts, studentId };
  notifyStaff(n); if (t) notify(t.phone, n);
  chatPush(key, { from: 'bot', text: 'وصلت رسالتك للإدارة، وراح يردون عليك هنا وتوصلك إشعار. 🙏', ticket: tk.id });
  log('رسالة إلى المدرسة', `${name} · ${question.slice(0, 60)}`);
  return tk;
}
export function tickets({ sections: secs } = {}) { return S.tickets.filter(t => !secs || (t.studentId && secs.includes(student(t.studentId)?.sectionId))); }
export const openTickets = (scope = {}) => tickets(scope).filter(t => t.status === 'open').length;
export function replyTicket(id, text, by) {
  const tk = S.tickets.find(t => t.id === id); text = String(text || '').trim();
  if (!tk || !text) return { ok: false };
  tk.replies.push({ text, by, ts: now() }); tk.status = 'answered';
  chatPush(tk.key, { from: 'staff', text, by });
  notify(tk.key, { kind: 'post', title: 'رد المدرسة على رسالتك', body: text.slice(0, 100), ts: now(), studentId: tk.studentId });
  log('رد على رسالة', `${tk.name} · ${by}`);
  return { ok: true };
}
export function chatUnread(key) { const c = ASK(key); return c.messages.filter(m => m.from === 'staff' && m.ts > (c.seen || 0)).length; }
export function markChatSeen(key) { const c = ASK(key); if (chatUnread(key)) { c.seen = now(); emit('chat'); } }
export function closeTicket(id) { const tk = S.tickets.find(t => t.id === id); if (tk) { tk.status = 'closed'; emit('chat'); } }

/* ---------------- accounts management (owner only) ---------------- */
export function accounts() {
  const phones = new Set([...OWNERS.map(x => x.phone), ...S.admins.map(x => x.phone), ...S.teachers.map(t => t.phone), ...S.guardians.map(g => g.phone), ...S.students.filter(s => s.phone).map(s => s.phone)]);
  return [...phones].map(phone => ({ phone, roles: rolesFor(phone), disabled: S.disabled.includes(phone), owner: OWNERS.some(o => o.phone === phone) }))
    .sort((a, b) => (b.owner - a.owner) || rank(a) - rank(b));
}
const rank = a => ['owner', 'admin', 'teacher', 'parent', 'student'].indexOf(a.roles[0]?.role);
/* ---------------- teacher access: which sections, and what they may do ----------------
   scope 'all' = every section (new ones too), 'grades' = every section of the chosen grades (new ones too),
   'sections' = only the ticked sections. The section list is kept up to date when sections are added. */
export const TEACHER_PERMS = { att: 'تسجيل الحضور اليدوي والأعذار', posts: 'نشر الواجبات والملازم والفيديو', marks: 'رصد ونشر الدرجات', tt: 'تعديل ونشر الجدول', inbox: 'الرد على رسائل أولياء الأمور', reports: 'التقارير ونتائج الترحيل' };
const ALL_PERMS = () => Object.fromEntries(Object.keys(TEACHER_PERMS).map(k => [k, true]));
function scopeSections(t) { if (t.scope === 'all') return S.sections.map(s => s.id); if (t.scope === 'grades') return S.sections.filter(s => (t.grades || []).includes(s.gradeId)).map(s => s.id); return (t.sections || []).filter(id => section(id)); }
export function syncTeacherScopes() { S.teachers.forEach(t => { if (t.scope === 'all' || t.scope === 'grades') t.sections = scopeSections(t); }); }
export const teacherPerms = id => ({ ...ALL_PERMS(), ...(teacher(id)?.perms || {}) });
export const teacherCan = (id, perm) => !!teacherPerms(id)[perm];
export function teacherScopeText(t) {
  if (!t) return ''; if (t.scope === 'all') return 'كل الشعب';
  if (t.scope === 'grades') return (t.grades || []).map(g => grade(g)?.name).filter(Boolean).join('، ') + ' (كل الشعب)';
  return t.sections.map(sectionShort).join('، ');
}
export function saveAccount({ phone, name, admin, teacher, subject, sections: secs, disabled, scope = 'sections', grades: gIds = [], perms }) {
  phone = normalizePhone(phone);
  const errors = {};
  if (!validPhone(phone)) errors.phone = 'الرقم يجب أن يكون 11 رقماً ويبدأ بـ 07.';
  if (!String(name || '').trim()) errors.name = 'اكتب الاسم.';
  if (teacher && scope === 'grades' && !gIds.length) errors.sections = 'اختر صف واحد على الأقل.';
  if (teacher && scope === 'sections' && (!secs || !secs.length)) errors.sections = 'اختر شعب المدرس.';
  if (!admin && !teacher && !rolesFor(phone).some(r => r.role === 'parent' || r.role === 'student')) errors.roles = 'اختر دوراً واحداً على الأقل.';
  if (OWNERS.some(o => o.phone === phone)) errors.phone = 'حساب الأدمن لا يُعدَّل.';
  if (normalizePhone(session()?.phone || '') === phone && (disabled || !admin) && rolesFor(phone).some(r => r.role === 'admin')) errors.roles = 'ما تكدر توقف حسابك أو تشيل صلاحيتك بنفسك.';
  if (Object.keys(errors).length) return { ok: false, errors };
  name = name.trim();
  const isNew = !rolesFor(phone).length;
  S.admins = S.admins.filter(a => a.phone !== phone); if (admin) S.admins.push({ phone, name });
  let t = S.teachers.find(x => x.phone === phone);
  if (teacher) { if (!t) { t = { id: 't' + (S.teachers.length + 1) + Date.now() % 1000, phone }; S.teachers.push(t); } Object.assign(t, { name, subject: subject || '', scope, grades: scope === 'grades' ? gIds : [], sections: secs || [], perms: perms || ALL_PERMS() }); t.sections = scopeSections(t); }
  else if (t) S.teachers = S.teachers.filter(x => x !== t);
  S.disabled = S.disabled.filter(p => p !== phone); if (disabled) S.disabled.push(phone);
  log(isNew ? 'إنشاء حساب' : 'تعديل صلاحيات', `${name} · ${rolesFor(phone).map(r => r.label).join('، ') || 'بدون دور'}${t && teacher ? ` · الشعب: ${teacherScopeText(t)}${Object.values(t.perms).some(v => !v) ? ` · بدون: ${Object.entries(t.perms).filter(([, v]) => !v).map(([k]) => TEACHER_PERMS[k]).join('، ')}` : ''}` : ''}${disabled ? ' · موقوف' : ''}`);
  emit('accounts');
  return { ok: true };
}
