// netlify/functions/retry-settings.js
// קריאה/שמירה של הגדרות שידור חוזר, וקריאת לוג הסירובים — לשימוש האתר
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
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'נדרשת התחברות (accessToken חסר)' }) };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    if (action === 'saveSettings') {
      const { mosadNumber, apiPassword, retryEnabled, retryMode, retryAfterDays, retryOnDayOfMonth, maxAttempts, notifyEmail } = payload;
      const { data, error } = await supabase
        .from('retry_settings')
        .upsert({
          mosad_number: mosadNumber,
          api_password: apiPassword,
          retry_enabled: retryEnabled,
          retry_mode: retryMode,
          retry_after_days: retryAfterDays,
          retry_on_day_of_month: retryOnDayOfMonth,
          max_attempts: maxAttempts,
          notify_email: notifyEmail,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'mosad_number' })
        .select();
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
    }

    if (action === 'getSettings') {
      const { mosadNumber } = payload;
      const { data, error } = await supabase
        .from('retry_settings')
        .select('*')
        .eq('mosad_number', mosadNumber)
        .maybeSingle();
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
    }

    if (action === 'getRetryLog') {
      const { mosadNumber } = payload;
      const { data, error } = await supabase
        .from('keva_retry_log')
        .select('*')
        .eq('mosad_number', mosadNumber)
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'action לא מוכר' }) };
  } catch (err) {
    console.error('retry-settings error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
