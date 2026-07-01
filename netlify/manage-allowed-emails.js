// netlify/functions/manage-allowed-emails.js
// ניהול רשימת המיילים המורשים להתחברות (Magic Link)
// list - מותר לכולם (אנונימי) כדי שגם פני ההתחברות יוכלו להציג מידע אם צריך
// add / remove - מותר רק למשתמש מאומת (accessToken תקף מ-Supabase), אוכף ב-RLS

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'רק בקשות POST מותרות' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { action, accessToken, payload } = body;

    if (!accessToken) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'נדרשת התחברות (accessToken חסר) כדי לנהל את רשימת המיילים המורשים' }) };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    if (action === 'list') {
      const { data, error } = await supabase
        .from('allowed_emails')
        .select('email, label, tabs, added_at')
        .order('added_at', { ascending: true });
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
    }

    if (action === 'add') {
      const email = String((payload && payload.email) || '').trim().toLowerCase();
      const label = (payload && payload.label) || null;
      // tabs: undefined = לא לגעת בהרשאות קיימות (רק אם זו רשומה חדשה -> תיחשב null = גישה מלאה)
      // null = גישה מלאה לכל הלשוניות, מערך = רשימת לשוניות מותרות בלבד
      const tabs = (payload && Object.prototype.hasOwnProperty.call(payload, 'tabs')) ? payload.tabs : null;
      if (!email || !email.includes('@')) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'כתובת מייל לא תקינה' }) };
      }
      const { data, error } = await supabase
        .from('allowed_emails')
        .upsert({ email, label, tabs }, { onConflict: 'email' })
        .select();
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
    }

    if (action === 'remove') {
      const email = String((payload && payload.email) || '').trim().toLowerCase();
      if (!email) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'חסר מייל למחיקה' }) };
      }
      const { error } = await supabase.from('allowed_emails').delete().eq('email', email);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'action לא מוכר' }) };
  } catch (err) {
    console.error('manage-allowed-emails error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
