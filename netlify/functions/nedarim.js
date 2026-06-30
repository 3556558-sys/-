// netlify/functions/nedarim.js
// Proxy server עבור נדרים פלוס — עוקף בעיית CORS
// פועל כ-Netlify Function
//
// מבוסס על התיעוד הרשמי של נדרים פלוס:
// GET https://matara.pro/nedarimplus/Reports/Manage3.aspx
// Action=GetKevaNew — משיכת כל ההוראות קבע (אשראי) + סיכומים חודשיים
//
// שימו לב: ApiPassword הוא קוד אימות ייעודי ל-API שיש לבקש ממשרד נדרים פלוס
// (office@nedar.im) — הוא שונה מהסיסמה הרגילה להתחברות לקופה!

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
    const { mosadNumber, apiPassword } = JSON.parse(event.body || '{}');

    if (!mosadNumber || !apiPassword) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'חסר מספר מוסד או סיסמת API' }),
      };
    }

    const url = new URL('https://matara.pro/nedarimplus/Reports/Manage3.aspx');
    url.searchParams.append('Action', 'GetKevaNew');
    url.searchParams.append('MosadNumber', mosadNumber);
    url.searchParams.append('ApiPassword', apiPassword);

    const ndpResponse = await fetch(url.toString(), { method: 'GET' });
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
