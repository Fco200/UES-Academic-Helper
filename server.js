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

// CONEXIÓN ROBUSTA (Asegúrate de tener 0.0.0.0/0 en MongoDB Atlas)
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => console.log("✅ SISTEMA CONECTADO A MONGODB"))
    .catch(err => console.error("❌ ERROR DE CONEXIÓN:", err));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// MODELOS
const Usuario = mongoose.model('Usuario', new mongoose.Schema({
    identificador: { type: String, unique: true },
    password: { type: String, default: "UES2026" }
}));

const Materia = mongoose.model('Materia', new mongoose.Schema({
    user: String,
    nombre: String,
    tareas: [{ descripcion: String, fecha: String, completada: { type: Boolean, default: false } }]
}));

// RUTAS
app.post('/verificar-codigo', async (req, res) => {
    const { email, codigo } = req.body;
    let user = await Usuario.findOne({ identificador: email });
    if (!user) user = await Usuario.create({ identificador: email });
    
    if (user.password === codigo) res.status(200).send({ redirect: '/dashboard.html' });
    else res.status(401).send({ message: 'Contraseña incorrecta' });
});

app.post('/cambiar-password', async (req, res) => {
    const { email, nuevaPassword } = req.body;
    await Usuario.findOneAndUpdate({ identificador: email }, { password: nuevaPassword });
    res.status(200).send({ message: 'OK' });
});

app.post('/agregar-materia', async (req, res) => {
    const { email, nombre } = req.body;
    await Materia.create({ user: email, nombre, tareas: [] });
    res.sendStatus(200);
});

app.get('/obtener-datos/:email', async (req, res) => {
    const datos = await Materia.find({ user: req.params.email });
    res.json(datos);
});

app.post('/ia-asistente', async (req, res) => {
    const { prompt } = req.body;
    const result = await model.generateContent(prompt);
    res.json({ respuesta: result.response.text() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`));