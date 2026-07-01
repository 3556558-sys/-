-- ============================================================
-- סכמת מסד נתונים ל-Supabase — מערכת ניהול בית הכנסת
-- שידור חוזר אוטומטי על סירובי הוראות קבע
-- ============================================================
-- העתק את כל הקובץ הזה והרץ אותו ב-Supabase: SQL Editor → New Query → הדבק → Run

-- טבלת הגדרות שידור חוזר (לכל מוסד נדרים פלוס)
create table if not exists retry_settings (
  id uuid primary key default gen_random_uuid(),
  mosad_number text not null unique,
  api_password text not null,           -- מוצפן ע"י Supabase Vault בעתיד; כרגע טקסט (ראה הערת אבטחה ב-README)
  retry_enabled boolean default true,
  retry_mode text default 'days',       -- 'days' (X ימים אחרי הסירוב) | 'date' (תאריך קבוע בחודש)
  retry_after_days int default 3,       -- כאשר retry_mode='days'
  retry_on_day_of_month int,            -- כאשר retry_mode='date' (1-28)
  max_attempts int default 3,
  notify_email text,                    -- מייל לדיווח על תוצאות שידור חוזר
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- טבלת מעקב סירובים ותוצאות שידור חוזר
create table if not exists keva_retry_log (
  id uuid primary key default gen_random_uuid(),
  mosad_number text not null,
  keva_id text not null,                -- מזהה הוראת הקבע בנדרים פלוס
  client_name text,
  amount numeric,
  original_fail_date date,
  attempt_number int default 0,
  last_attempt_date timestamptz,
  last_attempt_result text,             -- 'pending' | 'success' | 'failed' | 'max_attempts_reached'
  last_error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_retry_log_mosad on keva_retry_log(mosad_number);
create index if not exists idx_retry_log_status on keva_retry_log(last_attempt_result);

-- טבלת מיילים מורשים להתחברות (Magic Link) — רק מיילים ברשימה הזו יוכלו לקבל קישור התחברות
create table if not exists allowed_emails (
  email text primary key,        -- נשמר תמיד באותיות קטנות (lower-case)
  label text,                    -- שם/הערה לזיהוי (אופציונלי), למשל "גבאי ראשי"
  tabs text[] default null,      -- אילו לשוניות מותר למייל הזה לראות באתר.
                                  -- NULL = גישה מלאה לכל הלשוניות (ברירת מחדל, גם לרשומות ישנות).
                                  -- מערך ריק {} = אין גישה לאף לשונית.
                                  -- ערכים אפשריים: community, orders, suppliers, display, alerts, nedarim, finance
  added_at timestamptz default now()
);

-- אם הטבלה כבר קיימת מגרסה קודמת בלי עמודת tabs — מוסיף אותה בבטחה (לא יזיק אם כבר קיימת)
alter table allowed_emails add column if not exists tabs text[] default null;

-- RLS (Row Level Security) — בסיסי, מאפשר גישה רק למשתמשים מאומתים
alter table retry_settings enable row level security;
alter table keva_retry_log enable row level security;
alter table allowed_emails enable row level security;

create policy "allow authenticated read retry_settings" on retry_settings
  for select using (auth.role() = 'authenticated');
create policy "allow authenticated write retry_settings" on retry_settings
  for all using (auth.role() = 'authenticated');

create policy "allow authenticated read keva_retry_log" on keva_retry_log
  for select using (auth.role() = 'authenticated');
create policy "allow authenticated write keva_retry_log" on keva_retry_log
  for all using (auth.role() = 'authenticated');

-- anon (לא מחובר) יכול רק *לקרוא* את הרשימה — כדי שפונקציית שליחת הקישור תוכל לבדוק האם המייל מורשה
-- לפני שמשתמש כלשהו מתחבר בפעם הראשונה, וכדי שמשתמש שכבר התחבר יוכל לקרוא אילו לשוניות מותרות לו.
-- שינוי (הוספה/עדכון/מחיקה) מותר רק למשתמש שכבר מאומת.
create policy "allow anon read allowed_emails" on allowed_emails
  for select using (true);
create policy "allow authenticated write allowed_emails" on allowed_emails
  for insert with check (auth.role() = 'authenticated');
create policy "allow authenticated update allowed_emails" on allowed_emails
  for update using (auth.role() = 'authenticated');
create policy "allow authenticated delete allowed_emails" on allowed_emails
  for delete using (auth.role() = 'authenticated');

-- ⚠️ חשוב: אחרי הרצת הסכמה הזו, הוסף את המייל הראשון שלך (המנהל) ידנית כדי שתוכל
-- להתחבר בפעם הראשונה ולפתוח את מסך ניהול המיילים המורשים באתר. החלף את הכתובת למייל שלך:
-- (tabs לא מצוין = גישה מלאה, מומלץ למנהל הראשי)
-- insert into allowed_emails (email, label) values ('your-email@example.com', 'מנהל ראשי');

-- ============================================================
-- תרומות חד-פעמיות + תזכורת אוטומטית לפנייה חוזרת לתורם
-- ============================================================
create table if not exists donor_reminders (
  id uuid primary key default gen_random_uuid(),
  donor_name text not null,
  amount numeric,                  -- כמה התורם שילם
  paid_date date,                  -- באיזה תאריך שולם
  remind_date date not null,       -- מתי לשלוח תזכורת לבקש שוב
  notify_emails text[] not null,   -- עד 2 מיילים שיקבלו את התזכורת
  note text,                       -- הערה חופשית (אופציונלי)
  status text default 'pending',   -- 'pending' | 'sent'
  created_at timestamptz default now(),
  sent_at timestamptz
);

create index if not exists idx_donor_reminders_status_date on donor_reminders(status, remind_date);

alter table donor_reminders enable row level security;

create policy "allow authenticated read donor_reminders" on donor_reminders
  for select using (auth.role() = 'authenticated');
create policy "allow authenticated write donor_reminders" on donor_reminders
  for all using (auth.role() = 'authenticated');

-- ============================================================
-- קו טלפוני ימות המשיח — מכירות ציבור + רישום הוצאות ע"י גבאים
-- ============================================================
-- טבלת key/value כללית — משמשת גם לאחסון קבוע (קטלוג מכירות, רשימת גבאים, PIN)
-- וגם לאחסון זמני בין שלבי שיחה (למשל סכום שהוקש בשלב א', עד שממשיכים לשלב ב')
create table if not exists ivr_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

alter table ivr_kv enable row level security;

-- הפונקציה בצד השרת (netlify) משתמשת ב-SERVICE_ROLE_KEY ולכן עוקפת RLS לגמרי —
-- זה חשוב כי ימות המשיח קורא לפונקציה הזו ישירות (ללא accessToken של משתמש מחובר).
-- בכל זאת, למשתמש מאומת באתר (המנהל) יש גישה ישירה לצפייה/עדכון גם דרך הדפדפן אם צריך:
create policy "allow authenticated all ivr_kv" on ivr_kv
  for all using (auth.role() = 'authenticated');
