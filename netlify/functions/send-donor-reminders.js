// netlify/functions/send-donor-reminders.js
// פונקציה מתוזמנת — רצה אוטומטית כל יום (ראה netlify.toml)
// בודקת תזכורות תרומה (donor_reminders) שהגיע תאריכן, ושולחת מייל ל-1-2 הכתובות שהוגדרו
// שולח מייל באמצעות Resend (https://resend.com) — צריך RESEND_API_KEY ו-REMINDER_FROM_EMAIL כ-Environment Variables בנטליפיי

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // מפתח שירות — גישה מלאה, נשמר כ-Environment Variable בנטליפיי, לא חשוף ללקוח
);

async function sendReminderEmail(reminder) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.REMINDER_FROM_EMAIL || 'onboarding@resend.dev';
  if (!apiKey) {
    console.warn('RESEND_API_KEY לא מוגדר — לא ניתן לשלוח מייל תזכורת');
    return { ok: false, error: 'RESEND_API_KEY חסר' };
  }

  const amountText = reminder.amount ? `₪${Number(reminder.amount).toLocaleString('he-IL')}` : 'לא צוין סכום';
  const paidDateText = reminder.paid_date || 'לא צוין';

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;color:#222">
      <h2>🔔 תזכורת — לפנות שוב לתורם</h2>
      <p>שלום,</p>
      <p>זוהי תזכורת אוטומטית לגבי התורם/ת <b>${reminder.donor_name}</b>.</p>
      <ul>
        <li>תרומה קודמת: ${amountText}</li>
        <li>תאריך תשלום קודם: ${paidDateText}</li>
        ${reminder.note ? `<li>הערה: ${reminder.note}</li>` : ''}
      </ul>
      <p>הגיע הזמן לפנות אליו/ה שוב ולבקש תרומה נוספת.</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: reminder.notify_emails,
      subject: `🔔 תזכורת לפנייה חוזרת — ${reminder.donor_name}`,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: errText };
  }
  return { ok: true };
}

exports.handler = async () => {
  const results = [];
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data: dueReminders, error } = await supabase
      .from('donor_reminders')
      .select('*')
      .eq('status', 'pending')
      .lte('remind_date', today);

    if (error) throw error;

    for (const reminder of dueReminders || []) {
      const sendResult = await sendReminderEmail(reminder);
      if (sendResult.ok) {
        await supabase
          .from('donor_reminders')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', reminder.id);
      }
      results.push({ id: reminder.id, donor: reminder.donor_name, ...sendResult });
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, processed: results.length, results }) };
  } catch (err) {
    console.error('send-donor-reminders error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
