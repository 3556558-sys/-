// netlify/functions/nedarim.js
// Proxy server עבור נדרים פלוס — עוקף בעיית CORS
// פועל כ-Netlify Function

exports.handler = async (event) => {
  // אפשור CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // בקשת preflight של הדפדפן
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
    const { mosadId, apiValid, task } = JSON.parse(event.body || '{}');

    if (!mosadId || !apiValid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'חסר מספר קופה או סיסמה' }),
      };
    }

    // בניית הבקשה לנדרים פלוס
    const params = new URLSearchParams();
    params.append('MosadId', mosadId);
    params.append('ApiValid', apiValid);
    params.append('Task', task || 'GetAllActiveDD');

    const ndpResponse = await fetch('https://www.matara.pro/nedarimplus/online/api.aspx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const text = await ndpResponse.text();

    // נדרים פלוס מחזירים לפעמים JSON ולפעמים XML/טקסט תלוי בהגדרות הקופה
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
