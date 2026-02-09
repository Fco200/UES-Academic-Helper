require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 1. INICIALIZACIÓN
const app = express();
const PORT = process.env.PORT || 3000;

// 2. MIDDLEWARES (Límites aumentados para las fotos de perfil)
app.use(cors());
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, "public")));

// --- CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ SISTEMA CONECTADO A MONGODB"))
  .catch(err => console.error("❌ ERROR DE CONEXIÓN:", err));

// --- MODELOS DE DATOS ---
const UsuarioSchema = new mongoose.Schema({
    identificador: { type: String, unique: true },
    password: { type: String, default: "UES2026" },
    carrera: { type: String, default: "Ingeniería en Software" },
    foto: { type: String, default: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png" },
    nombreReal: { type: String, default: "Estudiante UES" },
    telefono: { type: String, default: "" },
    biografia: { type: String, default: "" },
    cumpleanos: { type: String, default: "" }
});
const Usuario = mongoose.model('Usuario', UsuarioSchema);

const Noticia = mongoose.model('Noticia', new mongoose.Schema({
    titulo: String,
    contenido: String,
    imagen: String,
    fecha: { type: Date, default: Date.now }
}));

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

// --- RUTAS DE AUTENTICACIÓN ---

app.post('/verificar-codigo', async (req, res) => {
    const { email, codigo, carrera } = req.body;
    try {
        const idLower = email.toLowerCase();
        let usuario = await Usuario.findOne({ identificador: idLower });
        if (!usuario) {
            usuario = await Usuario.create({ identificador: idLower, password: "UES2026", carrera });
        }
        if (usuario.password === codigo) {
            usuario.carrera = carrera;
            await usuario.save();
            const destino = (codigo === "UES2026") ? '/dashboard.html?fuerzaCambio=true' : '/home.html';
            res.json({ success: true, redirect: destino, carrera: usuario.carrera });
        } else {
            res.status(401).json({ success: false, message: "Código incorrecto" });
        }
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/obtener-usuario/:email', async (req, res) => {
    try {
        const usuario = await Usuario.findOne({ identificador: req.params.email.toLowerCase() });
        usuario ? res.json(usuario) : res.status(404).send("No encontrado");
    } catch (e) { res.status(500).send(e); }
});

// --- RUTA CORREGIDA: ACTUALIZAR PERFIL ---
app.post('/actualizar-perfil-completo', async (req, res) => {
    const { email, nombreReal, foto, telefono, biografia, cumpleanos } = req.body;
    try {
        // El { new: true } es vital para que MongoDB devuelva y confirme el dato actualizado
        const usuarioActualizado = await Usuario.findOneAndUpdate(
            { identificador: email.toLowerCase() },
            { nombreReal, foto, telefono, biografia, cumpleanos },
            { new: true }
        );
        if (usuarioActualizado) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: "Usuario no encontrado" });
        }
    } catch (e) { 
        console.error("Error al actualizar:", e);
        res.status(500).json({ success: false }); 
    }
});

// --- RUTAS DE NOTICIAS ---

app.get('/obtener-noticias', async (req, res) => {
    try {
        const noticias = await Noticia.find().sort({ fecha: -1 });
        res.json(noticias);
    } catch (e) { res.status(500).json([]); }
});

app.post('/publicar-noticia-secreta', async (req, res) => {
    const { titulo, contenido, imagen, passwordAdmin } = req.body;
    if (passwordAdmin !== "UES_ADMIN_2026") { 
        return res.status(403).json({ success: false, message: "Acceso denegado" });
    }
    try {
        const nueva = new Noticia({ titulo, contenido, imagen });
        await nueva.save();
        res.json({ success: true, message: "Noticia publicada" });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- RUTAS DE GESTIÓN (CRUD) ---

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

app.post('/ia-asistente', async (req, res) => {
    const { prompt } = req.body;
    try {
        if (!model) throw new Error("IA no configurada");
        const result = await model.generateContent(prompt);
        res.json({ respuesta: result.response.text() });
    } catch (e) { res.status(500).json({ respuesta: "IA no disponible." }); }
});

// --- INICIO DEL SERVIDOR ---
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`));