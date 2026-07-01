# הגדרת שידור חוזר אוטומטי + התחברות במייל (Supabase + Netlify)

זה המדריך להפעלת התכונות החדשות: שידור חוזר אוטומטי על סירובי הוראות קבע (פועל
ברקע גם כשהדפדפן סגור) והתחברות לאתר עם קישור למייל.

## למה צריך את זה?

האתר הוא קובץ HTML סטטי — אין לו שרת שרץ ברציפות. כדי ש"נסה לחייב שוב בעוד 3
ימים" יקרה **באמת**, גם כשאף אחד לא פתוח באתר, צריך שרת אמיתי שרץ לפי לוח זמנים.
זה מה ש-Supabase (מסד נתונים + התחברות) ביחד עם Netlify Scheduled Functions (קוד
שרץ אוטומטית כל יום) עושים כאן.

## שלב 1 — יצירת פרויקט Supabase (חינמי)

1. כנס ל-**https://supabase.com** ולחץ **"Start your project"**
2. הירשם (אפשר עם GitHub)
3. לחץ **"New project"**
   - תן שם לפרויקט (למשל `shul-management`)
   - בחר סיסמה למסד הנתונים ושמור אותה במקום בטוח
   - בחר אזור קרוב (Europe West למשל)
   - לחץ **"Create new project"** (לוקח כ-2 דקות להקמה)

## שלב 2 — הרצת הסכמה (טבלאות) במסד הנתונים

1. בתפריט הצד של Supabase, לחץ **"SQL Editor"**
2. לחץ **"New query"**
3. פתח את הקובץ `supabase-schema.sql` שבזיפ הזה, העתק את **כל** התוכן, הדבק בעורך
4. לחץ **"Run"** (או Ctrl+Enter)
5. אמור להופיע "Success. No rows returned" — זה תקין, זה אומר שהטבלאות נוצרו

## שלב 3 — הפעלת התחברות במייל

1. בתפריט הצד, לחץ **"Authentication"** → **"Providers"**
2. ודא ש-**"Email"** מופעל (כברירת מחדל הוא כבר פעיל)
3. לחץ **"Authentication"** → **"URL Configuration"**
4. ב-**"Site URL"**, הכנס את כתובת האתר שלך (זו שמעלים אליה את ה-HTML, למשל
   `https://famous-blancmange-xxxxx.netlify.app`)
5. ב-**"Redirect URLs"**, הוסף את אותה כתובת

## שלב 4 — איסוף המפתחות (Keys)

1. לחץ על **"Project Settings"** (גלגל שיניים) → **"API"**
2. תמצא שם 3 ערכים שצריך:
   - **Project URL** (נראה כמו `https://xxxxx.supabase.co`)
   - **anon public key** (מפתח ארוך שמתחיל ב-`eyJ...`)
   - **service_role key** (מפתח ארוך נוסף — **סודי, אסור לחשוף בצד לקוח!**)

שמור את שלושתם זמנית — נצטרך אותם בשני מקומות: בקוד האתר ובהגדרות Netlify.

## שלב 5 — עדכון קוד האתר (nisul-beit-knesset.html)

בקובץ ה-HTML של האתר, חפש:
```js
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
```
והחלף ל:
```js
const SUPABASE_URL = 'הProject URL שהעתקת';
const SUPABASE_ANON_KEY = 'הanon public key שהעתקת';
```

⚠️ **חשוב:** רק את ה-`anon` key מכניסים לקובץ האתר! **לעולם לא** את ה-`service_role` key — הוא נכנס רק ל-Netlify (שלב הבא), כי הוא נותן גישה מלאה למסד הנתונים בלי הגבלות.

## שלב 6 — העלאת קבצי השרת לריפו ב-GitHub

מהזיפ הזה, העלה לריפו הקיים שלך (אותו ריפו עם `netlify/functions/nedarim.js`):
- `netlify/functions/retry-failed-charges.js`
- `netlify/functions/retry-settings.js`
- `netlify/functions/auth-send-link.js`
- `netlify.toml` (יחליף את הקיים — הוסיף תזמון)
- `package.json` (יחליף את הקיים — הוסיף תלות ב-Supabase)

## שלב 7 — הגדרת משתני סביבה ב-Netlify

1. כנס ל-**app.netlify.com**, פתח את אתר ה-proxy שלך (`velvety-ganache-...`)
2. לחץ **"Site configuration"** → **"Environment variables"**
3. לחץ **"Add a variable"** והוסף את שלושת המשתנים הבאים, אחד בכל פעם:

| Key | Value |
|---|---|
| `SUPABASE_URL` | ה-Project URL מ-Supabase |
| `SUPABASE_ANON_KEY` | ה-anon public key מ-Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ה-service_role key מ-Supabase (הסודי!) |
| `SITE_URL` | כתובת האתר שלך (אותה כתובת משלב 3) |

4. אחרי הוספת המשתנים, לך ל-**"Deploys"** ולחץ **"Trigger deploy"** → **"Deploy site"** כדי שהשינויים ייכנסו לתוקף

## שלב 8 — בדיקה

1. פתח את האתר, במסך הכניסה לחץ על הטאב **"✉️ קישור למייל"**
2. הכנס את המייל שלך ולחץ **"שלח קישור התחברות"**
3. אמור להגיע מייל מ-Supabase תוך דקה — לחץ על הקישור בו
4. תוחזר לאתר כשאתה מחובר אוטומטית
5. כנס ללשונית "נדרים פלוס" → התחבר → בכרטיס "שידור חוזר אוטומטי על סירובים", הגדר את ההעדפות שלך ולחץ "שמור הגדרות שרת"
6. השרת ירוץ אוטומטית כל יום ב-06:00 UTC ויבדוק סירובים

## בדיקה ידנית של הפונקציה המתוזמנת (לפני שמחכים ליום הבא)

ב-Netlify, תחת **"Functions"**, תמצא את `retry-failed-charges` — אפשר ללחוץ
עליה ולהריץ ידנית כדי לוודא שהיא עובדת, בלי לחכות לשעה הקבועה.

## הערות אבטחה חשובות

- סיסמת ה-API של נדרים פלוס נשמרת במסד הנתונים של Supabase, מוגנת ע"י RLS
  (Row Level Security) — רק משתמשים מחוברים יכולים לגשת אליה.
- מומלץ בעתיד להצפין את הסיסמה בפועל (Supabase Vault), לא רק להסתמך על RLS.
- אל תשתף את ה-`service_role key` עם אף אחד ואל תכניס אותו לקוד שרץ בדפדפן.
