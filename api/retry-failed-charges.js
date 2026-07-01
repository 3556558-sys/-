// netlify/functions/retry-failed-charges.js
// פונקציה מתוזמנת — רצה אוטומטית כל יום (ראה netlify.toml)
// בודקת הוראות קבע עם סירוב, ומשדרת מחדש לפי הגדרות retry_settings

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // מפתח שירות — גישה מלאה, נשמר כ-Environment Variable בנטליפיי, לא חשוף ללקוח
);

async function ndpFetch(action, params, method = 'GET') {
  const baseUrls = {
    manage: 'https://matara.pro/nedarimplus/Reports/Manage3.aspx',
  };
  const baseUrl = baseUrls.manage;

  let response;
  if (method === 'GET') {
    const url = new URL(baseUrl);
    url.searchParams.append('Action', action);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v);
    });
    response = await fetch(url.toString(), { method: 'GET' });
  } else {
    const formParams = new URLSearchParams();
    formParams.append('Action', action);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') formParams.append(k, v);
    });
    response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formParams.toString(),
    });
  }
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

exports.handler = async () => {
  const results = [];

  try {
    // שלב 1: שלוף את כל הגדרות השידור החוזר הפעילות
    const { data: settingsList, error: settingsErr } = await supabase
      .from('retry_settings')
      .select('*')
      .eq('retry_enabled', true);

    if (settingsErr) throw settingsErr;

    for (const settings of settingsList || []) {
      // שלב 2: משוך את כל הוראות הקבע הנוכחיות מנדרים פלוס עבור מוסד זה
      const kevaData = await ndpFetch('GetKevaNew', {
        MosadNumber: settings.mosad_number,
        ApiPassword: settings.api_password,
      });

      const rows = Array.isArray(kevaData.data) ? kevaData.data : [];

      for (const row of rows) {
        const kevaId = row.DT_RowId || row['0'];
        const errorText = row['10'] || '';
        const amount = parseFloat(row['4']) || 0;
        const clientName = row['2'] || '';

        if (!errorText) continue; // אין סירוב, לא רלוונטי

        // שלב 3: בדוק אם כבר יש רישום מעקב להוראת קבע זו
        let { data: logEntry } = await supabase
          .from('keva_retry_log')
          .select('*')
          .eq('mosad_number', settings.mosad_number)
          .eq('keva_id', String(kevaId))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const today = new Date();

        if (!logEntry) {
          // סירוב חדש — צור רישום מעקב ראשוני
          await supabase.from('keva_retry_log').insert({
            mosad_number: settings.mosad_number,
            keva_id: String(kevaId),
            client_name: clientName,
            amount,
            original_fail_date: today.toISOString().slice(0, 10),
            attempt_number: 0,
            last_attempt_result: 'pending',
          });
          continue; // ננסה לשדר בפעם הבאה שהפונקציה תרוץ, לפי לוח הזמנים
        }

        if (logEntry.attempt_number >= settings.max_attempts) continue; // הגענו למקסימום ניסיונות
        if (logEntry.last_attempt_result === 'success') continue; // כבר הצליח בעבר

        // שלב 4: קבע האם הגיע הזמן לנסות שוב, לפי מצב התזמון
        let shouldRetryNow = false;
        const lastAttempt = logEntry.last_attempt_date ? new Date(logEntry.last_attempt_date) : new Date(logEntry.original_fail_date);

        if (settings.retry_mode === 'date' && settings.retry_on_day_of_month) {
          shouldRetryNow = today.getDate() === settings.retry_on_day_of_month;
        } else {
          const daysSince = Math.floor((today - lastAttempt) / (1000 * 60 * 60 * 24));
          shouldRetryNow = daysSince >= (settings.retry_after_days || 3);
        }

        if (!shouldRetryNow) continue;

        // שלב 5: בצע ניסיון חיוב חוזר דרך TashlumBodedNew
        const chargeResult = await ndpFetch('TashlumBodedNew', {
          MosadNumber: settings.mosad_number,
          ApiPassword: settings.api_password,
          Currency: 1,
          KevaId: kevaId,
          Amount: amount,
          JoinToKevaId: 'Join',
        }, 'POST');

        const success = chargeResult && (chargeResult.Status === 'OK' || chargeResult.Result === 'OK');

        await supabase
          .from('keva_retry_log')
          .update({
            attempt_number: logEntry.attempt_number + 1,
            last_attempt_date: today.toISOString(),
            last_attempt_result: success ? 'success' : ((logEntry.attempt_number + 1 >= settings.max_attempts) ? 'max_attempts_reached' : 'failed'),
            last_error_message: success ? null : (chargeResult.Message || 'שגיאה לא ידועה'),
            updated_at: today.toISOString(),
          })
          .eq('id', logEntry.id);

        results.push({ mosad: settings.mosad_number, kevaId, success });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, processed: results.length, results }),
    };
  } catch (err) {
    console.error('retry-failed-charges error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
