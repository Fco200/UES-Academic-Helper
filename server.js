require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONEXIÓN ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Conexión establecida con MongoDB Atlas"))
    .catch(err => console.error("❌ Error de conexión:", err));

// --- IA CONFIG ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- MODELOS ---
const Usuario = mongoose.model('Usuario', new mongoose.Schema({
    identificador: { type: String, unique: true, required: true },
    password: { type: String, default: "UES2026" },
    esNuevo: { type: Boolean, default: true }
}));

const Materia = mongoose.model('Materia', new mongoose.Schema({
    emailEstudiante: String,
    nombre: String,
    tipo: String, // 'Escuela' o 'Personal'
    tareas: [{
        descripcion: String,
        fecha: String,
        completada: { type: Boolean, default: false }
    }]
}));

// --- RUTAS CRÍTICAS ---

// Login con Validación
app.post('/verificar-codigo', async (req, res) => {
    const { email, codigo } = req.body;
    try {
        let user = await Usuario.findOne({ identificador: email });
        if (!user) {
            user = new Usuario({ identificador: email });
            await user.save();
        }
        if (user.password === codigo) {
            res.status(200).send({ message: 'OK', redirect: '/home.html' });
        } else {
            res.status(401).send({ message: 'Credenciales incorrectas' });
        }
    } catch (e) { res.status(500).send({ message: 'Error en BD' }); }
});

// Cambio de Contraseña (Borra la fija)
app.post('/cambiar-password', async (req, res) => {
    const { email, nuevaPassword } = req.body;
    try {
        await Usuario.findOneAndUpdate({ identificador: email }, { password: nuevaPassword, esNuevo: false });
        res.status(200).send({ message: 'Contraseña actualizada' });
    } catch (e) { res.status(500).send({ message: 'Error' }); }
});

// Persistencia de Materias/Notas
app.post('/agregar-materia', async (req, res) => {
    const { email, nombreMateria, tipo } = req.body;
    const nueva = new Materia({ emailEstudiante: email, nombre: nombreMateria, tipo });
    await nueva.save();
    res.status(200).send({ message: 'Guardado' });
});

app.get('/obtener-materias/:email', async (req, res) => {
    const materias = await Materia.find({ emailEstudiante: req.params.email });
    res.json(materias);
});

// IA Resumen de Inicio
app.post('/ia-resumen', async (req, res) => {
    const { tareas } = req.body;
    const prompt = `Tengo estas tareas pendientes en la UES: ${tareas.join(', ')}. Dame un consejo de 10 palabras y prioriza una.`;
    const result = await model.generateContent(prompt);
    res.json({ respuesta: result.response.text() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Puerto: ${PORT}`));