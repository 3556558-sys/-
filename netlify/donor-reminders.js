// netlify/functions/donor-reminders.js
// ניהול תרומות חד-פעמיות + תזכורות עתידיות לפנייה חוזרת לתורם
// משתמש ב-Supabase anon key + RLS, מוגן מאחורי התחברות (auth.role()==='authenticated')

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
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'נדרשת התחברות במייל כדי לנהל תזכורות תרומות' }) };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    if (action === 'list') {
      const { data, error } = await supabase
        .from('donor_reminders')
        .select('*')
        .order('remind_date', { ascending: true });
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
    }

    if (action === 'add') {
      const { donorName, amount, paidDate, remindDate, notifyEmails, note } = payload || {};
      if (!donorName || !donorName.trim()) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'יש להזין שם תורם' }) };
      }
      if (!remindDate) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'יש לבחור תאריך לתזכורת' }) };
      }
      const emails = (Array.isArray(notifyEmails) ? notifyEmails : [])
        .map((e) => String(e || '').trim().toLowerCase())
        .filter((e) => e && e.includes('@'))
        .slice(0, 2);
      if (!emails.length) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'יש להזין לפחות מייל אחד לתזכורת' }) };
      }
      const { data, error } = await supabase
        .from('donor_reminders')
        .insert({
          donor_name: donorName.trim(),
          amount: amount || null,
          paid_date: paidDate || null,
          remind_date: remindDate,
          notify_emails: emails,
          note: note || null,
          status: 'pending',
        })
        .select();
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
    }

    if (action === 'remove') {
      const { id } = payload || {};
      if (!id) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'חסר מזהה רשומה למחיקה' }) };
      }
      const { error } = await supabase.from('donor_reminders').delete().eq('id', id);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'action לא מוכר' }) };
  } catch (err) {
    console.error('donor-reminders error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
