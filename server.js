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
// Ruta raíz: Lo primero que verá el usuario al abrir la web
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'bienvenida.html'));
});

// 2. MIDDLEWARES 
app.use(cors());
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, "public")));

// 3. CONFIGURACIÓN DE CORREO (NODEMAILER)
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Puerto 587 usa false
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: { rejectUnauthorized: false }
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
    const { email, codigo, carrera, universidad } = req.body;
    try {
        const idLower = email.toLowerCase().trim();
        let usuario = await Usuario.findOne({ identificador: idLower });

        // Si el usuario no existe, lo creamos
        if (!usuario) {
            usuario = await Usuario.create({ 
                identificador: idLower, 
                password: "UES2026", 
                carrera: carrera || "Ingeniería", 
                universidad: universidad || "UES",
                nombreReal: "Estudiante UES" 
            });
            
            // IMPORTANTE: Quitamos el 'await' para que el login no se congele 
            // si hay errores de conexión con el puerto 465/587
            enviarCorreoBienvenida(idLower, "Estudiante"); 
        }

        if (usuario.password === codigo) {
            res.json({ 
                success: true, 
                redirect: '/home.html',
                nombreUsuario: usuario.nombreReal 
            });
        } else {
            res.status(401).json({ success: false, message: "Clave incorrecta" });
        }
    } catch (e) { 
        console.error("Error Login:", e);
        res.status(500).json({ success: false }); 
    }
});

app.get('/obtener-usuario/:email', async (req, res) => {
    try {
        // Buscamos al usuario de forma exacta por su correo
        const usuario = await Usuario.findOne({ identificador: req.params.email.toLowerCase().trim() });
        
        if (usuario) {
            // Enviamos los datos reales guardados en la base de datos
            res.json(usuario);
        } else {
            res.status(404).json({ message: "Usuario no encontrado" });
        }
    } catch (e) { 
        console.error("Error al obtener usuario:", e);
        res.status(500).send("Error de servidor"); 
    }
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
    const { email, nuevoEmail, nombreReal, foto, telefono, biografia, cumpleanos } = req.body;
    try {
        await Usuario.findOneAndUpdate(
            { identificador: email.toLowerCase() },
            { 
                identificador: nuevoEmail, // Actualizamos el identificador
                nombreReal, 
                foto, 
                telefono, 
                biografia, 
                cumpleanos 
            }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/enviar-sugerencia', async (req, res) => {
    const { nombre, email, mensaje, tipo } = req.body; // Añadimos 'tipo'
    try {
        await transporter.sendMail({
            from: `"Soporte UES Helper" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER, 
            subject: `[${tipo}] - Mensaje de ${nombre}`,
            html: `
                <div style="font-family: sans-serif; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                    <h3 style="color: #800000;">Nueva Solicitud de Soporte</h3>
                    <p><strong>Usuario:</strong> ${nombre} (${email})</p>
                    <p><strong>Categoría:</strong> ${tipo}</p>
                    <hr>
                    <p><strong>Mensaje:</strong></p>
                    <p style="background: #f9f9f9; padding: 15px; border-radius: 5px;">${mensaje}</p>
                </div>`
        });
        res.json({ success: true });
    } catch (e) {
        console.error("Error en soporte:", e);
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

async function enviarCorreoBienvenida(email, nombre) {
    try {
        await transporter.sendMail({
            // Corrección de las comillas y el formato del remitente
            from: `"UES Helper" <${process.env.EMAIL_USER}>`, 
            to: email,
            subject: "¡Bienvenido al Portal Académico!",
            text: `Hola ${nombre}, tu cuenta ha sido activada con éxito.`
        });
        console.log("✅ Correo de bienvenida enviado a:", email);
    } catch (e) { 
        console.error("❌ Error envío bienvenida:", e); 
    }
}
app.post('/nuevo-registro', async (req, res) => {
    const { nombre, identificador, password, universidad, carrera, telefono } = req.body;
    try {
        const idLower = identificador.toLowerCase().trim();
        const existe = await Usuario.findOne({ identificador: idLower });
        
        if (existe) {
            return res.status(400).json({ success: false, message: "Este usuario ya existe." });
        }

        // Creamos el perfil completo desde el primer momento
        const nuevoUsuario = await Usuario.create({
            identificador: idLower,
            password: password, // Contraseña personalizada del usuario
            nombreReal: nombre,
            universidad: universidad || "UES",
            carrera: carrera || "Ingeniería",
            telefono: telefono || ""
        });

        // Enviamos correo de bienvenida (sin bloquear la respuesta)
        enviarCorreoBienvenida(idLower, nombre);

        res.json({ success: true, message: "Cuenta creada con éxito" });
    } catch (e) {
        console.error("Error en registro:", e);
        res.status(500).json({ success: false });
    }
});

// 4. INICIO DEL SERVIDOR
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`);
});