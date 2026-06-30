// netlify/functions/auth-send-link.js
// שולח קישור התחברות (Magic Link) למייל, דרך Supabase Auth
// הלקוח (האתר) קורא לפונקציה הזו עם המייל, וSupabase שולח את המייל בעצמו

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'רק בקשות POST מותרות' }) };
  }

  try {
    const { email, redirectTo } = JSON.parse(event.body || '{}');
    if (!email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'חסר מייל' }) };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo || process.env.SITE_URL },
    });

    if (error) throw error;

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'קישור התחברות נשלח למייל' }) };
  } catch (err) {
    console.error('auth-send-link error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
