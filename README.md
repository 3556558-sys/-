# NDP Proxy — שרת ביניים לנדרים פלוס

שרת קטן (Vercel Serverless Function) שמטרתו לעקוף את חסימת ה-CORS של נדרים פלוס,
כדי שאתר ניהול בית הכנסת יוכל להתחבר אליהם ישירות מהדפדפן.

## איך זה עובד

```
הדפדפן שלך  →  השרת הזה (Vercel)  →  נדרים פלוס  →  השרת הזה  →  הדפדפן שלך
```

הדפדפן לא יכול לדבר ישירות עם נדרים פלוס (הם חוסמים CORS), אבל שרת-לשרת
אין שום בעיה. ה-proxy הזה פשוט "מעביר" את הבקשה והתשובה.

## פריסה (Deploy) — שלב אחר שלב

### 1. יצירת ריפו ב-GitHub
1. כנס ל-https://github.com/new
2. תן שם לריפו, למשל `ndp-proxy`
3. צור אותו (לא חובה Public — אפשר גם Private)
4. העלה אליו את כל הקבצים מהתיקייה הזו (גרור ל-GitHub או דרך git):

```bash
cd ndp-proxy
git init
git add .
git commit -m "NDP proxy server"
git branch -M main
git remote add origin https://github.com/USERNAME/ndp-proxy.git
git push -u origin main
```

### 2. חיבור ל-Vercel
1. כנס ל-https://vercel.com והתחבר עם GitHub
2. לחץ "Add New Project"
3. בחר את הריפו `ndp-proxy`
4. השאר את כל ההגדרות כברירת מחדל ולחץ "Deploy"
5. תוך כדקה תקבל URL כמו: `https://ndp-proxy-xxxx.vercel.app`

### 3. עדכון הקוד באתר שלך
כתובת ה-API שלך תהיה:
```
https://ndp-proxy-xxxx.vercel.app/api/nedarim
```

צריך להחליף בקובץ `nisul-beit-knesset.html` את הקריאה הישירה לנדרים פלוס
בקריאה דרך ה-proxy (שלח לי את כתובת ה-Vercel שתקבל ואני אעדכן את הקוד באתר).

## בדיקה מקומית (אופציונלי)

אם יש לך Node.js מותקן ורוצה לבדוק לפני הפריסה:

```bash
npm install -g vercel
vercel dev
```

זה ירוץ על `http://localhost:3000/api/nedarim`

## אבטחה — חשוב לדעת

- מספר הקופה והסיסמה **עוברים דרך השרת** אבל **לא נשמרים** בו — הם רק "עוברים דרכו" לכיוון נדרים פלוס ולא מאוחסנים בשום מקום.
- מומלץ בעתיד להגביל את `Access-Control-Allow-Origin` בקובץ `api/nedarim.js` לדומיין של האתר שלך בלבד (במקום `*`), כדי שאף אחד אחר לא יוכל להשתמש בשרת שלך.
- כדאי לשקול הגבלת קצב בקשות (rate limiting) אם תרצה הגנה נוספת.
