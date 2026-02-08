require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const cron = require('node-cron');
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("¡Conectado a MongoDB con éxito!"))
    .catch(err => console.error("Error al conectar BD:", err));

// --- ESQUEMAS ---

// Nuevo: Modelo de Usuario para contraseñas personalizadas
const UsuarioSchema = new mongoose.Schema({
    identificador: { type: String, unique: true }, // Correo o Teléfono
    password: { type: String, default: "UES2026" }
});
const Usuario = mongoose.model('Usuario', UsuarioSchema);

const MateriaSchema = new mongoose.Schema({
    emailEstudiante: String,
    nombre: String, 
    tareas: [{
        descripcion: String, 
        fecha: String,
        completada: { type: Boolean, default: false }, // Nuevo: Estado de la tarea
        recordatorioEnviado: { type: Boolean, default: false }
    }]
});
const Materia = mongoose.model('Materia', MateriaSchema);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// --- RUTAS DE USUARIO ---

app.post('/verificar-codigo', async (req, res) => {
    const { email, codigo } = req.body;
    try {
        let user = await Usuario.findOne({ identificador: email });
        if (!user) {
            // Si no existe, lo creamos con la contraseña por defecto
            user = new Usuario({ identificador: email });
            await user.save();
        }

        if (user.password === codigo) {
            res.status(200).send({ message: 'Acceso concedido', redirect: '/home.html' });
        } else {
            res.status(400).send({ message: 'Contraseña incorrecta' });
        }
    } catch (error) {
        res.status(500).send({ message: 'Error en el servidor' });
    }
});

app.post('/cambiar-password', async (req, res) => {
    const { email, nuevaPassword } = req.body;
    await Usuario.findOneAndUpdate({ identificador: email }, { password: nuevaPassword });
    res.status(200).send({ message: 'Contraseña actualizada' });
});

// --- RUTAS DE TAREAS ---

app.post('/completar-tarea', async (req, res) => {
    const { materiaId, tareaId } = req.body;
    const materia = await Materia.findById(materiaId);
    const tarea = materia.tareas.id(tareaId);
    tarea.completada = true;
    await materia.save();
    res.status(200).send({ message: 'Tarea completada' });
});

// (Mantén tus rutas de agregar-materia, agregar-tarea y obtener-materias igual que antes)
// NOTA: En obtener-materias, el filtro ya separa por emailEstudiante, así que cada quien ve lo suyo.

app.get('/obtener-materias/:email', async (req, res) => {
    try {
        const materias = await Materia.find({ emailEstudiante: req.params.email });
        res.json(materias);
    } catch (error) {
        res.status(500).send({ message: "Error" });
    }
});

app.post('/agregar-materia', async (req, res) => {
    const { email, nombreMateria } = req.body;
    const nueva = new Materia({ emailEstudiante: email, nombre: nombreMateria, tareas: [] });
    await nueva.save();
    res.status(200).send({ message: 'Ok' });
});

app.post('/agregar-tarea', async (req, res) => {
    const { materiaId, descripcion, fecha } = req.body;
    const materia = await Materia.findById(materiaId);
    materia.tareas.push({ descripcion, fecha });
    await materia.save();
    res.status(200).send({ message: 'Ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR EN PUERTO ${PORT}`);
});
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Configurar la IA con tu llave del .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Ruta para que la IA ayude al alumno
app.post('/ia-asistente', async (req, res) => {
    const { mensaje } = req.body;
    try {
        const prompt = `Eres un asistente académico de la UES. Ayuda al estudiante con lo siguiente: ${mensaje}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const texto = response.text();
        
        res.status(200).send({ respuesta: texto });
    } catch (error) {
        console.error("Error con Gemini:", error);
        res.status(500).send({ message: "La IA está descansando, intenta más tarde." });
    }
});