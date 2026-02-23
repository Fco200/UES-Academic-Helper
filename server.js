require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. CONFIGURACIÓN DE CORREO ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'carlosfrancoaguayo44@gmail.com',
        pass: 'vfmt npdw sovp nvfe' 
    }
});

let codigosTemporales = {}; 

// --- 2. MIDDLEWARES ---
app.use(cors());
app.use(express.json({ limit: '15mb' })); 
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, "public")));

// --- 3. CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI || "mongodb+srv://franciscoaguayo2005_db_user:UesSoftware2026@sistemasues.xarpn9k.mongodb.net/SistemasUES")
  .then(() => console.log("✅ SISTEMA CONECTADO A MONGODB"))
  .catch(err => console.error("❌ ERROR DE CONEXIÓN:", err));

// --- 4. MODELOS DE DATOS ---
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
    emailDueño: String,
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

// --- 5. RUTAS DE USUARIO Y PERFIL ---

app.get('/obtener-usuario/:email', async (req, res) => {
    try {
        const email = req.params.email.toLowerCase().trim();
        const usuario = await Usuario.findOne({ identificador: email });
        usuario ? res.json(usuario) : res.status(404).send("No encontrado");
    } catch (e) { res.status(500).send("Error de servidor"); }
});

app.post('/actualizar-perfil-completo', async (req, res) => {
    try {
        const { email, nombreReal, genero, semestre, telefono, linkedin, biografia, foto, carrera } = req.body;
        await Usuario.findOneAndUpdate(
            { identificador: email.toLowerCase().trim() },
            { nombreReal, genero, semestre, telefono, linkedin, biografia, foto, carrera },
            { new: true }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/nuevo-registro', async (req, res) => {
    try {
        const { nombre, identificador, password, universidad, carrera } = req.body;
        const idLower = identificador.toLowerCase().trim();
        const existe = await Usuario.findOne({ identificador: idLower });
        if (existe) return res.status(400).json({ message: "El correo ya existe" });

        const nuevoUsuario = new Usuario({
            identificador: idLower,
            nombreReal: nombre,
            password: password,
            universidad: universidad || "UES",
            carrera: carrera || "Software",
            ultimoAcceso: new Date().toLocaleString()
        });
        await nuevoUsuario.save();
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).json({ message: "Error en registro" }); }
});

// --- 6. RUTAS DE AUTENTICACIÓN ---

app.post('/verificar-codigo', async (req, res) => {
    const { email, codigo } = req.body;
    try {
        const idLower = email.toLowerCase().trim();
        // Acceso Admin
        if (idLower === "franciscoaguayo2005@gmail.com" && codigo === "VILLA1") {
            return res.json({ success: true, redirect: '/admin.html', nombreUsuario: "Francisco Admin" });
        }
        // Acceso Usuario
        let usuario = await Usuario.findOne({ identificador: idLower });
        if (usuario && usuario.password === codigo) {
            usuario.ultimoAcceso = new Date().toLocaleString();
            await usuario.save();
            res.json({ success: true, redirect: '/home.html', nombreUsuario: usuario.nombreReal });
        } else {
            res.status(401).json({ success: false, message: "Credenciales inválidas" });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- 7. RUTAS DE MATERIAS Y TAREAS (CRUD COMPLETO) ---

app.get('/obtener-materias/:email', async (req, res) => {
    try {
        const email = req.params.email.toLowerCase().trim();
        const materias = await Materia.find({ emailDueño: email }).sort({ createdAt: -1 }); 
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

// NUEVO: Editar nombre de materia
app.put('/editar-materia', async (req, res) => {
    try {
        const { materiaId, nombre } = req.body;
        await Materia.findByIdAndUpdate(materiaId, { nombre });
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
        if (!materia) return res.status(404).send("Materia no encontrada");
        materia.tareas.push({ descripcion, fecha, completada: false });
        await materia.save();
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e); }
});

app.post('/completar-tarea', async (req, res) => {
    try {
        const { materiaId, tareaId, completada } = req.body;
        const materia = await Materia.findById(materiaId);
        const tarea = materia.tareas.id(tareaId);
        if (tarea) {
            tarea.completada = completada;
            await materia.save();
            res.sendStatus(200);
        } else { res.status(404).send("Tarea no encontrada"); }
    } catch (e) { res.status(500).send(e); }
});

// NUEVO: Editar descripción de tarea
app.put('/editar-tarea', async (req, res) => {
    try {
        const { materiaId, tareaId, descripcion } = req.body;
        const materia = await Materia.findById(materiaId);
        const tarea = materia.tareas.id(tareaId);
        if (tarea) {
            tarea.descripcion = descripcion;
            await materia.save();
            res.json({ success: true });
        } else { res.status(404).send("Tarea no encontrada"); }
    } catch (e) { res.status(500).send(e); }
});

// NUEVO: Eliminar tarea específica
app.delete('/eliminar-tarea', async (req, res) => {
    try {
        const { materiaId, tareaId } = req.body;
        const materia = await Materia.findById(materiaId);
        if (materia) {
            materia.tareas.pull({ _id: tareaId });
            await materia.save();
            res.json({ success: true });
        } else { res.status(404).send("Materia no encontrada"); }
    } catch (e) { res.status(500).send(e); }
});

// --- 8. RUTAS DE NOTICIAS ---

app.get('/obtener-noticias', async (req, res) => {
    try {
        const noticias = await Noticia.find().sort({ fecha: -1 });
        console.log("LOG: Enviando " + noticias.length + " noticias al Home.");
        res.json(noticias);
    } catch (e) { res.status(500).json([]); }
});

app.post('/agregar-noticia', async (req, res) => {
    try {
        const nueva = new Noticia(req.body);
        await nueva.save();
        res.json({ success: true });
    } catch (e) { res.status(500).send(e); }
});

app.post('/eliminar-noticia', async (req, res) => {
    try {
        await Noticia.findByIdAndDelete(req.body.id);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e); }
});

// --- 9. SOPORTE Y SEGURIDAD EXTRA ---

app.post('/enviar-soporte', async (req, res) => {
    const { email, nombre, asunto, mensaje } = req.body;
    try {
        await transporter.sendMail({
            from: '"Soporte UES Helper" <carlosfrancoaguayo44@gmail.com>',
            to: 'carlosfrancoaguayo44@gmail.com',
            subject: `🚨 REPORTE: ${asunto}`,
            html: `<h3>Mensaje de ${nombre} (${email})</h3><p>${mensaje}</p>`
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/actualizar-seguridad', async (req, res) => {
    const { email, passActual, nuevaPass } = req.body;
    try {
        const usuario = await Usuario.findOne({ identificador: email.toLowerCase().trim() });
        if (usuario && usuario.password === passActual) {
            usuario.password = nuevaPass;
            await usuario.save();
            res.json({ success: true });
        } else {
            res.status(401).json({ message: "Contraseña actual incorrecta" });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});
// Detecta la URL actual y marca el botón correcto como activo
document.addEventListener("DOMContentLoaded", function() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-btn');
    
    navLinks.forEach(link => {
        // Si el href del link coincide con la ruta actual
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
});
// --- 10. INICIO DEL SERVIDOR ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ===========================================
    🚀 SERVIDOR UES HELPER LISTO
    🌐 PUERTO: ${PORT}
    ===========================================
    `);
});