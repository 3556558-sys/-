// netlify/functions/ivr.js — קו טלפוני ימות המשיח לבית הכנסת
// גרסה מותאמת מ"ועד בית IVR" — אותה לוגיקה, אחסון ב-Supabase במקום Redis
//
// ═══════════════════════════════════════════════════════════════
// מבנה שלוחות מדויק בימות המשיח (המספרים בפועל אתה בוחר/יוצר בחשבון שלך —
// מה שחשוב הוא שה-step בכל שלוחת type=api יתאים בדיוק למה שכתוב כאן.
// כל שלוחה עם "(לולאה עצמית)" קוראת לעצמה פעמיים: פעם ראשונה בלי הקשה (מבקשת קלט),
// פעם שנייה עם ApiDig מלא (מעבדת ומתקדמת) — בדיוק כמו api_add_0 חוזר על עצמו.
// ═══════════════════════════════════════════════════════════════
//   /2            → type=api, step=menu           (זיהוי מתקשר: גבאי או ציבור, בלי קריאת ספרות)
//   /2/9          → type=menu עם קובץ TTS/הקלטה (תפריט ציבור: 1=רכישה 2=הודעה)
//   /2/9/1        → type=api, step=sales_pick      (לולאה עצמית: השמעת קטלוג → בחירת מוצר)
//   /2/9/1/1      → type=api, step=sales_qty       (לולאה עצמית: כמות)
//   /2/9/1/2      → type=api, step=sales_confirm   (לולאה עצמית: אישור/ביטול + שמירה)
//   /2/9/2        → type=api, step=announcement    (השמעת הודעה, בלי קריאת ספרות)
//
//   /2/7          → type=api, step=gabbai_pin      (לולאה עצמית: בקשת קוד PIN)
//   /2/7/1        → type=menu עם קובץ TTS/הקלטה (תפריט גבאים: 1=הוצאה 2=הוצאות אחרונות 3=מכירה במזומן 4=סטטוס היום)
//   /2/7/1/1      → type=api, step=gx_amount       (לולאה עצמית: סכום ההוצאה)
//   /2/7/1/1/1    → type=menu (6 אפשרויות קטגוריה) — כל ספרה מפנה לשלוחת-בת קטנה משלה:
//                    /2/7/1/1/1/1 type=api step=gx_cat api_add_1=cat=1  (כיבוד)
//                    /2/7/1/1/1/2 type=api step=gx_cat api_add_1=cat=2  (שכר)
//                    /2/7/1/1/1/3 type=api step=gx_cat api_add_1=cat=3  (חשמל/מים)
//                    /2/7/1/1/1/4 type=api step=gx_cat api_add_1=cat=4  (אחזקה)
//                    /2/7/1/1/1/5 type=api step=gx_cat api_add_1=cat=5  (ציוד)
//                    /2/7/1/1/1/6 type=api step=gx_cat api_add_1=cat=6  (אחר)
//   /2/7/1/1/2    → type=api, step=gx_date         (לולאה עצמית: תאריך + שמירה סופית)
//   /2/7/2        → type=api, step=gx_recent       (5 הוצאות אחרונות — נכתב כ-TTS ומפנה ל-/2/7/2/1, בלי קריאת ספרות)
//   /2/7/3        → type=api, step=cs_amount       (לולאה עצמית: מכירה במזומן — סכום + שמירה)
//   /2/7/4        → type=api, step=sales_today     (השמעת סיכום, בלי קריאת ספרות)
//
// כל שלוחת type=api חייבת לכלול api_add_0=step=<שם השלב> שמצוין למעלה.
// ═══════════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

