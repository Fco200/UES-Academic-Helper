require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const nodemailer = require("nodemailer"); // Única declaración necesaria

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE CORREO (CREDENCIALES INTEGRADAS) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'carlosfrancoaguayo44@gmail.com',
        pass: 'vfmt npdw sovp nvfe' // Tu contraseña de aplicación de Google
    }
});

// Objeto para códigos temporales de recuperación
let codigosTemporales = {}; 

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, "public")));

// --- CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI || "mongodb+srv://franciscoaguayo2005_db_user:UesSoftware2026@sistemasues.xarpn9k.mongodb.net/SistemasUES")
  .then(() => console.log("✅ SISTEMA CONECTADO A MONGODB"))
  .catch(err => console.error("❌ ERROR DE CONEXIÓN:", err));

// --- MODELOS DE DATOS ---
const UsuarioSchema = new mongoose.Schema({
    identificador: { type: String, unique: true },
    password: { type: String, default: "UES2026" },
    universidad: { type: String, default: "UES" },
    carrera: { type: String, default: "Ingeniería en Software" },
    foto: { type: String, default: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png" },
    nombreReal: { type: String, default: "Estudiante UES" },
    telefono: { type: String, default: "" },
    biografia: { type: String, default: "" },
    semestre: { type: String, default: "1" },
    linkedin: { type: String, default: "" },
    genero: { type: String, default: "No especificado" },
    ultimoAcceso: { type: String, default: "Nunca" }
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

// --- RUTAS DE RECUPERACIÓN ---

app.post('/solicitar-recuperacion', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await Usuario.findOne({ identificador: email.toLowerCase().trim() });
        if (!user) return res.status(404).json({ message: "Correo no encontrado" });

        const codigo = Math.floor(100000 + Math.random() * 900000).toString();
        codigosTemporales[email] = codigo;

        const mailOptions = {
            from: '"Soporte UES Helper" <carlosfrancoaguayo44@gmail.com>',
            to: email,
            subject: 'Tu Código de Recuperación: ' + codigo,
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; text-align: center;">
                    <h2 style="color: #800000;">UES HELPER</h2>
                    <p>Hola <b>${user.nombreReal}</b>, usa el siguiente código para restablecer tu contraseña:</p>
                    <h1 style="background: #f8f9fa; padding: 10px; letter-spacing: 10px; color: #800000; border-radius: 5px;">${codigo}</h1>
                    <p style="color: #666; font-size: 0.8rem;">Este código es temporal.</p>
                </div>`
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Error al enviar el correo" });
    }
});

app.post('/confirmar-recuperacion', async (req, res) => {
    const { email, codigo, nuevaPass } = req.body;
    if (codigosTemporales[email] === codigo) {
        try {
            await Usuario.findOneAndUpdate({ identificador: email }, { password: nuevaPass });
            delete codigosTemporales[email];
            res.status(200).json({ success: true });
        } catch (e) {
            res.status(500).json({ message: "Error al actualizar la contraseña" });
        }
    } else {
        res.status(400).json({ message: "Código incorrecto o expirado" });
    }
});

// --- RUTAS DE AUTENTICACIÓN ---

app.post('/verificar-codigo', async (req, res) => {
    const { email, codigo, carrera, universidad } = req.body;
    try {
        const idLower = email.toLowerCase().trim();
        
        // EXCEPCIÓN MAESTRA PARA FRANCISCO
        if (idLower === "franciscoaguayo2005@gmail.com" && codigo === "VILLA1") {
            return res.json({ 
                success: true, 
                redirect: '/home.html', 
                nombreUsuario: "Francisco Aguayo (Admin)"
            });
        }

        let usuario = await Usuario.findOne({ identificador: idLower });
        if (!usuario) {
            usuario = await Usuario.create({ 
                identificador: idLower, 
                password: "UES2026", 
                carrera: carrera || "Ingeniería", 
                universidad: universidad || "UES",
                nombreReal: "Estudiante UES" 
            });
        }

        if (usuario.password === codigo) {
            const ahora = new Date().toLocaleString('es-MX', { timeZone: 'America/Hermosillo' });
            usuario.ultimoAcceso = ahora;
            await usuario.save();

            res.json({ 
                success: true, 
                redirect: '/home.html',
                nombreUsuario: usuario.nombreReal 
            });
        } else {
            res.status(401).json({ success: false, message: "Clave incorrecta" });
        }
    } catch (e) { 
        res.status(500).json({ success: false }); 
    }
});

app.get('/obtener-usuario/:email', async (req, res) => {
    try {
        const usuario = await Usuario.findOne({ identificador: req.params.email.toLowerCase().trim() });
        usuario ? res.json(usuario) : res.status(404).send("No encontrado");
    } catch (e) { res.status(500).send("Error"); }
});

// --- RUTAS DE GESTIÓN (CRUD) ---

app.get('/obtener-materias/:identificador', async (req, res) => {
    try {
        const datos = await Materia.find({ user: req.params.identificador.toLowerCase() });
        res.json(datos);
    } catch (e) { res.status(500).json([]); }
});

app.post('/agregar-materia', async (req, res) => {
    try {
        await Materia.create({ user: req.body.email.toLowerCase(), nombre: req.body.nombre, tareas: [] });
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e); }
});

app.post('/agregar-tarea', async (req, res) => {
    try {
        const materia = await Materia.findById(req.body.materiaId);
        materia.tareas.push({ descripcion: req.body.descripcion, fecha: req.body.fecha });
        await materia.save();
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e); }
});

app.post('/actualizar-perfil-completo', async (req, res) => {
    const { email, nombreReal, genero, semestre, telefono, linkedin, biografia, foto } = req.body;
    try {
        await Usuario.findOneAndUpdate(
            { identificador: email.toLowerCase().trim() },
            { nombreReal, genero, semestre, telefono, linkedin, biografia, foto }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- INICIO DEL SERVIDOR ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'bienvenida.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`);
});