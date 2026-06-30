// api/nedarim.js
// Proxy server עבור נדרים פלוס — עוקף בעיית CORS
// פועל כ-Vercel Serverless Function

export default async function handler(req, res) {
  // אפשור CORS לאתר שלך בלבד (אפשר להחליף ל-domain ספציפי לאבטחה טובה יותר)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // בקשת preflight של הדפדפן
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'רק בקשות POST מותרות' });
  }

  try {
    const { mosadId, apiValid, task } = req.body;

    if (!mosadId || !apiValid) {
      return res.status(400).json({ error: 'חסר מספר קופה או סיסמה' });
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

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('NDP proxy error:', err);
    return res.status(500).json({ error: 'שגיאת שרת בעת חיבור לנדרים פלוס', details: err.message });
  }
}
