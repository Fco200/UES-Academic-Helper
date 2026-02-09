require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const nodemailer = require("nodemailer");

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

// Asegúrate de que tu UsuarioSchema tenga: universidad y telefono
app.post('/verificar-codigo', async (req, res) => {
    const { email, codigo, carrera, universidad, telefono } = req.body;
    try {
        const idLower = email.toLowerCase();
        let usuario = await Usuario.findOne({ identificador: idLower });

        // Si es nuevo, lo creamos con todos los datos
        if (!usuario) {
            usuario = await Usuario.create({ 
                identificador: idLower, 
                password: "UES2026", 
                carrera, 
                universidad, 
                telefono 
            });
            
            // OPCIONAL: Enviar correo de bienvenida
            enviarCorreoBienvenida(idLower, nombreReal || "Estudiante");
        }

        if (usuario.password === codigo) {
            const destino = (codigo === "UES2026") ? '/home.html?fuerzaCambio=true' : '/home.html';
            res.json({ success: true, redirect: destino });
        } else {
            res.status(401).json({ success: false });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// Función para enviar correos (Nodemailer)
async function enviarCorreoBienvenida(email, nombre) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    
    await transporter.sendMail({
        from: '"UES Helper" <tu-correo@gmail.com>',
        to: email,
        subject: "¡Bienvenido al Portal Académico!",
        text: `Hola ${nombre}, tu cuenta ha sido activada con éxito en el portal.`
    });
}

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
// --- RUTA PARA ENVIAR CORREOS ---
app.post('/enviar-correo', async (req, res) => {
    const { mensaje, destino, asunto } = req.body;
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: destino,
            subject: asunto,
            text: mensaje
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
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
// --- RUTA PARA ELIMINAR NOTICIA ---
app.post('/eliminar-noticia', async (req, res) => {
    const { id, passwordAdmin } = req.body;
    if (passwordAdmin !== "UES_ADMIN_2026") return res.status(403).json({ success: false });

    try {
        await Noticia.findByIdAndDelete(id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- RUTA PARA EDITAR NOTICIA ---
app.post('/editar-noticia', async (req, res) => {
    const { id, titulo, contenido, imagen, passwordAdmin } = req.body;
    if (passwordAdmin !== "UES_ADMIN_2026") return res.status(403).json({ success: false });

    try {
        await Noticia.findByIdAndUpdate(id, { titulo, contenido, imagen });
        res.json({ success: true });
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
app.post('/cambiar-password', async (req, res) => {
    const { email, nuevaPassword } = req.body;
    try {
        // Validamos que no intente poner la misma UES2026
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


// --- CONFIGURACIÓN DE NODEMAILER ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // Recuerda: Contraseña de Aplicación de 16 letras
    }
});

// --- RUTA: RECUPERACIÓN DE CONTRASEÑA ---
app.post('/recuperar-password', async (req, res) => {
    const { email } = req.body;
    try {
        const usuario = await Usuario.findOne({ identificador: email.toLowerCase() });
        
        if (!usuario) {
            return res.status(404).json({ success: false, message: "El correo no está registrado en el sistema." });
        }

        const info = await transporter.sendMail({
            from: `"Soporte UES Helper" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Recuperación de Acceso - Portal Académico",
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
                    <div style="background: white; padding: 30px; border-radius: 10px; border-top: 5px solid #800000;">
                        <h2 style="color: #800000;">Hola, ${usuario.nombreReal}</h2>
                        <p>Has solicitado recuperar tu contraseña de acceso.</p>
                        <div style="background: #eee; padding: 15px; text-align: center; font-size: 1.5rem; font-weight: bold; color: #333;">
                            ${usuario.password}
                        </div>
                        <p style="margin-top: 20px;">Te recomendamos cambiar tu clave una vez que ingreses al portal.</p>
                    </div>
                </div>`
        });

        res.json({ success: true, message: "Correo enviado con éxito." });
    } catch (e) {
        console.error("Error en recuperación:", e);
        res.status(500).json({ success: false, message: "Error interno al enviar el correo." });
    }
});

// --- RUTA: BUZÓN DE SOPORTE ---
app.post('/enviar-sugerencia', async (req, res) => {
    const { nombre, email, mensaje } = req.body;
    try {
        await transporter.sendMail({
            from: `"Buzón UES" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER, // Te llega a ti
            subject: `Feedback de: ${nombre}`,
            text: `Usuario: ${email}\n\nMensaje:\n${mensaje}`
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});



// --- INICIO DEL SERVIDOR ---
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`));