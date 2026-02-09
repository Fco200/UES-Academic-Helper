require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const twilio = require("twilio")(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir carpeta "public"
app.use(express.static(path.join(__dirname, "public")));

// Servir robots.txt y sitemap.xml desde raíz
app.get("/robots.txt", (req, res) => {
  res.sendFile(path.join(__dirname, "robots.txt"));
});

app.get("/sitemap.xml", (req, res) => {
  res.sendFile(path.join(__dirname, "sitemap.xml"));
});

// Ruta principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.post('/eliminar-tarea', async (req, res) => {
    const { materiaId, tareaId } = req.body;
    await Materia.updateOne({ _id: materiaId }, { $pull: { tareas: { _id: tareaId } } });
    res.json({ mensaje: "Tarea eliminada" });
});

app.post('/eliminar-materia', async (req, res) => {
    const { materiaId } = req.body;
    await Materia.findByIdAndDelete(materiaId);
    res.json({ mensaje: "Materia eliminada" });
});

// --- CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log("✅ SISTEMA CONECTADO A MONGODB"))
  .catch(err => console.error("❌ ERROR DE CONEXIÓN:", err));

// --- CONFIGURACIÓN DE IA GEMINI ---
let genAI, model;
try {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
} catch (e) {
  console.warn('Advertencia: Gemini no configurado o clave faltante.');
}

// --- MODELOS DE DATOS ---
const Usuario = mongoose.model('Usuario', new mongoose.Schema({
  identificador: { type: String, unique: true },
  password: { type: String, default: "UES2026" }
}));

const Materia = mongoose.model('Materia', new mongoose.Schema({
  user: String,
  nombre: String,
  tareas: [{ descripcion: String, fecha: String, completada: { type: Boolean, default: false } }]
}, { timestamps: true }));

// --- CONFIGURACIÓN DE NODemailer ---
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 465,
  secure: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === 'true' : true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// --- ESQUEMA DE USUARIO CON CARRERA ---
const UsuarioSchema = new mongoose.Schema({
    identificador: { type: String, unique: true },
    password: { type: String, default: "UES2026" },
    carrera: { type: String, default: "Ingeniería en Software" } // Campo nuevo
});


// Ejemplo de la lógica necesaria en tu server.js
app.post('/verificar-codigo', async (req, res) => {
    const { email, codigo, carrera } = req.body;
    
    // 1. Buscamos al usuario
    let usuario = await db.collection('usuarios').findOne({ email: email.toLowerCase() });

    if (usuario && usuario.codigo === codigo) {
        // 2. ACTUALIZAMOS la carrera en la base de datos si se seleccionó una
        await db.collection('usuarios').updateOne(
            { email: email.toLowerCase() },
            { $set: { carrera: carrera } }
        );
        
        res.json({ success: true, redirect: '/dashboard.html', carrera: carrera });
    } else {
        res.status(401).json({ success: false });
    }
});

// NUEVA RUTA: Para obtener los datos del usuario en la página de perfil
app.get('/obtener-usuario/:email', async (req, res) => {
    const usuario = await db.collection('usuarios').findOne({ email: req.params.email.toLowerCase() });
    if (usuario) {
        res.json(usuario);
    } else {
        res.status(404).send("No encontrado");
    }
});

app.post('/cambiar-password', async (req, res) => {
  const { email, nuevaPassword } = req.body;
  try {
    await Usuario.findOneAndUpdate({ identificador: email }, { password: nuevaPassword });
    res.status(200).send({ message: 'OK' });
  } catch (e) { 
    console.error(e);
    res.status(500).send({ message: 'Error al cambiar pass' }); 
  }
});

// --- RUTAS DE DATOS ---
app.post('/agregar-materia', async (req, res) => {
  const { email, nombre } = req.body;
  try {
    await Materia.create({ user: email, nombre, tareas: [] });
    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.status(500).send({ message: 'Error al crear materia' });
  }
});

app.post('/agregar-tarea', async (req, res) => {
  const { materiaId, descripcion, fecha } = req.body;
  try {
    const materia = await Materia.findById(materiaId);
    if (!materia) return res.status(404).json({ message: 'Materia no encontrada' });
    materia.tareas.push({ descripcion, fecha });
    await materia.save();
    res.sendStatus(200);
  } catch (e) { 
    console.error(e);
    res.status(500).send({ message: 'Error al guardar tarea' }); 
  }
});

// Acepta email o número (con o sin +)
app.get('/obtener-materias/:identificador', async (req, res) => {
  try {
    const id = req.params.identificador;
    const posibles = [
      id,
      id.replace(/^\+/, ''),        // sin +
      (id.startsWith('+') ? id : '+' + id) // con +
    ];
    const datos = await Materia.find({ user: { $in: posibles } });
    res.json(datos);
  } catch (e) {
    console.error(e);
    res.status(500).json([]);
  }
});

// --- RUTA ASISTENTE IA ---
app.post('/ia-asistente', async (req, res) => {
  const { prompt } = req.body;
  try {
    if (!model) throw new Error('Modelo de IA no disponible');
    const result = await model.generateContent(prompt);
    res.json({ respuesta: result.response.text() });
  } catch (e) { 
    console.error(e);
    res.status(500).json({ respuesta: "IA ocupada, intenta luego." }); 
  }
});

// --- COMPLETAR TAREA ---
app.post('/completar-tarea', async (req, res) => {
  const { materiaId, tareaId, completada } = req.body;
  try {
    const materia = await Materia.findById(materiaId);
    if (!materia) return res.status(404).json({ message: 'Materia no encontrada' });
    const tarea = materia.tareas.id(tareaId);
    if (!tarea) return res.status(404).json({ message: 'Tarea no encontrada' });
    tarea.completada = !!completada;
    await materia.save();
    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.status(500).send({ message: "Error al actualizar estado" });
  }
});

