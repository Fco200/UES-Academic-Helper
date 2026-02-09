require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const nodemailer = require("nodemailer");

// 1. INICIALIZACIÓN DE LA APP
const app = express();
const PORT = process.env.PORT || 3000;

// 2. MIDDLEWARES 
app.use(cors());
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, "public")));

// 3. CONFIGURACIÓN DE CORREO (NODEMAILER)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // Contraseña de aplicación de 16 letras
    }
});

// --- CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI)
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
    const { email, codigo } = req.body;
    try {
        const idLower = email.toLowerCase().trim();
        const usuario = await Usuario.findOne({ identificador: idLower });

        if (usuario && usuario.password === codigo) {
            // Enviamos el nombre real para que el Front-end lo use
            res.json({ 
                success: true, 
                redirect: '/home.html',
                nombreUsuario: usuario.nombreReal || "Estudiante"
            });
        } else {
            res.status(401).json({ success: false, message: "Datos incorrectos" });
        }
    } catch (e) { res.status(500).json({ success: false }); }
}); 

app.get('/obtener-usuario/:email', async (req, res) => {
    try {
        let usuario = await Usuario.findOne({ identificador: req.params.email.toLowerCase() });
        if (usuario) {
            // Si el nombre es el de fábrica, lo personalizamos
            if (usuario.nombreReal === "Estudiante UES") {
                usuario.nombreReal = "Francisco (Admin)"; 
            }
            res.json(usuario);
        } else {
            res.status(404).send("No encontrado");
        }
    } catch (e) { res.status(500).send(e); }
});

app.post('/cambiar-password', async (req, res) => {
    const { email, nuevaPassword } = req.body;
    try {
        if (nuevaPassword === "UES2026") {
            return res.status(400).json({ message: "Debes elegir una clave distinta a la inicial." });
        }
        await Usuario.findOneAndUpdate(
            { identificador: email.toLowerCase() }, 
            { password: nuevaPassword } 
        );
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).json({ message: "Error" }); }
});

// --- RUTA: ENVIAR CONTRASEÑA ACTUAL POR CORREO ---
app.post('/recuperar-password', async (req, res) => {
    const { email } = req.body;
    try {
        const usuario = await Usuario.findOne({ identificador: email.toLowerCase().trim() });
        
        if (!usuario) {
            return res.status(404).json({ success: false, message: "El correo no está registrado." });
        }

        // Enviamos el correo con la contraseña actual
        await transporter.sendMail({
            from: `"Soporte UES Helper" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Recuperación de Acceso - UES",
            html: `
                <div style="font-family: sans-serif; border-top: 5px solid #800000; padding: 20px;">
                    <h2 style="color: #800000;">Hola, ${usuario.nombreReal}</h2>
                    <p>Has solicitado recuperar tu acceso al portal académico.</p>
                    <p>Tu contraseña actual es: <strong style="font-size: 1.2rem;">${usuario.password}</strong></p>
                    <p>Por seguridad, cámbiala en cuanto logres ingresar.</p>
                </div>`
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// --- RUTAS DE PERFIL Y SOPORTE ---

app.post('/actualizar-perfil-completo', async (req, res) => {
    const { email, nombreReal, foto, telefono, biografia, cumpleanos } = req.body;
    try {
        await Usuario.findOneAndUpdate(
            { identificador: email.toLowerCase() },
            { nombreReal, foto, telefono, biografia, cumpleanos },
            { new: true }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/enviar-sugerencia', async (req, res) => {
    const { nombre, email, mensaje } = req.body;
    try {
        await transporter.sendMail({
            from: `"Buzón UES" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: `Feedback de: ${nombre}`,
            text: `Usuario: ${email}\n\nMensaje:\n${mensaje}`
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
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
    if (passwordAdmin !== "UES_ADMIN_2026") return res.status(403).send("Prohibido");
    try {
        const nueva = new Noticia({ titulo, contenido, imagen });
        await nueva.save();
        res.json({ success: true });
    } catch (e) { res.status(500).send(e); }
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

app.post('/completar-tarea', async (req, res) => {
    try {
        const materia = await Materia.findById(req.body.materiaId);
        const tarea = materia.tareas.id(req.body.tareaId);
        tarea.completada = !!req.body.completada;
        await materia.save();
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e); }
});

// --- IA ASISTENTE ---
app.post('/ia-asistente', async (req, res) => {
    try {
        const result = await model.generateContent(req.body.prompt);
        res.json({ respuesta: result.response.text() });
    } catch (e) { res.status(500).json({ respuesta: "IA no disponible." }); }
});

// --- FUNCIONES AUXILIARES ---
async function enviarCorreoBienvenida(email, nombre) {
    try {
        await transporter.sendMail({
            from: '"UES Helper" <' + process.env.EMAIL_USER + '>',
            to: email,
            subject: "¡Bienvenido al Portal Académico!",
            text: `Hola ${nombre}, tu cuenta ha sido activada con éxito.`
        });
    } catch (e) { console.error("Error envío bienvenida:", e); }
}

// 4. INICIO DEL SERVIDOR
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`);
});