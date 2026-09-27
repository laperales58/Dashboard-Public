create table if not exists coach_logs (
  id uuid primary key,
  received_at timestamptz not null,
  coach text not null,
  session_date date not null,
  response text not null,
  assistant_draft jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists coach_log_activities (
  id uuid primary key,
  coach_log_id uuid not null references coach_logs(id) on delete cascade,
  row_id text,
  youth_id text,
  youth_name text not null,
  minutes integer not null,
  minutes_source text,
  activity text not null,
  activity_source text,
  activity_modifier text,
  source_clause text,
  source_sentence text,
  created_at timestamptz not null default now()
);

create table if not exists roster_people (
  id text primary key,
  full_name text not null,
  normalized_name text not null unique,
  aliases jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  attendance_count integer not null default 0,
  roster_status text not null default 'auto-added',
  raw_payload jsonb not null default '{}'::jsonb,
  birth_date date,
  age integer,
  address text,
  first_att_date date,
  race_ethnicity text,
  zipcode text,
  school text,
  gender text,
  updated_at timestamptz not null default now()
);

create table if not exists attendance_events (
  id uuid primary key,
  external_id text,
  full_name text not null,
  normalized_name text not null,
  received_at timestamptz not null,
  attendance_date date,
  person_id text,
  class_name text,
  source text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists coach_logs_session_date_idx on coach_logs (session_date);
create index if not exists coach_logs_coach_idx on coach_logs (coach);
create index if not exists coach_log_activities_log_idx on coach_log_activities (coach_log_id);
create index if not exists coach_log_activities_youth_name_idx on coach_log_activities (lower(youth_name));
create index if not exists coach_log_activities_activity_idx on coach_log_activities (activity);
create index if not exists coach_log_activities_modifier_idx on coach_log_activities (activity_modifier);
create index if not exists roster_people_name_idx on roster_people (lower(full_name));
create index if not exists roster_people_last_seen_idx on roster_people (last_seen_at);
create index if not exists roster_people_gender_idx on roster_people (gender);
create index if not exists roster_people_race_ethnicity_idx on roster_people (race_ethnicity);
create index if not exists roster_people_school_idx on roster_people (school);
create index if not exists attendance_events_date_idx on attendance_events (attendance_date);
create index if not exists attendance_events_name_idx on attendance_events (lower(full_name));
create index if not exists attendance_events_person_idx on attendance_events (person_id);

-- Receipt photos uploaded to Grants > Budget > Expenses, read/categorized by the Claude API.
-- See docs/grant-management.md#receipts.
create table if not exists grant_receipts (
  id uuid primary key,
  year integer not null,
  status text not null default 'pending',
  image_data bytea not null,
  image_mime text not null default 'image/jpeg',
  vendor text not null default '',
  receipt_date date,
  amount numeric not null default 0,
  category text not null default '',
  description text not null default '',
  ai_notes text not null default '',
  ai_error text,
  expense_id uuid references grant_expenses(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists grant_receipts_year_idx on grant_receipts (year);
create index if not exists grant_receipts_status_idx on grant_receipts (status);

-- Editable receipt category list (Manage Categories in the UI). Seeded once from
-- DEFAULT_GRANT_EXPENSE_CATEGORIES in server.js when empty; the table is the source of truth
-- after that.
create table if not exists grant_expense_categories (
  id uuid primary key,
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists grant_expense_categories_sort_idx on grant_expense_categories (sort_order);

-- Recent activity rows with coach/date context.
select
  l.session_date,
  l.coach,
  a.youth_name,
  a.minutes,
  a.activity,
  a.activity_modifier
from coach_log_activities a
join coach_logs l on l.id = a.coach_log_id
order by l.session_date desc, l.received_at desc;

-- Minutes by youth.
select
  youth_name,
  sum(minutes) as total_minutes
from coach_log_activities
group by youth_name
order by total_minutes desc;

-- Attendance by day.
select
  attendance_date,
  count(*) as checkins
from attendance_events
group by attendance_date
order by attendance_date desc;

-- Current roster cache.
select
  full_name,
  last_seen_at,
  attendance_count
from roster_people
order by full_name;

-- Logs by coach.
select
  coach,
  count(*) as log_count
from coach_logs
group by coach
order by log_count desc;

-- Focus report.
select
  activity_modifier,
  count(*) as activity_rows,
  sum(minutes) as total_minutes
from coach_log_activities
where activity_modifier <> ''
group by activity_modifier
order by total_minutes desc;

-- Minutes by demographic (gender/race-ethnicity/school), joined by name.
select
  coalesce(nullif(r.gender, ''), 'Unknown') as gender,
  coalesce(nullif(r.race_ethnicity, ''), 'Unknown') as race_ethnicity,
  coalesce(nullif(r.school, ''), 'Unknown') as school,
  count(a.id) as activity_rows,
  sum(a.minutes) as total_minutes
from coach_log_activities a
left join roster_people r on lower(r.full_name) = lower(a.youth_name)
group by gender, race_ethnicity, school
order by total_minutes desc;
