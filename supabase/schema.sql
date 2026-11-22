-- =====================================================================
-- حاضر · قاعدة البيانات على Supabase (PostgreSQL)
-- مصممة لعدد كبير من المدارس والطلاب والملفات:
--   * كل جدول بيه school_id، وكل مدرسة معزولة عن غيرها (Row Level Security).
--   * البصمات بجدول مقسّم شهرياً (partitioned) حتى يبقى سريع بملايين السجلات.
--   * الملفات بـ Supabase Storage (خاصة)، تنفتح بروابط موقّعة ومؤقتة فقط.
--   * سجل العمليات وسجل تعديل الدرجات للإضافة فقط: محد يكدر يعدّل أو يمسح.
-- التشغيل: Supabase → SQL Editor → الصق الملف كامل → Run (مرة وحدة).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- الأنواع ----------
do $$ begin
  create type app_role as enum ('owner', 'admin', 'teacher', 'parent', 'student');
exception when duplicate_object then null; end $$;
do $$ begin
  create type teacher_scope as enum ('all', 'grades', 'sections');
exception when duplicate_object then null; end $$;

-- ---------- المدارس والحسابات ----------
create table if not exists schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 2 and 120),
  settings    jsonb not null default '{}'::jsonb,     -- أوقات الدوام، قواعد الترحيل، حماية المحتوى
  created_at  timestamptz not null default now()
);

-- كل مستخدم بـ Supabase Auth (رقم الهاتف أو اليوزر) له صف هنا
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  school_id   uuid not null references schools(id) on delete cascade,
  phone       text not null check (phone ~ '^07[0-9]{9}$'),
  name        text not null check (length(name) between 2 and 120),
  username    text unique check (username ~ '^[a-z0-9_.]{3,32}$'),
  disabled    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (school_id, phone)
);

create table if not exists user_roles (
  user_id     uuid not null references profiles(id) on delete cascade,
  school_id   uuid not null references schools(id) on delete cascade,
  role        app_role not null,
  primary key (user_id, role)
);

-- ---------- الصفوف والشعب ----------
create table if not exists grades (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  name        text not null,
  short       text not null,
  stage       text,
  ord         int  not null default 0,
  ministerial boolean not null default false,
  unique (school_id, name)
);

create table if not exists sections (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  grade_id    uuid not null references grades(id) on delete cascade,
  name        text not null check (length(name) between 1 and 12),
  room        int,
  homeroom_id uuid references profiles(id) on delete set null,
  unique (grade_id, name)
);

-- ---------- المدرسين وصلاحياتهم ----------
create table if not exists teachers (
  user_id     uuid primary key references profiles(id) on delete cascade,
  school_id   uuid not null references schools(id) on delete cascade,
  subject     text not null default '',
  scope       teacher_scope not null default 'sections',
  grade_ids   uuid[] not null default '{}',
  perms       jsonb not null default '{"att":true,"posts":true,"marks":true,"tt":true,"inbox":true,"reports":true}'::jsonb
);

-- الشعب الفعلية لكل مدرس (تتحدّث تلقائياً لما تنضاف شعبة أو يتغيّر النطاق)
create table if not exists teacher_sections (
  teacher_id  uuid not null references teachers(user_id) on delete cascade,
  section_id  uuid not null references sections(id) on delete cascade,
  school_id   uuid not null references schools(id) on delete cascade,
  primary key (teacher_id, section_id)
);

-- ---------- الطلاب ----------
create table if not exists students (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  section_id    uuid references sections(id) on delete set null,
  no            int  not null,
  device_no     int  not null,
  name          text not null check (length(name) between 5 and 160),
  guardian_id   uuid not null references profiles(id) on delete restrict,
  relation      text,
  user_id       uuid references profiles(id) on delete set null,   -- إذا الطالب عنده رقم ويدخل بنفسه
  face_path     text,                                               -- أول صورة وجه (مرجع دائم)
  since         date not null default current_date,
  graduated_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (school_id, no),
  unique (school_id, device_no)
);

