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

// --- CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log("✅ SISTEMA CONECTADO A MONGODB"))
  .catch(err => console.error("❌ ERROR DE CONEXIÓN:", err));

// --- CONFIGURACIÓN DE IA GEMINI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- MODELOS DE DATOS ---
const Usuario = mongoose.model('Usuario', new mongoose.Schema({
  identificador: { type: String, unique: true },
  password: { type: String, default: "UES2026" }
}));

const Materia = mongoose.model('Materia', new mongoose.Schema({
  user: String,
  nombre: String,
  tareas: [{ descripcion: String, fecha: String, completada: { type: Boolean, default: false } }]
}));

// --- RUTAS DE AUTENTICACIÓN ---
app.post('/verificar-codigo', async (req, res) => {
  const { email, codigo } = req.body;
  try {
    let user = await Usuario.findOne({ identificador: email });
    if (!user) user = await Usuario.create({ identificador: email });
    
    if (user.password === codigo) res.status(200).send({ redirect: '/home.html' });
    else res.status(401).send({ message: 'Contraseña incorrecta' });
  } catch (e) { res.status(500).send({ message: 'Error en login' }); }
});

app.post('/cambiar-password', async (req, res) => {
  const { email, nuevaPassword } = req.body;
  try {
    await Usuario.findOneAndUpdate({ identificador: email }, { password: nuevaPassword });
    res.status(200).send({ message: 'OK' });
  } catch (e) { res.status(500).send({ message: 'Error al cambiar pass' }); }
});

// --- RUTAS DE DATOS ---
app.post('/agregar-materia', async (req, res) => {
  const { email, nombre } = req.body;
  await Materia.create({ user: email, nombre, tareas: [] });
  res.sendStatus(200);
});

app.post('/agregar-tarea', async (req, res) => {
  const { materiaId, descripcion, fecha } = req.body;
  try {
    const materia = await Materia.findById(materiaId);
    materia.tareas.push({ descripcion, fecha });
    await materia.save();
    res.sendStatus(200);
  } catch (e) { res.status(500).send({ message: 'Error al guardar tarea' }); }
});

app.get('/obtener-materias/:email', async (req, res) => {
  const datos = await Materia.find({ user: req.params.email });
  res.json(datos);
});

// --- RUTA ASISTENTE IA ---
app.post('/ia-asistente', async (req, res) => {
  const { prompt } = req.body;
  try {
    const result = await model.generateContent(prompt);
    res.json({ respuesta: result.response.text() });
  } catch (e) { res.status(500).json({ respuesta: "IA ocupada, intenta luego." }); }
});

// --- COMPLETAR TAREA ---
app.post('/completar-tarea', async (req, res) => {
  const { materiaId, tareaId, completada } = req.body;
  try {
    const materia = await Materia.findById(materiaId);
    const tarea = materia.tareas.id(tareaId);
    tarea.completada = completada;
    await materia.save();
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send({ message: "Error al actualizar estado" });
  }
});

// --- EDITAR TAREA ---
app.post('/editar-tarea', async (req, res) => {
  const { materiaId, tareaId, nuevaDescripcion, nuevaFecha } = req.body;
  try {
    const materia = await Materia.findById(materiaId);
    const tarea = materia.tareas.id(tareaId);
    if (nuevaDescripcion) tarea.descripcion = nuevaDescripcion;
    if (nuevaFecha) tarea.fecha = nuevaFecha;
    await materia.save();
    res.sendStatus(200);
  } catch (e) {
    res.status(500).send({ message: "Error al editar tarea" });
  }
});

// --- GOOGLE VERIFICACIÓN ---
app.get("/google74ea19ac0f79b1ad.html", (req, res) => {
  res.send("google-site-verification: google74ea19ac0f79b1ad.html");
});

// --- RECORDATORIOS AUTOMÁTICOS ---
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function enviarCorreo(destinatario, asunto, mensaje) {
  await transporter.sendMail({ from: process.env.EMAIL_USER, to: destinatario, subject: asunto, text: mensaje });
}

async function enviarSMS(numero, mensaje) {
  await twilio.messages.create({ body: mensaje, from: process.env.TWILIO_PHONE, to: numero });
}

cron.schedule("0 8 * * *", async () => {
  const materias = await Materia.find();
  for (const materia of materias) {
    for (const tarea of materia.tareas) {
      const fechaTarea = new Date(tarea.fecha);
      const hoy = new Date();
      const diferencia = (fechaTarea - hoy) / (1000 * 60 * 60 * 24);

      if (diferencia <= 1 && !tarea.completada) {
        if (materia.user.includes("@")) {
          await enviarCorreo(materia.user, "Recordatorio de tarea", `No olvides: ${tarea.descripcion} para ${tarea.fecha}`);
        } else {
          await enviarSMS(materia.user, `Recordatorio: ${tarea.descripcion} para ${tarea.fecha}`);
        }
      }
    }
  }
});

// --- INICIO DEL SERVIDOR ---
app.listen(PORT, () => console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`));
