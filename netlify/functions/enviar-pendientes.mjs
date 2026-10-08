import admin from 'firebase-admin';

// Se ejecuta sola todos los días a las 9:00 AM (CDMX).
// A cada persona con correo le manda:
//   - sus tareas en estado "Pendiente" (vencidas primero)
//   - las licencias de SUS clientes (donde es "Responsable") vencidas o que vencen en 15 días o menos
// Si una persona no tiene ni pendientes ni licencias por vencer, NO se le envía nada.

const ZONA = 'America/Mexico_City';
const DIAS_LICENCIA = 15;

// Fecha de hoy en CDMX como "YYYY-MM-DD"
function hoyCDMX() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
}
// Días entre hoy y una fecha "YYYY-MM-DD" (negativo = ya pasó)
function diasHasta(fecha, hoy) {
  if (!fecha) return null;
  const [y1, m1, d1] = hoy.split('-').map(Number);
  const [y2, m2, d2] = fecha.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function formatoFecha(fecha) {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function sello(du, fecha) {
  if (du === null) return null;
  if (du < 0) return { txt: `Vencido hace ${Math.abs(du)}d`, color: '#D1001F' };
  if (du === 0) return { txt: 'Vence hoy', color: '#b9760a' };
  if (du === 1) return { txt: 'Vence mañana', color: '#b9760a' };
  if (du <= 3) return { txt: `En ${du} días`, color: '#6c6c70' };
  return { txt: formatoFecha(fecha), color: '#6c6c70' };
}
function selloLicencia(du, fecha) {
  if (du < 0) return { txt: `Venció hace ${Math.abs(du)}d`, color: '#D1001F' };
  if (du === 0) return { txt: 'Vence hoy', color: '#D1001F' };
  return { txt: `Vence en ${du} días (${formatoFecha(fecha)})`, color: '#b9760a' };
}

function armarCorreo(persona, pendientes, licencias, hoy) {
  const fechaLarga = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA });

  let texto = `Hola ${persona},\n\n`;
  let filasTareas = '';
  if (pendientes.length) {
    texto += `Tus pendientes de hoy:\n\n`;
    pendientes.forEach((t, i) => {
      const s = sello(diasHasta(t.dueDate, hoy), t.dueDate);
      texto += `${i + 1}. ${t.title}${s ? ` [${s.txt}]` : ''}\n${t.comentario ? `   Nota: ${t.comentario}\n` : ''}`;
      filasTareas += `
        <tr><td style="padding:14px 16px;border-bottom:1px solid #e3e3e1;">
          <div style="font-family:Arial,sans-serif;font-weight:700;font-size:14px;color:#1c1c1e;">${esc(t.title)}</div>
          ${t.comentario ? `<div style="font-family:Arial,sans-serif;font-size:12.5px;color:#6c6c70;margin-top:3px;">${esc(t.comentario)}</div>` : ''}
          ${s ? `<div style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${s.color};margin-top:5px;">${esc(s.txt)}</div>` : ''}
        </td></tr>`;
    });
  }
  let filasLic = '';
  if (licencias.length) {
    texto += `${pendientes.length ? '\n' : ''}Licencias de tus clientes por vencer:\n\n`;
    licencias.forEach(c => {
      const s = selloLicencia(diasHasta(c.vencimiento, hoy), c.vencimiento);
      texto += `- ${c.nombre}${c.solucion ? ' (' + c.solucion + ')' : ''}: ${s.txt}\n`;
      filasLic += `
        <tr><td style="padding:12px 16px;border-bottom:1px solid #e3e3e1;">
          <div style="font-family:Arial,sans-serif;font-weight:700;font-size:13.5px;color:#1c1c1e;">🏢 ${esc(c.nombre)}</div>
          ${c.solucion ? `<div style="font-family:Arial,sans-serif;font-size:12px;color:#6c6c70;margin-top:2px;">${esc(c.solucion)}${c.admin ? ' · ' + esc(c.admin) : ''}</div>` : ''}
          <div style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${s.color};margin-top:5px;">${esc(s.txt)}</div>
        </td></tr>`;
    });
  }
  texto += `\nSaludos — Panel de Seguimiento IT y Soluciones, Ricoh GDL.`;

  const tabla = filas => `<table style="width:100%;border-collapse:collapse;border:1px solid #e3e3e1;border-radius:8px;overflow:hidden;">${filas}</table>`;
  const titulo = t => `<p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#1c1c1e;letter-spacing:.04em;text-transform:uppercase;margin:18px 0 8px;">${t}</p>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:#D1001F;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-weight:700;font-size:13px;letter-spacing:.04em;">
        RICOH GDL · IT Y SOLUCIONES
      </div>
      <div style="border:1px solid #e3e3e1;border-top:none;border-radius:0 0 8px 8px;padding:20px 18px;">
        <p style="font-family:Arial,sans-serif;font-size:14px;color:#1c1c1e;margin:0 0 6px;">Hola <b>${esc(persona)}</b>,</p>
        <p style="font-family:Arial,sans-serif;font-size:13px;color:#6c6c70;margin:0 0 4px;">Este es tu resumen de hoy (${fechaLarga}).</p>
        ${pendientes.length ? titulo(`Pendientes (${pendientes.length})`) + tabla(filasTareas) : ''}
        ${licencias.length ? titulo(`Licencias por vencer (${licencias.length})`) + tabla(filasLic) : ''}
        <p style="font-family:Arial,sans-serif;font-size:12px;color:#9d9da1;margin:20px 0 0;">
          Saludos —<br>
          <b style="color:#1c1c1e;">Panel de Seguimiento IT y Soluciones</b><br>
          Ricoh GDL
        </p>
      </div>
    </div>`;

  const partes = [];
  if (pendientes.length) partes.push(`${pendientes.length} pendiente${pendientes.length !== 1 ? 's' : ''}`);
  if (licencias.length) partes.push(`${licencias.length} licencia${licencias.length !== 1 ? 's' : ''} por vencer`);
  const asunto = `Pendientes de ${persona} — ${fechaLarga}${partes.length ? ' (' + partes.join(', ') + ')' : ''}`;
  return { asunto, texto, html };
}

async function enviarEmailJS(params) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: params,
    }),
  });
  if (!res.ok) throw new Error(`EmailJS respondió ${res.status}: ${await res.text()}`);
}

export default async () => {
  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    const snap = await admin.firestore().collection('ricoh-gdl').doc('panel').get();
    if (!snap.exists) {
      console.error('ALERTA: no existe ricoh-gdl/panel; no se mandó ningún correo.');
      return new Response('El documento principal no existe — no se mandaron correos.', { status: 500 });
    }
    const data = snap.data();
    const hoy = hoyCDMX();
    const people = data.people || [];
    const emails = data.personEmails || {};
    const tasks = data.tasks || [];
    const clientes = data.clientes || [];

    const enviados = [], omitidos = [], errores = [];
    for (const persona of people) {
      const correo = (emails[persona] || '').trim();
      if (!correo) { omitidos.push(`${persona} (sin correo)`); continue; }

      const pendientes = tasks
        .filter(t => t.persona === persona && t.estado === 'Pendiente')
        .sort((a, b) => (a.dueDate ? diasHasta(a.dueDate, hoy) : 9999) - (b.dueDate ? diasHasta(b.dueDate, hoy) : 9999));
      const licencias = clientes
        .filter(c => c.responsable === persona && c.vencimiento && diasHasta(c.vencimiento, hoy) <= DIAS_LICENCIA)
        .sort((a, b) => diasHasta(a.vencimiento, hoy) - diasHasta(b.vencimiento, hoy));

      if (!pendientes.length && !licencias.length) { omitidos.push(`${persona} (nada pendiente)`); continue; }

      const { asunto, texto, html } = armarCorreo(persona, pendientes, licencias, hoy);
      try {
        await enviarEmailJS({ to_email: correo, to_name: persona, subject: asunto, message: texto, message_html: html });
        enviados.push(`${persona} <${correo}> (${pendientes.length} pend., ${licencias.length} lic.)`);
      } catch (e) {
        errores.push(`${persona}: ${e.message}`);
      }
    }

    const resumen = `Correos ${hoy} — enviados: ${enviados.join('; ') || 'ninguno'} | sin envío: ${omitidos.join('; ') || 'nadie'}${errores.length ? ' | ERRORES: ' + errores.join('; ') : ''}`;
    if (errores.length) { console.error(resumen); return new Response(resumen, { status: 500 }); }
    console.log(resumen);
    return new Response(resumen, { status: 200 });
  } catch (err) {
    console.error('Error en enviar-pendientes', err);
    return new Response('Error: ' + err.message, { status: 500 });
  }
};

// Todos los días a las 9:00 AM hora CDMX (15:00 UTC)
export const config = {
  schedule: '0 15 * * *',
};