-- ---------- أجهزة البصمة ----------
create table if not exists devices (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  name        text not null,
  protocol    text not null check (protocol in ('adms', 'isup')),
  serial      text not null unique,
  model       text,
  secret_hash text,                     -- السر اللي يرسله الجهاز مع كل بصمة (مخزون مشفّر)
  online      boolean not null default false,
  last_seen   timestamptz
);

-- ---------- البصمات (ضخمة: مقسّمة شهرياً) ----------
create table if not exists attendance_events (
  id          bigint generated always as identity,
  school_id   uuid not null,
  student_id  uuid not null,
  device_id   uuid,
  type        text not null check (type in ('in', 'out')),
  method      text not null default 'بصمة',
  manual_by   uuid,
  ts          timestamptz not null,
  primary key (id, ts)
) partition by range (ts);

-- أقسام شهرية لسنتين دراسيتين (تنضاف أشهر جديدة بالدالة add_attendance_month)
create or replace function add_attendance_month(m date) returns void language plpgsql as $$
declare s date := date_trunc('month', m); e date := (date_trunc('month', m) + interval '1 month')::date;
        n text := 'attendance_events_' || to_char(s, 'YYYY_MM');
begin
  execute format('create table if not exists %I partition of attendance_events for values from (%L) to (%L)', n, s, e);
end $$;
do $$ declare d date := date '2026-08-01'; begin
  while d < date '2028-09-01' loop perform add_attendance_month(d); d := d + interval '1 month'; end loop;
end $$;
create index if not exists att_student_ts on attendance_events (student_id, ts desc);
create index if not exists att_school_ts  on attendance_events (school_id, ts desc);
-- منع تكرار نفس البصمة من الجهاز (نفس الطالب ونفس الثانية ونفس النوع)
create unique index if not exists att_dedupe on attendance_events (student_id, type, ts);

create table if not exists excuses (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  day         date not null,
  reason      text not null check (length(reason) <= 60),
  note        text check (length(note) <= 500),
  by_user     uuid references profiles(id),
  created_at  timestamptz not null default now(),
  unique (student_id, day)
);

create table if not exists holidays (
  school_id   uuid not null references schools(id) on delete cascade,
  day         date not null,
  name        text not null,
  primary key (school_id, day)
);

-- ---------- المنشورات والملفات ----------
create table if not exists posts (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  type        text not null check (type in ('hw', 'ann', 'pdf', 'video')),
  title       text not null check (length(title) between 1 and 200),
  body        text check (length(body) <= 5000),
  audience    text not null default 'all' check (audience in ('all', 'parents')),
  due         text,
  all_school  boolean not null default false,
  author_id   uuid not null references profiles(id),
  file_path   text,           -- school_id/post_id/اسم_الملف داخل bucket school-files
  file_name   text,
  file_type   text check (file_type is null or file_type in ('application/pdf','image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime')),
  file_size   bigint check (file_size is null or file_size <= 314572800),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  edited_by   uuid references profiles(id)
);
create index if not exists posts_school_created on posts (school_id, created_at desc);

create table if not exists post_sections (
  post_id     uuid not null references posts(id) on delete cascade,
  section_id  uuid not null references sections(id) on delete cascade,
  primary key (post_id, section_id)
);
create index if not exists post_sections_section on post_sections (section_id);