// --- EDITAR TAREA ---
// --- RUTAS DE EDICIÓN Y ELIMINACIÓN ---

// 1. Editar una tarea específica
// RUTA PARA EDITAR TAREA
// --- RUTAS DE GESTIÓN (CRUD) ---

// 1. Ruta para editar (Actualizar)
app.post('/editar-tarea', async (req, res) => {
    const { materiaId, tareaId, nuevaDescripcion, nuevaFecha } = req.body;
    try {
        await Materia.updateOne(
            { _id: materiaId, "tareas._id": tareaId },
            { $set: { "tareas.$.descripcion": nuevaDescripcion, "tareas.$.fecha": nuevaFecha } }
        );
        res.status(200).json({ message: "Éxito" });
    } catch (e) {
        res.status(500).json({ message: "Error al editar" });
    }
});

// 2. Ruta para eliminar (Borrar)
app.post('/eliminar-tarea', async (req, res) => {
    const { materiaId, tareaId } = req.body;
    try {
        await Materia.updateOne(
            { _id: materiaId },
            { $pull: { tareas: { _id: tareaId } } }
        );
        res.json({ message: "Eliminado" });
    } catch (e) { res.status(500).send(e); }
});


// --- GOOGLE VERIFICACIÓN ---
app.get("/google74ea19ac0f79b1ad.html", (req, res) => {
  res.send("google-site-verification: google74ea19ac0f79b1ad.html");
});

// --- FUNCIONES DE ENVÍO (EMAIL / SMS) ---
async function enviarCorreo(destinatario, asunto, mensaje) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Credenciales de correo no configuradas');
  }
  const info = await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: destinatario,
    subject: asunto,
    text: mensaje
  });
  console.log('Correo enviado:', info.messageId);
  return info;
}

function normalizarNumero(numero) {
  if (!numero) throw new Error('Número vacío');
  // Si ya tiene + y dígitos, devolver tal cual
  if (/^\+\d+$/.test(numero)) return numero;
  // Si son 10 dígitos mexicanos, agregar +52
  if (/^\d{10}$/.test(numero)) return '+52' + numero;
  // Si tiene 11 o más dígitos sin +, añadir +
  if (/^\d+$/.test(numero)) return '+' + numero;
  // fallback: devolver como vino
  return numero;
}

async function enviarSMS(numero, mensaje) {
  if (!process.env.TWILIO_SID || !process.env.TWILIO_AUTH || !process.env.TWILIO_PHONE) {
    throw new Error('Credenciales Twilio no configuradas');
  }
  const to = normalizarNumero(numero);
  try {
    const msg = await twilio.messages.create({
      body: mensaje,
      from: process.env.TWILIO_PHONE,
      to
    });
    console.log('SMS enviado SID:', msg.sid, 'to:', to);
    return msg;
  } catch (e) {
    console.error('Error enviando SMS:', e);
    throw e;
  }
}

// Ruta para recibir callbacks de estado (opcional)
app.post('/webhook-sms-status', express.urlencoded({ extended: false }), (req, res) => {
  console.log('Twilio status callback', req.body.MessageSid, req.body.MessageStatus);
  res.sendStatus(200);
});

// --- RECORDATORIOS AUTOMÁTICOS ---
// Ruta para enviar recordatorio puntual para una tarea concreta
app.post('/enviar-recordatorio', async (req, res) => {
  const { materiaId, tareaId } = req.body;
  try {
    const materia = await Materia.findById(materiaId);
    if (!materia) return res.status(404).json({ ok: false, message: 'Materia no encontrada' });

    const tarea = materia.tareas.id(tareaId);
    if (!tarea) return res.status(404).json({ ok: false, message: 'Tarea no encontrada' });

    const mensaje = `Recordatorio: ${tarea.descripcion} - Fecha: ${tarea.fecha}`;

    if (materia.user && materia.user.includes('@')) {
      await enviarCorreo(materia.user, 'Recordatorio de tarea', mensaje);
      return res.json({ ok: true, via: 'email', message: 'Correo enviado' });
    } else {
      await enviarSMS(materia.user, mensaje);
      return res.json({ ok: true, via: 'sms', message: 'SMS enviado' });
    }
  } catch (e) {
    console.error('Error enviar-recordatorio:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Ruta de prueba SMS
app.post('/test-sms', async (req, res) => {
  const { to, mensaje } = req.body;
  try {
    await enviarSMS(to, mensaje || 'Prueba');
    res.status(200).json({ ok: true, message: 'SMS enviado' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Cron temporal para pruebas (cada minuto). Cambiar a horario definitivo en producción.
cron.schedule("0 8 * * *", async () => {
  try {
    const materias = await Materia.find();
    const hoy = new Date();
    for (const materia of materias) {
      for (const tarea of materia.tareas) {
        if (!tarea.fecha) continue;
        const fechaTarea = new Date(tarea.fecha);
        const diferencia = (fechaTarea - hoy) / (1000 * 60 * 60 * 24);
        if (diferencia <= 1 && diferencia >= -1 && !tarea.completada) {
          try {
            if (materia.user && materia.user.includes("@")) {
              await enviarCorreo(materia.user, "Recordatorio de tarea", `No olvides: ${tarea.descripcion} para ${tarea.fecha}`);
            } else {
              await enviarSMS(materia.user, `Recordatorio: ${tarea.descripcion} para ${tarea.fecha}`);
            }
          } catch (errInner) {
            console.error('Error enviando recordatorio para', materia._id, tarea._id, errInner);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error en cron recordatorios:', e);
  }
});

// --- INICIO DEL SERVIDOR ---
app.listen(PORT, () => console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`));
