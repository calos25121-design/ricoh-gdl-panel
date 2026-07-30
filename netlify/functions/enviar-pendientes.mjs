import admin from 'firebase-admin';

function daysUntil(todayISO, dateStr){
  if(!dateStr) return null;
  const today = new Date(todayISO + 'T00:00:00');
  const due = new Date(dateStr + 'T00:00:00');
  return Math.round((due - today) / 86400000);
}

function stampFor(todayISO, t){
  const du = daysUntil(todayISO, t.dueDate);
  if(du === null) return null;
  if(du < 0) return { text: `Vencido hace ${Math.abs(du)}d`, color: '#D1001F' };
  if(du === 0) return { text: 'Vence hoy', color: '#b9760a' };
  if(du === 1) return { text: 'Vence mañana', color: '#b9760a' };
  if(du <= 3) return { text: `En ${du} días`, color: '#6c6c70' };
  const d = new Date(t.dueDate + 'T00:00:00');
  return { text: d.toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' }), color: '#6c6c70' };
}

function escapeMail(s){
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildHtml(persona, activos, fecha, todayISO){
  let itemsHtml = '';
  activos.forEach(t => {
    const stamp = stampFor(todayISO, t);
    itemsHtml += `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #e3e3e1;">
          <div style="font-family:Arial,sans-serif;font-weight:700;font-size:14px;color:#1c1c1e;">${escapeMail(t.title)}</div>
          ${t.comentario ? `<div style="font-family:Arial,sans-serif;font-size:12.5px;color:#6c6c70;margin-top:3px;">${escapeMail(t.comentario)}</div>` : ''}
          ${stamp ? `<div style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${stamp.color};margin-top:5px;">${escapeMail(stamp.text)}</div>` : ''}
        </td>
      </tr>`;
  });
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:#D1001F;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-weight:700;font-size:13px;letter-spacing:.04em;">
        RICOH GDL · IT Y SOLUCIONES
      </div>
      <div style="border:1px solid #e3e3e1;border-top:none;border-radius:0 0 8px 8px;padding:20px 18px;">
        <p style="font-family:Arial,sans-serif;font-size:14px;color:#1c1c1e;margin:0 0 6px;">Hola <b>${escapeMail(persona)}</b>,</p>
        <p style="font-family:Arial,sans-serif;font-size:13px;color:#6c6c70;margin:0 0 16px;">Este es tu resumen de pendientes de hoy (${fecha}):</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e3e3e1;border-radius:8px;overflow:hidden;">
          ${itemsHtml}
        </table>
        <p style="font-family:Arial,sans-serif;font-size:12px;color:#9d9da1;margin:20px 0 0;">
          Saludos —<br>
          <b style="color:#1c1c1e;">Panel de Seguimiento IT y Soluciones</b><br>
          Ricoh GDL
        </p>
      </div>
    </div>
  `;
}

export default async () => {
  const log = [];
  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    const db = admin.firestore();
    const docSnap = await db.collection('ricoh-gdl').doc('panel').get();
    if (!docSnap.exists) {
      return new Response('No hay datos en Firestore todavía.', { status: 200 });
    }
    const data = docSnap.data();
    const tasks = data.tasks || [];
    const people = data.people || [];
    const personEmails = data.personEmails || {};

    const todayISO = new Date().toISOString().slice(0, 10);
    const fecha = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

    let enviados = 0;

    for (const persona of people) {
      const email = personEmails[persona];
      if (!email) { log.push(`${persona}: sin correo capturado, se salta`); continue; }

      const activos = tasks.filter(t => t.persona === persona && t.estado === 'Pendiente');
      if (!activos.length) { log.push(`${persona}: sin pendientes activos, se salta`); continue; }

      const messageHtml = buildHtml(persona, activos, fecha, todayISO);
      let bodyPlano = `Hola ${persona},\n\nEste es tu resumen de pendientes de hoy:\n\n`;
      activos.forEach((t, i) => {
        const stamp = stampFor(todayISO, t);
        bodyPlano += `${i + 1}. ${t.title}${stamp ? ' [' + stamp.text + ']' : ''}\n`;
        if (t.comentario) bodyPlano += `   Nota: ${t.comentario}\n`;
      });
      bodyPlano += `\nSaludos — Panel de Seguimiento IT y Soluciones, Ricoh GDL.`;

      const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: process.env.EMAILJS_SERVICE_ID,
          template_id: process.env.EMAILJS_TEMPLATE_ID,
          user_id: process.env.EMAILJS_PUBLIC_KEY,
          accessToken: process.env.EMAILJS_PRIVATE_KEY,
          template_params: {
            to_email: email,
            to_name: persona,
            subject: `Pendientes de ${persona} — ${fecha}`,
            message: bodyPlano,
            message_html: messageHtml,
          },
        }),
      });

      if (resp.ok) {
        enviados++;
        log.push(`${persona}: enviado a ${email} (${activos.length} pendientes)`);
      } else {
        const errText = await resp.text();
        log.push(`${persona}: ERROR EmailJS ${resp.status} - ${errText}`);
      }
    }

    console.log(log.join('\n'));
    return new Response(`Correos enviados: ${enviados}\n\n${log.join('\n')}`, { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response('Error: ' + err.message, { status: 500 });
  }
};

// Se ejecuta solo, todos los días a las 9:00 AM hora CDMX (UTC-6 todo el año)
export const config = {
  schedule: '0 15 * * *',
};
