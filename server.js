require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE CORREO ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'carlosfrancoaguayo44@gmail.com',
        pass: 'vfmt npdw sovp nvfe' 
    }
});

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
const Usuario = mongoose.model('Usuario', new mongoose.Schema({
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
}));

const Materia = mongoose.model('Materia', new mongoose.Schema({
    emailDueño: String, // CAMBIO CLAVE: Antes decía 'user'
    nombre: String,
    tareas: [{ 
        descripcion: String, 
        fecha: String, 
        completada: { type: Boolean, default: false } 
    }]
}, { timestamps: true }));

const Noticia = mongoose.model('Noticia', new mongoose.Schema({
    titulo: String,
    contenido: String,
    imagen: String,
    fecha: { type: Date, default: Date.now }
}));

// --- RUTAS DE MATERIAS Y TAREAS ---

app.get('/obtener-materias/:email', async (req, res) => {
    try {
        const emailUsuario = req.params.email.toLowerCase().trim();
        const materias = await Materia.find({ emailDueño: emailUsuario }); 
        res.json(materias);
    } catch (e) { res.status(500).send(e); }
});

app.post('/agregar-materia', async (req, res) => {
    try {
        const { email, nombre } = req.body;
        const nuevaMateria = new Materia({
            nombre: nombre,
            emailDueño: email.toLowerCase().trim(),
            tareas: []
        });
        await nuevaMateria.save();
        res.json({ success: true });
    } catch (e) { res.status(500).send(e); }
});

app.delete('/borrar-materia/:id', async (req, res) => {
    try {
        await Materia.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e); }
});

app.post('/agregar-tarea', async (req, res) => {
    try {
        const { materiaId, descripcion, fecha } = req.body;
        const materia = await Materia.findById(materiaId);
        materia.tareas.push({ descripcion, fecha });
        await materia.save();
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e); }
});

app.post('/completar-tarea', async (req, res) => {
    try {
        const { materiaId, tareaId, completada } = req.body;
        const materia = await Materia.findById(materiaId);
        const tarea = materia.tareas.id(tareaId);
        tarea.completada = completada;
        await materia.save();
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e); }
});

// --- RUTAS DE USUARIO Y SEGURIDAD ---

app.post('/nuevo-registro', async (req, res) => {
    try {
        const { nombre, identificador, password, universidad, carrera } = req.body;
        const idLower = identificador.toLowerCase().trim();
        const existe = await Usuario.findOne({ identificador: idLower });
        if (existe) return res.status(400).json({ message: "El correo ya está registrado" });

        const nuevoUsuario = new Usuario({
            identificador: idLower,
            nombreReal: nombre,
            password: password,
            universidad: universidad || "UES",
            carrera: carrera || "Ingeniería",
            ultimoAcceso: new Date().toLocaleString()
        });
        await nuevoUsuario.save();
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).json({ message: "Error interno" }); }
});

app.post('/verificar-codigo', async (req, res) => {
    const { email, codigo } = req.body;
    try {
        const idLower = email.toLowerCase().trim();
        if (idLower === "franciscoaguayo2005@gmail.com" && codigo === "VILLA1") {
            return res.json({ success: true, redirect: '/admin.html', nombreUsuario: "Francisco Admin" });
        }
        let usuario = await Usuario.findOne({ identificador: idLower });
        if (usuario && usuario.password === codigo) {
            usuario.ultimoAcceso = new Date().toLocaleString();
            await usuario.save();
            res.json({ success: true, redirect: '/home.html', nombreUsuario: usuario.nombreReal });
        } else {
            res.status(401).json({ success: false, message: "Datos incorrectos" });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});
app.get('/obtener-noticias', async (req, res) => {
    try {
        const noticias = await Noticia.find().sort({ fecha: -1 });
        console.log("Noticias enviadas al home:", noticias.length);
        res.json(noticias);
    } catch (e) { 
        console.error("Error al obtener noticias:", e);
        res.status(500).json([]); 
    }
});
app.post('/enviar-soporte', async (req, res) => {
    const { email, nombre, asunto, mensaje } = req.body;
    try {
        await transporter.sendMail({
            from: '"Soporte UES Helper" <carlosfrancoaguayo44@gmail.com>',
            to: 'carlosfrancoaguayo44@gmail.com',
            subject: `🚨 Soporte: ${asunto}`,
            html: `<p><b>De:</b> ${nombre} (${email})</p><p>${mensaje}</p>`
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SERVIDOR EN PUERTO ${PORT}`));