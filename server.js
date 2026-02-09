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

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- CONEXIÓN A MONGODB (Usando Mongoose únicamente) ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ SISTEMA CONECTADO A MONGODB"))
  .catch(err => console.error("❌ ERROR DE CONEXIÓN:", err));

// --- MODELOS DE DATOS ---
const UsuarioSchema = new mongoose.Schema({
    identificador: { type: String, unique: true },
    password: { type: String, default: "UES2026" },
    carrera: { type: String, default: "Ingeniería en Software" }
});
const Usuario = mongoose.model('Usuario', UsuarioSchema);

const Materia = mongoose.model('Materia', new mongoose.Schema({
    user: String,
    nombre: String,
    tareas: [{ descripcion: String, fecha: String, completada: { type: Boolean, default: false } }]
}, { timestamps: true }));

// --- CONFIGURACIÓN DE IA GEMINI ---
let model;
try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
} catch (e) { console.warn('IA Gemini no configurada.'); }

// --- CONFIGURACIÓN DE CORREO ---
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// --- RUTAS DE AUTENTICACIÓN ---

app.post('/verificar-codigo', async (req, res) => {
    const { email, codigo, carrera } = req.body;
    try {
        const idLower = email.toLowerCase();
        let usuario = await Usuario.findOne({ identificador: idLower });

        // Si no existe, lo creamos (Registro automático)
        if (!usuario) {
            usuario = await Usuario.create({ identificador: idLower, password: "UES2026", carrera });
        }

        if (usuario.password === codigo) {
            // Actualizamos la carrera por si la cambió en el combo box
            usuario.carrera = carrera;
            await usuario.save();

            const destino = (codigo === "UES2026") ? '/dashboard.html?fuerzaCambio=true' : '/home.html';
            res.json({ success: true, redirect: destino, carrera: usuario.carrera });
        } else {
            res.status(401).json({ success: false, message: "Código incorrecto" });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/obtener-usuario/:email', async (req, res) => {
    try {
        const usuario = await Usuario.findOne({ identificador: req.params.email.toLowerCase() });
        usuario ? res.json(usuario) : res.status(404).send("No encontrado");
    } catch (e) { res.status(500).send(e); }
});

app.post('/cambiar-password', async (req, res) => {
    const { email, nuevaPassword } = req.body;
    try {
        await Usuario.findOneAndUpdate({ identificador: email.toLowerCase() }, { password: nuevaPassword });
        res.status(200).send({ message: 'OK' });
    } catch (e) { res.status(500).send({ message: 'Error' }); }
});

// --- RUTAS DE GESTIÓN ACADÉMICA (CRUD) ---

app.get('/obtener-materias/:identificador', async (req, res) => {
    try {
        const id = req.params.identificador.toLowerCase();
        const datos = await Materia.find({ user: id });
        res.json(datos);
    } catch (e) { res.status(500).json([]); }
});

app.post('/agregar-materia', async (req, res) => {
    const { email, nombre } = req.body;
    try {
        await Materia.create({ user: email.toLowerCase(), nombre, tareas: [] });
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e); }
});

app.post('/agregar-tarea', async (req, res) => {
    const { materiaId, descripcion, fecha } = req.body;
    try {
        const materia = await Materia.findById(materiaId);
        materia.tareas.push({ descripcion, fecha });
        await materia.save();
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e); }
});

app.post('/editar-tarea', async (req, res) => {
    const { materiaId, tareaId, nuevaDescripcion, nuevaFecha } = req.body;
    try {
        await Materia.updateOne(
            { _id: materiaId, "tareas._id": tareaId },
            { $set: { "tareas.$.descripcion": nuevaDescripcion, "tareas.$.fecha": nuevaFecha } }
        );
        res.status(200).json({ message: "Éxito" });
    } catch (e) { res.status(500).json({ message: "Error" }); }
});

app.post('/eliminar-tarea', async (req, res) => {
    const { materiaId, tareaId } = req.body;
    try {
        await Materia.updateOne({ _id: materiaId }, { $pull: { tareas: { _id: tareaId } } });
        res.json({ message: "Eliminado" });
    } catch (e) { res.status(500).send(e); }
});

app.post('/completar-tarea', async (req, res) => {
    const { materiaId, tareaId, completada } = req.body;
    try {
        const materia = await Materia.findById(materiaId);
        const tarea = materia.tareas.id(tareaId);
        tarea.completada = !!completada;
        await materia.save();
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e); }
});

// --- IA Y UTILIDADES ---

app.post('/ia-asistente', async (req, res) => {
    const { prompt } = req.body;
    try {
        const result = await model.generateContent(prompt);
        res.json({ respuesta: result.response.text() });
    } catch (e) { res.status(500).json({ respuesta: "IA no disponible." }); }
});

// --- INICIO DEL SERVIDOR ---
app.listen(PORT, () => console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`));