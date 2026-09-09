import admin from 'firebase-admin';

// Se ejecuta sola todos los días. Guarda una copia completa de los datos
// en una colección aparte (ricoh-gdl-backups), para que si algún día el
// documento principal se pierde o se sobrescribe por error, siempre haya
// un punto de restauración de máximo 24 horas de antigüedad.
export default async () => {
  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    const db = admin.firestore();
    const docSnap = await db.collection('ricoh-gdl').doc('panel').get();

    if (!docSnap.exists) {
      console.error('ALERTA: el documento principal ricoh-gdl/panel no existe. No se generó respaldo porque no hay nada que respaldar.');
      return new Response('El documento principal no existe — nada que respaldar. Revisa la app cuanto antes.', { status: 200 });
    }

    const data = docSnap.data();
    const fechaHoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    await db.collection('ricoh-gdl-backups').doc(fechaHoy).set({
      ...data,
      _respaldadoEn: new Date().toISOString(),
    });

    // Limpieza: borra respaldos de más de 45 días para no acumular basura
    // (se trae todo y se filtra en JS, para no necesitar un índice compuesto en Firestore)
    const limite = new Date();
    limite.setDate(limite.getDate() - 45);
    const limiteStr = limite.toISOString().slice(0, 10);
    const todos = await db.collection('ricoh-gdl-backups').get();
    const borrados = [];
    for (const doc of todos.docs) {
      if (doc.id < limiteStr) {
        await doc.ref.delete();
        borrados.push(doc.id);
      }
    }

    const resumen = `Respaldo guardado: ricoh-gdl-backups/${fechaHoy} (${(data.tasks||[]).length} pendientes, ${(data.clientes||[]).length} clientes, ${(data.reportesAmazon||[]).length} reportes Amazon). Respaldos viejos borrados: ${borrados.length ? borrados.join(', ') : 'ninguno'}.`;
    console.log(resumen);
    return new Response(resumen, { status: 200 });
  } catch (err) {
    console.error('Error al generar respaldo diario', err);
    return new Response('Error: ' + err.message, { status: 500 });
  }
};

// Todos los días a las 7:50 AM hora CDMX (antes del correo de pendientes de las 9)
export const config = {
  schedule: '50 13 * * *',
};
