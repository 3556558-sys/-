// netlify/functions/nedarim.js
// Proxy server עבור נדרים פלוס — עוקף בעיית CORS
// פועל כ-Netlify Function
//
// פרוקסי כללי שתומך בכל פעולות ה-API המתועדות של נדרים פלוס.
// הקליינט שולח: { base: 'manage'|'masav'|'tamal', action: 'GetKevaNew', method: 'GET'|'POST', params: {...} }
// ApiPassword/MosadNumber נכנסים תמיד בתוך params.
//
// (ApiPassword הוא קוד אימות ייעודי ל-API שיש לבקש ממשרד נדרים פלוס office@nedar.im
//  — הוא שונה מהסיסמה הרגילה להתחברות לקופה!)

const BASE_URLS = {
  manage: 'https://matara.pro/nedarimplus/Reports/Manage3.aspx',   // הוראות קבע אשראי, היסטוריה, ביטולים, הכנסות חיצוניות
  masav:  'https://matara.pro/nedarimplus/Reports/Masav3.aspx',     // הוראות קבע בנקאיות (מס"ב)
  tamal:  'https://matara.pro/nedarimplus/Reports/Tamal3.aspx',     // הפקת/ביטול קבלות
};

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'רק בקשות POST מותרות' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // תאימות לאחור: קריאה ישנה בלי base/action -> משיכת הוראות קבע (ברירת מחדל)
    const base = body.base || 'manage';
    const action = body.action || 'GetKevaNew';
    const method = (body.method || 'GET').toUpperCase();
    const params = body.params || {
      MosadNumber: body.mosadNumber,
      ApiPassword: body.apiPassword,
    };

    if (!params.MosadNumber && !params.MosadId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'חסר מספר מוסד' }) };
    }
    if (!params.ApiPassword && !params.ApiValid) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'חסר סיסמת API' }) };
    }

    const baseUrl = BASE_URLS[base];
    if (!baseUrl) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'base לא מוכר: ' + base }) };
    }

    let ndpResponse;
    if (method === 'GET') {
      const url = new URL(baseUrl);
      url.searchParams.append('Action', action);
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v);
      });
      ndpResponse = await fetch(url.toString(), { method: 'GET' });
    } else {
      const formParams = new URLSearchParams();
      formParams.append('Action', action);
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') formParams.append(k, v);
      });
      ndpResponse = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formParams.toString(),
      });
    }

    const text = await ndpResponse.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data }),
    };
  } catch (err) {
    console.error('NDP proxy error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'שגיאת שרת בעת חיבור לנדרים פלוס', details: err.message }),
    };
  }
};
