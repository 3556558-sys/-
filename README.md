# NDP Proxy — שרת ביניים לנדרים פלוס (Netlify)

שרת קטן (Netlify Function) שמטרתו לעקוף את חסימת ה-CORS של נדרים פלוס,
כדי שאתר ניהול בית הכנסת יוכל להתחבר אליהם.

## פריסה (Deploy) — שלב אחר שלב

### 1. יצירת ריפו ב-GitHub
אם כבר יש לך ריפו מהניסיון הקודם (Vercel) — אפשר להשתמש בו, רק תמחק את
התיקייה `api` ותעלה במקומה את התיקיות והקבצים מהזיפ הזה (`netlify`, `netlify.toml`, `package.json`).

אם אתה מתחיל מאפס:
1. כנס ל-https://github.com/new וצור ריפו חדש
2. לחץ "uploading an existing file" / "העלאת קובץ קיים"
3. גרור לשם את כל התוכן מהזיפ הזה (כולל תיקיית `netlify/functions`)
4. Commit changes

### 2. חיבור ל-Netlify
1. כנס ל-https://app.netlify.com
2. הירשם/התחבר עם **GitHub** (לא צריך אימות טלפון בדרך כלל)
3. לחץ "Add new site" → "Import an existing project"
4. בחר "Deploy with GitHub" ואשר את ההרשאות
5. בחר את הריפו שלך מהרשימה
6. השאר את ההגדרות כברירת מחדל ולחץ "Deploy"
7. תוך דקה תקבל כתובת כמו: `https://random-name-12345.netlify.app`

### 3. כתובת ה-API שלך
```
https://random-name-12345.netlify.app/.netlify/functions/nedarim
```

⚠️ שים לב: אצל Netlify הנתיב הוא `/.netlify/functions/nedarim` ולא `/api/nedarim` כמו ב-Vercel.

שלח לי את הכתובת המלאה שקיבלת ואני אעדכן את הקוד באתר שלך.

## בדיקה מהירה
אחרי הפריסה, אפשר לבדוק שהשרת חי על ידי כניסה לכתובת:
```
https://random-name-12345.netlify.app/.netlify/functions/nedarim
```
(בדפדפן רגיל — אמורה לחזור שגיאת "רק בקשות POST מותרות", זה תקין וסימן שהפונקציה פעילה)

## אבטחה
- מספר הקופה והסיסמה עוברים דרך השרת אך לא נשמרים בו.
- מומלץ בעתיד להגביל את `Access-Control-Allow-Origin` בקובץ `netlify/functions/nedarim.js` לדומיין של האתר שלך בלבד.