const SECRET = process.env.IVR_API_SECRET || 'change-me';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ─── Supabase KV helpers (מקבילים ל-kvGet/kvSet של הדוגמה, רק ב-Supabase) ──
async function kvGet(key) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('ivr_kv').select('value').eq('key', key).maybeSingle();
    if (error || !data) return null;
    return data.value;
  } catch (e) { return null; }
}
async function kvSet(key, value) {
  try {
    const supabase = getSupabase();
    await supabase.from('ivr_kv').upsert({ key, value, updated_at: new Date().toISOString() });
  } catch (e) { /* ignore */ }
}
async function kvDel(key) {
  try {
    const supabase = getSupabase();
    await supabase.from('ivr_kv').delete().eq('key', key);
  } catch (e) { /* ignore */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function cleanText(text) {
  return String(text || '').replace(/[&=\"'<>]/g, ' ').replace(/\s+/g, ' ').trim();
}
function normalizePhone(phone) {
  phone = String(phone || '').replace(/\D/g, '');
  if (phone.startsWith('972')) phone = '0' + phone.slice(3);
  return phone;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function ddmmyyyyToISO(digits) {
  if (!digits || digits.length !== 8) return todayISO();
  const d = digits.slice(0, 2), m = digits.slice(2, 4), y = digits.slice(4, 8);
  return `${y}-${m}-${d}`;
}
function sortByDateDesc(arr) {
  return arr.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

// ─── Yemot API — כתיבת קובץ TTS (להשמעת רשימות ארוכות, כמו בדוגמה) ─────────
// מעדיף את הטוקן שהוגדר באתר (ivr:yemot_token), ונופל חזרה למשתנה הסביבה YEMOT_TOKEN אם לא הוגדר
async function yemotWriteTTS(path, text) {
  try {
    const token = (await kvGet('ivr:yemot_token')) || process.env.YEMOT_TOKEN || '';
    if (!token) return false;
    const apiUrl = 'https://www.call2all.co.il/ym/api/UploadTextFile';
    const body = 'token=' + encodeURIComponent(token) +
                 '&what=ivr2:' + encodeURIComponent(path) +
                 '&contents=' + encodeURIComponent(text);
    const r = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json();
    return j.responseStatus === 'OK';
  } catch (e) { return false; }
}

const CATEGORY_NAMES = { '1': 'כיבוד', '2': 'שכר', '3': 'חשמל/מים', '4': 'אחזקה', '5': 'ציוד', '6': 'אחר' };

// מחשב את מחיר היחידה בפועל למתקשר — מוריד הנחה אם המוצר נמכר לפי קילו והמתקשר מזוהה
// כתורם קבוע זכאי (נבדק מראש מול נדרים פלוס ע"י האתר, ונשמר ב-ivr:discount_eligible_phones)
async function priceForCaller(product, phone) {
  const basePrice = product.price || 0;
  if (product.unit !== 'kg') return { unitPrice: basePrice, discounted: false };
  const eligiblePhones = (await kvGet('ivr:discount_eligible_phones')) || [];
  if (!eligiblePhones.includes(phone)) return { unitPrice: basePrice, discounted: false };
  const rule = (await kvGet('ivr:discount_rule')) || { amount: 2 };
  const discounted = Math.max(0, basePrice - (rule.amount || 0));
  return { unitPrice: discounted, discounted: true };
}

function textResponse(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-store' },
    body,
  };
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // ── POST: עדכון הגדרות מהאתר (קטלוג מכירות, רשימת גבאים, PIN, הודעה) ────
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      if ((body.secret || '') !== SECRET) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      if (body.products !== undefined) await kvSet('ivr:sales_products', body.products);
      if (body.gabbaiPhones !== undefined) await kvSet('ivr:gabbai_phones', body.gabbaiPhones.map(normalizePhone));
      if (body.pin !== undefined) await kvSet('ivr:pin', String(body.pin));
      if (body.yemotToken !== undefined) await kvSet('ivr:yemot_token', String(body.yemotToken));
      if (body.announcement !== undefined) await kvSet('ivr:announcement', body.announcement);
      if (body.discountRule !== undefined) await kvSet('ivr:discount_rule', body.discountRule);
      if (body.discountEligiblePhones !== undefined) await kvSet('ivr:discount_eligible_phones', body.discountEligiblePhones.map(normalizePhone));
      if (body.action === 'clear') {
        await kvSet('ivr:sales_orders', []);
        await kvSet('ivr:expenses', []);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  const q = event.queryStringParameters || {};

  // ── GET: שליפת נתונים לאתר (מכירות + הוצאות שנרשמו בטלפון) ──────────────
  if (q.step === 'get_ivr_data') {
    if ((q.secret || '') !== SECRET) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    const sales = (await kvGet('ivr:sales_orders')) || [];
    const expenses = (await kvGet('ivr:expenses')) || [];
    return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ sales, expenses }) };
  }
  if (q.step === 'get_ivr_config') {
    if ((q.secret || '') !== SECRET) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    const products = (await kvGet('ivr:sales_products')) || [];
    const gabbaiPhones = (await kvGet('ivr:gabbai_phones')) || [];
    const pin = (await kvGet('ivr:pin')) || '';
    const yemotToken = (await kvGet('ivr:yemot_token')) || '';
    const announcement = (await kvGet('ivr:announcement')) || '';
    const discountRule = (await kvGet('ivr:discount_rule')) || { threshold: 100, amount: 2 };
    return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ products, gabbaiPhones, pin, yemotToken, announcement, discountRule }) };
  }

  // ── GET: בדיקת חיבור אמיתית מול השרת של ימות המשיח (לא רק בדיקת הפונקציה שלנו) ──
  // שימוש: /.netlify/functions/ivr?step=test_yemot&secret=הסוד_שלך
  if (q.step === 'test_yemot') {
    if ((q.secret || '') !== SECRET) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    const token = (await kvGet('ivr:yemot_token')) || process.env.YEMOT_TOKEN || '';
    if (!token) {
      return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ connected: false, error: 'לא הוגדר טוקן של ימות המשיח (לא באתר ולא ב-Netlify)' }) };
    }
    try {
      const testPath = 'ivr2:2/9/2/000.tts'; // כותב לתוך שלוחת ה"הודעה" — קובץ בדיקה זעיר, לא פוגע בכלום
      const apiUrl = 'https://www.call2all.co.il/ym/api/UploadTextFile';
      const body = 'token=' + encodeURIComponent(token) + '&what=' + encodeURIComponent(testPath) + '&contents=' + encodeURIComponent('בדיקת חיבור ממערכת בית הכנסת');
      const r = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const j = await r.json();
      const connected = j.responseStatus === 'OK';
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          connected,
          message: connected ? '✓ החיבור לימות המשיח תקין — הטוקן עובד' : '✗ ימות המשיח דחה את הבקשה — בדוק שהטוקן נכון',
          yemotRawResponse: j,
        }),
      };
    } catch (e) {
      return { statusCode: 200, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ connected: false, error: e.message }) };
    }
  }

  // ── כל שאר הבקשות = קריאות מ-ימות המשיח בזמן שיחה חיה ────────────────────
  const phone = normalizePhone(q.ApiPhone || q.phone || '');
  const step = q.step || 'menu';

  try {
    // ════════════════════════════════════════════════
    // תפריט שורש — זיהוי גבאי מול ציבור
    // ════════════════════════════════════════════════
    if (step === 'menu') {
      const gabbaiPhones = (await kvGet('ivr:gabbai_phones')) || [];
      if (gabbaiPhones.includes(phone)) {
        return textResponse('id_list_message=t-שלום גבאי יקר.&go_to_folder=/2/7&');
      }
      return textResponse('id_list_message=t-ברוכים הבאים לקו בית הכנסת.&go_to_folder=/2/9&');
    }

    // ════════════════════════════════════════════════
    // ציבור — מכירות (כל שלב כאן קורא לעצמו: פעם ראשונה בלי הקשה = שואל, פעם שנייה עם הקשה = מעבד)
    // ════════════════════════════════════════════════
    if (step === 'sales_pick') {
      if (!q.ApiDig) {
        const products = (await kvGet('ivr:sales_products')) || [];
        if (!products.length) return textResponse('id_list_message=t-לא הוגדרו מוצרים למכירה כרגע. נסה שוב מאוחר יותר.&');
        const lines = products.map((p, i) => `הקש ${i + 1} עבור ${cleanText(p.name)}, מחיר ${p.price} שקלים ${p.unit === 'kg' ? 'לקילו' : 'ליחידה'}.`).join(' ');
        return textResponse('id_list_message=t-' + lines + '&read=1&read_max=2&read_min=1&go_to_folder=/2/9/1&api_add_0=step=sales_pick&');
      }
      const idx = parseInt(q.ApiDig, 10) - 1;
      const products = (await kvGet('ivr:sales_products')) || [];
      const product = products[idx];
      if (!product) return textResponse('id_list_message=t-מספר לא תקין. נסה להתקשר שוב.&');
      await kvSet('ivr:temp_product:' + phone, product);
      return textResponse('id_list_message=t- &go_to_folder=/2/9/1/1&api_add_0=step=sales_qty&');
    }

    if (step === 'sales_qty') {
      if (!q.ApiDig) {
        const product = await kvGet('ivr:temp_product:' + phone);
        if (!product) return textResponse('id_list_message=t-אירעה שגיאה. נסה שוב מההתחלה.&');
        return textResponse('id_list_message=t-הקש כמות ולחץ סולמית.&read=2&read_max=2&read_min=1&go_to_folder=/2/9/1/1&api_add_0=step=sales_qty&');
      }
      const qty = parseInt(q.ApiDig, 10) || 1;
      const product = await kvGet('ivr:temp_product:' + phone);
      if (!product) return textResponse('id_list_message=t-אירעה שגיאה. נסה שוב מההתחלה.&');
      await kvSet('ivr:temp_qty:' + phone, qty);
      return textResponse('id_list_message=t- &go_to_folder=/2/9/1/2&api_add_0=step=sales_confirm&');
    }

    if (step === 'sales_confirm') {
      const product = await kvGet('ivr:temp_product:' + phone);
      const qty = (await kvGet('ivr:temp_qty:' + phone)) || 1;
      if (!q.ApiDig) {
        if (!product) return textResponse('id_list_message=t-אירעה שגיאה. נסה שוב מההתחלה.&');
        const { unitPrice, discounted } = await priceForCaller(product, phone);
        const total = qty * unitPrice;
        const discountNote = discounted ? ' כולל הנחת תורם קבוע' : '';
        return textResponse(`id_list_message=t-הזמנת ${qty} יחידות של ${cleanText(product.name)}, בסך הכל ${total} שקלים${discountNote}. הקש 1 לאישור ותשלום, או 2 לביטול.&read=1&read_max=1&read_min=1&go_to_folder=/2/9/1/2&api_add_0=step=sales_confirm&`);
      }
      const choice = q.ApiDig;
      await kvDel('ivr:temp_product:' + phone);
      await kvDel('ivr:temp_qty:' + phone);
      if (choice !== '1' || !product) {
        return textResponse('ההזמנה בוטלה. תודה.');
      }
      const { unitPrice, discounted } = await priceForCaller(product, phone);
      const total = qty * unitPrice;
      const order = {
        id: 'ivr_' + Date.now(),
        phone, product: product.name, qty, amount: total,
        date: todayISO(), status: 'pending_payment',
        discounted,
      };
      const orders = (await kvGet('ivr:sales_orders')) || [];
      orders.push(order);
      await kvSet('ivr:sales_orders', orders);
      const discountLine = discounted ? ' כולל הנחת תורם קבוע.' : '';
      return textResponse(`ההזמנה נקלטה בהצלחה. ${qty} יחידות של ${cleanText(product.name)}, בסך ${total} שקלים.${discountLine} גבאי בית הכנסת ייצור איתך קשר לתיאום התשלום. תודה רבה.`);
    }

    if (step === 'announcement') {
      const announcement = (await kvGet('ivr:announcement')) || '';
      return textResponse(announcement || 'אין הודעה חדשה כרגע.');
    }

    // ════════════════════════════════════════════════
    // גבאים — מוגן PIN
    // ════════════════════════════════════════════════
    if (step === 'gabbai_pin') {
      const entered = q.ApiDig || '';
      if (!entered) {
        return textResponse('id_list_message=t-הקש קוד גבאי וסולמית.&read=1&read_max=6&read_min=2&go_to_folder=/2/7&api_add_0=step=gabbai_pin&');
      }
      const pin = (await kvGet('ivr:pin')) || '';
      if (String(entered) !== String(pin)) {
        return textResponse('id_list_message=t-קוד שגוי.&go_to_folder=/2&');
      }
      return textResponse('id_list_message=t-קוד אושר.&go_to_folder=/2/7/1&');
    }

    // ── רישום הוצאה: שלב א' סכום (לולאה עצמית) ──
    if (step === 'gx_amount') {
      if (!q.ApiDig) {
        return textResponse('id_list_message=t-הקש את סכום ההוצאה ולחץ סולמית.&read=1&read_max=6&read_min=1&go_to_folder=/2/7/1/1&api_add_0=step=gx_amount&');
      }
      const amount = parseInt(q.ApiDig, 10) || 0;
      if (!amount) return textResponse('id_list_message=t-לא הוקש סכום תקין. נסה להתקשר שוב.&');
      await kvSet('ivr:temp_amount:' + phone, amount);
      return textResponse('id_list_message=t- &go_to_folder=/2/7/1/1/1&');
    }

    // ── רישום הוצאה: שלב ב' קטגוריה (מגיע מתפריט type=menu, כל ספרה = שלוחת-בת עם api_add_1=cat=<1-6>) ──
    if (step === 'gx_cat') {
      const catKey = q.cat || '6';
      const catName = CATEGORY_NAMES[catKey] || 'אחר';
      await kvSet('ivr:temp_cat:' + phone, catName);
      return textResponse('id_list_message=t- &go_to_folder=/2/7/1/1/2&api_add_0=step=gx_date&');
    }

    // ── רישום הוצאה: שלב ג' תאריך + שמירה סופית (לולאה עצמית) ──
    if (step === 'gx_date') {
      if (!q.ApiDig) {
        return textResponse('id_list_message=t-הקש 1 עבור תאריך היום, או הקש תאריך בפורמט יום חודש שנה, שמונה ספרות, ולחץ סולמית.&read=8&read_max=8&read_min=1&go_to_folder=/2/7/1/1/2&api_add_0=step=gx_date&');
      }
      const digits = q.ApiDig;
      const amount = await kvGet('ivr:temp_amount:' + phone);
      const cat = (await kvGet('ivr:temp_cat:' + phone)) || 'אחר';
      await kvDel('ivr:temp_amount:' + phone);
      await kvDel('ivr:temp_cat:' + phone);
      if (!amount) return textResponse('id_list_message=t-אירעה שגיאה, נסה שוב.&');
      const date = (digits === '1' || digits.length !== 8) ? todayISO() : ddmmyyyyToISO(digits);
      const expense = { id: 'ivr_' + Date.now(), amount, cat, desc: cat + ' — הוזן טלפונית', date, source: 'ivr' };
      const expenses = (await kvGet('ivr:expenses')) || [];
      expenses.push(expense);
      await kvSet('ivr:expenses', expenses);
      return textResponse(`הוצאה של ${amount} שקלים תחת קטגוריית ${cat} נרשמה בהצלחה. תודה.`);
    }

    // ── 5 הוצאות אחרונות (נכתב כקובץ TTS ומופנה אליו, בלי קריאת ספרות) ──
    if (step === 'gx_recent') {
      const expenses = (await kvGet('ivr:expenses')) || [];
      const recent = sortByDateDesc(expenses).slice(0, 5);
      if (!recent.length) return textResponse('id_list_message=t-לא נמצאו הוצאות.&');
      const lines = recent.map(e => `הוצאה של ${e.amount} שקלים עבור ${cleanText(e.cat || e.desc)} בתאריך ${e.date}.`).join(' ');
      const ok = await yemotWriteTTS('2/7/2/1/000.tts', lines);
      if (ok) return textResponse('go_to_folder=/2/7/2/1&');
      return textResponse('id_list_message=t-שגיאה בטעינת נתונים.&');
    }

    // ── מכירה במזומן שנרשמת ידנית ע"י גבאי (לולאה עצמית: סכום + שמירה בבת אחת) ──
    if (step === 'cs_amount') {
      if (!q.ApiDig) {
        return textResponse('id_list_message=t-הקש את סכום המכירה במזומן ולחץ סולמית.&read=1&read_max=6&read_min=1&go_to_folder=/2/7/3&api_add_0=step=cs_amount&');
      }
      const amount = parseInt(q.ApiDig, 10) || 0;
      if (!amount) return textResponse('id_list_message=t-לא הוקש סכום תקין. נסה להתקשר שוב.&');
      const order = { id: 'ivr_' + Date.now(), phone: 'מזומן-גבאי', product: 'מכירה במזומן', qty: 1, amount, date: todayISO(), status: 'paid' };
      const orders = (await kvGet('ivr:sales_orders')) || [];
      orders.push(order);
      await kvSet('ivr:sales_orders', orders);
      return textResponse(`מכירה במזומן בסך ${amount} שקלים נרשמה בהצלחה. תודה.`);
    }

    // ── סה"כ מכירות היום ──
    if (step === 'sales_today') {
      const orders = (await kvGet('ivr:sales_orders')) || [];
      const today = todayISO();
      const todayOrders = orders.filter(o => o.date === today);
      const total = todayOrders.reduce((s, o) => s + (o.amount || 0), 0);
      return textResponse(`בוצעו היום ${todayOrders.length} מכירות, בסך הכל ${total} שקלים.`);
    }

    return textResponse('id_list_message=t-שגיאה במערכת. אנא נסה שנית.&');
  } catch (e) {
    console.error('IVR ERROR:', e.message);
    return textResponse('id_list_message=t-שגיאה במערכת.&');
  }
};