create table if not exists post_reads (
  post_id     uuid not null references posts(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ---------- الدرجات ----------
create table if not exists mark_sheets (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  section_id  uuid not null references sections(id) on delete cascade,
  subject     text not null,
  lesson      text not null default '',
  exam_type   text not null check (exam_type in ('daily','quiz','monthly','mid','final','makeup')),
  exam        text not null,
  max         numeric not null check (max > 0 and max <= 1000),
  author_id   uuid not null references profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists sheets_section on mark_sheets (section_id, created_at desc);

create table if not exists mark_scores (
  sheet_id    uuid not null references mark_sheets(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  score       numeric check (score is null or score >= 0),
  primary key (sheet_id, student_id)
);
create index if not exists scores_student on mark_scores (student_id);

-- سجل تعديل الدرجات: دائم، للإضافة فقط (ضد التزوير)
create table if not exists mark_history (
  id          bigint generated always as identity primary key,
  school_id   uuid not null,
  sheet_id    uuid not null,
  student_id  uuid not null,
  old_score   numeric,
  new_score   numeric,
  reason      text not null check (length(reason) between 3 and 300),
  by_user     uuid not null,
  at          timestamptz not null default now()
);

-- ---------- الجدول الأسبوعي ----------
create table if not exists timetables (
  section_id    uuid primary key references sections(id) on delete cascade,
  school_id     uuid not null references schools(id) on delete cascade,
  draft         jsonb not null default '[]'::jsonb,
  published     jsonb,
  published_at  timestamptz,
  published_by  uuid references profiles(id)
);

-- ---------- رسائل أولياء الأمور والإشعارات ----------
create table if not exists tickets (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  author_id   uuid not null references profiles(id) on delete cascade,
  student_id  uuid references students(id) on delete set null,
  question    text not null check (length(question) between 1 and 2000),
  status      text not null default 'open' check (status in ('open','answered','closed')),
  created_at  timestamptz not null default now()
);
create table if not exists ticket_replies (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets(id) on delete cascade,
  school_id   uuid not null,
  by_user     uuid not null references profiles(id),
  body        text not null check (length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create table if not exists notifications (
  id          bigint generated always as identity primary key,
  school_id   uuid not null,
  user_id     uuid not null references profiles(id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  ref         jsonb,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notif_user on notifications (user_id, read, created_at desc);

-- ---------- سجل العمليات (للإضافة فقط) ----------
create table if not exists audit_log (
  id          bigint generated always as identity primary key,
  school_id   uuid not null,
  actor_id    uuid,
  actor_label text,
  action      text not null,
  details     text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_school on audit_log (school_id, created_at desc);

create table if not exists promotions (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  run_by      uuid references profiles(id),
  auto        boolean not null default false,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  undone_at   timestamptz
);

-- =====================================================================
-- دوال الصلاحيات (security definer = تقرأ بدون ما تتأثر بالـ RLS نفسه)
-- =====================================================================
create or replace function my_school() returns uuid language sql stable security definer set search_path = public as $$
  select school_id from profiles where id = auth.uid() and not disabled
$$;
create or replace function has_role(r app_role) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles ur join profiles p on p.id = ur.user_id where ur.user_id = auth.uid() and ur.role = r and not p.disabled)
$$;
create or replace function is_school_admin() returns boolean language sql stable security definer set search_path = public as $$
  select has_role('owner') or has_role('admin')
$$;
create or replace function teacher_can(perm text) returns boolean language sql stable security definer set search_path = public as $$
  select is_school_admin() or coalesce((select (perms ->> perm)::boolean from teachers where user_id = auth.uid()), false)
$$;
create or replace function my_sections() returns setof uuid language sql stable security definer set search_path = public as $$
  select section_id from teacher_sections where teacher_id = auth.uid()
$$;
-- الطلاب اللي يخصّون المستخدم: أولاده (ولي أمر) أو نفسه (طالب)
create or replace function my_students() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from students where guardian_id = auth.uid() or user_id = auth.uid()
$$;
create or replace function can_see_student(sid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from students s where s.id = sid and s.school_id = my_school() and (
    is_school_admin() or s.section_id in (select my_sections()) or s.guardian_id = auth.uid() or s.user_id = auth.uid()))
$$;
create or replace function can_read_post(pid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts p where p.id = pid and p.school_id = my_school() and (
    is_school_admin() or p.author_id = auth.uid()
    or (has_role('teacher') and (p.all_school or exists (select 1 from post_sections ps where ps.post_id = p.id and ps.section_id in (select my_sections()))))
    or ((p.all_school or exists (select 1 from post_sections ps join students s on s.section_id = ps.section_id where ps.post_id = p.id and s.guardian_id = auth.uid())) and has_role('parent'))
    or (p.audience = 'all' and (p.all_school or exists (select 1 from post_sections ps join students s on s.section_id = ps.section_id where ps.post_id = p.id and s.user_id = auth.uid())) and has_role('student'))))
$$;

-- سجل العمليات: الكتابة فقط من خلال هاي الدالة
create or replace function log_action(p_action text, p_details text) returns void language sql security definer set search_path = public as $$
  insert into audit_log (school_id, actor_id, actor_label, action, details)
  select my_school(), auth.uid(), (select name from profiles where id = auth.uid()), left(p_action, 120), left(p_details, 1000)
  where my_school() is not null
$$;

-- تحديث شعب المدرس حسب النطاق
create or replace function sync_teacher_sections(t uuid) returns void language plpgsql security definer set search_path = public as $$
declare tr teachers%rowtype;
begin
  select * into tr from teachers where user_id = t; if not found then return; end if;
  if tr.scope = 'sections' then return; end if;
  delete from teacher_sections where teacher_id = t;
  insert into teacher_sections (teacher_id, section_id, school_id)
  select t, s.id, s.school_id from sections s where s.school_id = tr.school_id and (tr.scope = 'all' or s.grade_id = any (tr.grade_ids));
end $$;
create or replace function trg_section_added() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into teacher_sections (teacher_id, section_id, school_id)
  select user_id, new.id, new.school_id from teachers where school_id = new.school_id and (scope = 'all' or (scope = 'grades' and new.grade_id = any (grade_ids)))
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists section_added on sections;
create trigger section_added after insert on sections for each row execute function trg_section_added();
create or replace function trg_teacher_scope() returns trigger language plpgsql security definer set search_path = public as $$
begin perform sync_teacher_sections(new.user_id); return new; end $$;
drop trigger if exists teacher_scope on teachers;
create trigger teacher_scope after insert or update of scope, grade_ids on teachers for each row execute function trg_teacher_scope();

-- كل تعديل على درجة ينسجل بالسجل الدائم (السبب يجي من الإعداد app.mark_reason)
create or replace function trg_mark_change() returns trigger language plpgsql security definer set search_path = public as $$
declare why text := current_setting('app.mark_reason', true);
begin
  if tg_op = 'UPDATE' and new.score is not distinct from old.score then return new; end if;
  if why is null or length(why) < 3 then raise exception 'تعديل الدرجة يحتاج سبب'; end if;
  insert into mark_history (school_id, sheet_id, student_id, old_score, new_score, reason, by_user)
  select ms.school_id, coalesce(new.sheet_id, old.sheet_id), coalesce(new.student_id, old.student_id),
         case when tg_op = 'INSERT' then null else old.score end, case when tg_op = 'DELETE' then null else new.score end, why, auth.uid()
  from mark_sheets ms where ms.id = coalesce(new.sheet_id, old.sheet_id);
  return coalesce(new, old);
end $$;
drop trigger if exists mark_change on mark_scores;
create trigger mark_change after update or delete on mark_scores for each row execute function trg_mark_change();
-- تعديل درجة بسبب (من الواجهة): select edit_mark(sheet, student, 45, 'تصحيح خطأ بالرصد');
create or replace function edit_mark(p_sheet uuid, p_student uuid, p_score numeric, p_reason text) returns void language plpgsql security invoker as $$
begin
  perform set_config('app.mark_reason', p_reason, true);
  if p_score is null then delete from mark_scores where sheet_id = p_sheet and student_id = p_student;
  else update mark_scores set score = p_score where sheet_id = p_sheet and student_id = p_student; end if;
end $$;

-- =====================================================================
-- Row Level Security: كل جدول مقفول، وما ينفتح إلا بالسياسات تحت
-- =====================================================================
do $$ declare t text; begin
  foreach t in array array['schools','profiles','user_roles','grades','sections','teachers','teacher_sections','students','devices',
    'attendance_events','excuses','holidays','posts','post_sections','post_reads','mark_sheets','mark_scores','mark_history',
    'timetables','tickets','ticket_replies','notifications','audit_log','promotions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- المدرسة
drop policy if exists school_read on schools;      create policy school_read on schools for select using (id = my_school());
drop policy if exists school_admin on schools;     create policy school_admin on schools for update using (id = my_school() and is_school_admin());

-- الحسابات: كل واحد يشوف نفسه، والإدارة تشوف وتدير حسابات مدرستها، والمدرس يشوف أسماء زملائه
drop policy if exists prof_self on profiles;       create policy prof_self on profiles for select using (id = auth.uid() or (school_id = my_school() and (is_school_admin() or has_role('teacher'))));
drop policy if exists prof_admin on profiles;      create policy prof_admin on profiles for all using (school_id = my_school() and is_school_admin()) with check (school_id = my_school());
drop policy if exists roles_read on user_roles;    create policy roles_read on user_roles for select using (user_id = auth.uid() or (school_id = my_school() and is_school_admin()));
drop policy if exists roles_admin on user_roles;   create policy roles_admin on user_roles for all using (school_id = my_school() and is_school_admin() and role <> 'owner') with check (school_id = my_school() and role <> 'owner');

-- الصفوف والشعب: الكل بالمدرسة يقرأ، الإدارة تدير
drop policy if exists grades_read on grades;       create policy grades_read on grades for select using (school_id = my_school());
drop policy if exists grades_admin on grades;      create policy grades_admin on grades for all using (school_id = my_school() and is_school_admin()) with check (school_id = my_school());
drop policy if exists sections_read on sections;   create policy sections_read on sections for select using (school_id = my_school());
drop policy if exists sections_admin on sections;  create policy sections_admin on sections for all using (school_id = my_school() and is_school_admin()) with check (school_id = my_school());

-- المدرسين
drop policy if exists teachers_read on teachers;   create policy teachers_read on teachers for select using (school_id = my_school());
drop policy if exists teachers_admin on teachers;  create policy teachers_admin on teachers for all using (school_id = my_school() and is_school_admin()) with check (school_id = my_school());
drop policy if exists ts_read on teacher_sections; create policy ts_read on teacher_sections for select using (school_id = my_school() and (teacher_id = auth.uid() or is_school_admin()));
drop policy if exists ts_admin on teacher_sections;create policy ts_admin on teacher_sections for all using (school_id = my_school() and is_school_admin()) with check (school_id = my_school());

-- الطلاب: الإدارة الكل، المدرس شعبه، ولي الأمر أولاده، الطالب نفسه
drop policy if exists students_read on students;   create policy students_read on students for select using (can_see_student(id));
drop policy if exists students_admin on students;  create policy students_admin on students for all using (school_id = my_school() and is_school_admin()) with check (school_id = my_school());

-- الأجهزة: الإدارة بس (البصمات تجي من Edge Function بمفتاح الخدمة، مو من المتصفح)
drop policy if exists devices_admin on devices;    create policy devices_admin on devices for all using (school_id = my_school() and is_school_admin()) with check (school_id = my_school());

-- البصمات
drop policy if exists att_read on attendance_events;   create policy att_read on attendance_events for select using (school_id = my_school() and can_see_student(student_id));
drop policy if exists att_manual on attendance_events; create policy att_manual on attendance_events for insert with check (school_id = my_school() and manual_by = auth.uid() and teacher_can('att') and can_see_student(student_id));

-- الأعذار: ولي الأمر لأولاده، والمدرس (بصلاحية) والإدارة
drop policy if exists exc_read on excuses;         create policy exc_read on excuses for select using (school_id = my_school() and can_see_student(student_id));
drop policy if exists exc_write on excuses;        create policy exc_write on excuses for insert with check (school_id = my_school() and by_user = auth.uid() and (student_id in (select my_students()) or (teacher_can('att') and can_see_student(student_id))));

drop policy if exists hol_read on holidays;        create policy hol_read on holidays for select using (school_id = my_school());
drop policy if exists hol_admin on holidays;       create policy hol_admin on holidays for all using (school_id = my_school() and is_school_admin()) with check (school_id = my_school());

-- المنشورات
drop policy if exists posts_read on posts;         create policy posts_read on posts for select using (can_read_post(id));
drop policy if exists posts_insert on posts;       create policy posts_insert on posts for insert with check (school_id = my_school() and author_id = auth.uid() and teacher_can('posts') and (not all_school or is_school_admin()));
drop policy if exists posts_manage on posts;       create policy posts_manage on posts for update using (school_id = my_school() and (is_school_admin() or author_id = auth.uid())) with check (school_id = my_school());
drop policy if exists posts_delete on posts;       create policy posts_delete on posts for delete using (school_id = my_school() and (is_school_admin() or author_id = auth.uid()));
drop policy if exists ps_read on post_sections;    create policy ps_read on post_sections for select using (can_read_post(post_id));
drop policy if exists ps_write on post_sections;   create policy ps_write on post_sections for insert with check (exists (select 1 from posts p where p.id = post_id and (is_school_admin() or (p.author_id = auth.uid() and section_id in (select my_sections())))));
drop policy if exists pr_self on post_reads;       create policy pr_self on post_reads for insert with check (user_id = auth.uid() and can_read_post(post_id));
drop policy if exists pr_read on post_reads;       create policy pr_read on post_reads for select using (user_id = auth.uid() or exists (select 1 from posts p where p.id = post_id and (p.author_id = auth.uid() or is_school_admin())));

-- الدرجات
drop policy if exists sheets_read on mark_sheets;  create policy sheets_read on mark_sheets for select using (school_id = my_school() and (is_school_admin() or section_id in (select my_sections()) or exists (select 1 from students s where s.section_id = mark_sheets.section_id and s.id in (select my_students()))));
drop policy if exists sheets_write on mark_sheets; create policy sheets_write on mark_sheets for insert with check (school_id = my_school() and author_id = auth.uid() and teacher_can('marks') and (is_school_admin() or section_id in (select my_sections())));
drop policy if exists scores_read on mark_scores;  create policy scores_read on mark_scores for select using (can_see_student(student_id) and (student_id in (select my_students()) or is_school_admin() or has_role('teacher')));
drop policy if exists scores_write on mark_scores; create policy scores_write on mark_scores for all using (teacher_can('marks') and exists (select 1 from mark_sheets ms where ms.id = sheet_id and ms.school_id = my_school() and (is_school_admin() or ms.section_id in (select my_sections())))) with check (teacher_can('marks'));
drop policy if exists hist_read on mark_history;   create policy hist_read on mark_history for select using (school_id = my_school() and (is_school_admin() or has_role('teacher') or student_id in (select my_students())));
-- (ماكو سياسة insert/update/delete على mark_history: الكتابة من الـ trigger فقط)

-- الجدول: الكل يقرأ المنشور، المدرس (بصلاحية) والإدارة يعدّلون المسودة
drop policy if exists tt_read on timetables;       create policy tt_read on timetables for select using (school_id = my_school());
drop policy if exists tt_write on timetables;      create policy tt_write on timetables for all using (school_id = my_school() and teacher_can('tt') and (is_school_admin() or section_id in (select my_sections()))) with check (school_id = my_school());

-- الرسائل
drop policy if exists tk_read on tickets;          create policy tk_read on tickets for select using (school_id = my_school() and (author_id = auth.uid() or is_school_admin() or (teacher_can('inbox') and can_see_student(student_id))));
drop policy if exists tk_new on tickets;           create policy tk_new on tickets for insert with check (school_id = my_school() and author_id = auth.uid() and (student_id is null or student_id in (select my_students())));
drop policy if exists tk_status on tickets;        create policy tk_status on tickets for update using (school_id = my_school() and (is_school_admin() or (teacher_can('inbox') and can_see_student(student_id))));
drop policy if exists tr_read on ticket_replies;   create policy tr_read on ticket_replies for select using (exists (select 1 from tickets t where t.id = ticket_id));
drop policy if exists tr_new on ticket_replies;    create policy tr_new on ticket_replies for insert with check (by_user = auth.uid() and school_id = my_school() and exists (select 1 from tickets t where t.id = ticket_id and (is_school_admin() or teacher_can('inbox'))));

-- الإشعارات: كل واحد إشعاراته بس
drop policy if exists notif_own on notifications;  create policy notif_own on notifications for select using (user_id = auth.uid());
drop policy if exists notif_read on notifications; create policy notif_read on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- سجل العمليات: الإدارة تقرأ بس، والكتابة عن طريق log_action()
drop policy if exists audit_read on audit_log;     create policy audit_read on audit_log for select using (school_id = my_school() and is_school_admin());

drop policy if exists promo_read on promotions;    create policy promo_read on promotions for select using (school_id = my_school() and (is_school_admin() or teacher_can('reports')));
drop policy if exists promo_admin on promotions;   create policy promo_admin on promotions for all using (school_id = my_school() and is_school_admin()) with check (school_id = my_school());

-- =====================================================================
-- الملفات: bucket خاص، حجم أقصى 300MB، أنواع محددة، والقراءة بس لمن يحق له يشوف المنشور
-- مسار الملف: <school_id>/<post_id>/<اسم الملف>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-files', 'school-files', false, 314572800,
        array['application/pdf','image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists files_read on storage.objects;
create policy files_read on storage.objects for select using (
  bucket_id = 'school-files' and (storage.foldername(name))[1] = my_school()::text
  and can_read_post(((storage.foldername(name))[2])::uuid));
drop policy if exists files_write on storage.objects;
create policy files_write on storage.objects for insert with check (
  bucket_id = 'school-files' and (storage.foldername(name))[1] = my_school()::text and teacher_can('posts'));
drop policy if exists files_delete on storage.objects;
create policy files_delete on storage.objects for delete using (
  bucket_id = 'school-files' and (storage.foldername(name))[1] = my_school()::text
  and exists (select 1 from posts p where p.id = ((storage.foldername(name))[2])::uuid and (p.author_id = auth.uid() or is_school_admin())));

-- صور الوجوه: bucket منفصل، الإدارة بس
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faces', 'faces', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false;
drop policy if exists faces_admin on storage.objects;
create policy faces_admin on storage.objects for all using (bucket_id = 'faces' and (storage.foldername(name))[1] = my_school()::text and is_school_admin())
  with check (bucket_id = 'faces' and (storage.foldername(name))[1] = my_school()::text and is_school_admin());

-- لا أحد غير مسجّل دخول يوصل لأي جدول
revoke all on all tables in schema public from anon;

-- =====================================================================
-- تقوية إضافية (مطبّقة على مشروع hader): دوال الصلاحيات بـ schema خاص ما ينكشف بالـ API
-- =====================================================================
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.my_school() set schema private;
alter function public.has_role(app_role) set schema private;
alter function public.is_school_admin() set schema private;
alter function public.teacher_can(text) set schema private;
alter function public.my_sections() set schema private;
alter function public.my_students() set schema private;
alter function public.can_see_student(uuid) set schema private;
alter function public.can_read_post(uuid) set schema private;
alter function public.sync_teacher_sections(uuid) set schema private;
alter function public.trg_section_added() set schema private;
alter function public.trg_teacher_scope() set schema private;
alter function public.trg_mark_change() set schema private;
alter function public.add_attendance_month(date) set schema private;
do $$ declare f text; begin
  foreach f in array array['private.my_school()','private.has_role(app_role)','private.is_school_admin()','private.teacher_can(text)',
    'private.my_sections()','private.my_students()','private.can_see_student(uuid)','private.can_read_post(uuid)',
    'private.sync_teacher_sections(uuid)','private.trg_section_added()','private.trg_teacher_scope()','private.trg_mark_change()','private.add_attendance_month(date)'] loop
    execute format('alter function %s set search_path = public, private', f);
    execute format('revoke all on function %s from public, anon', f);
  end loop;
end $$;
grant execute on function private.my_school(), private.has_role(app_role), private.is_school_admin(), private.teacher_can(text),
  private.my_sections(), private.my_students(), private.can_see_student(uuid), private.can_read_post(uuid) to authenticated;
alter function public.log_action(text, text) set search_path = public, private;
revoke all on function public.log_action(text, text) from public, anon;
grant execute on function public.log_action(text, text) to authenticated;
revoke all on function public.edit_mark(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.edit_mark(uuid, uuid, numeric, text) to authenticated;
do $$ declare r record; begin
  for r in select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'public.attendance_events'::regclass loop
    execute format('revoke all on public.%I from anon, authenticated', r.relname);
  end loop;
end $$;
