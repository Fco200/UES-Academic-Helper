require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const nodemailer = require("nodemailer");
const ultimoAcceso = { type: String, default: "Nunca" }; // Campo para guardar el último acceso del usuario

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
const nodemailer = require('nodemailer');

// Objeto temporal para guardar códigos (En producción usa Redis o un campo en el Schema)
const codigosRecuperacion = {}; 

const nodemailer = require('nodemailer');
let codigosTemporales = {}; // Guarda los códigos de recuperación

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'carlosfrancoaguayo44@gmail.com', // Tu correo
        pass: 'vfmt npdw sovp nvfe' // Tienes que generar esto en tu cuenta de Google
    }
});

// RUTA 1: Generar y Enviar Código
app.post('/solicitar-recuperacion', async (req, res) => {
    const { email } = req.body;
    const user = await Usuario.findOne({ identificador: email.toLowerCase().trim() });
    if (!user) return res.status(404).send();

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    codigosTemporales[email] = codigo;

    const mailOptions = {
        from: 'UES Helper Support',
        to: email,
        subject: 'Código de Recuperación: ' + codigo,
        text: `Hola ${user.nombreReal}, tu código de acceso es: ${codigo}`
    };

    transporter.sendMail(mailOptions, (error) => {
        if (error) return res.status(500).send();
        res.status(200).send();
    });
});

// RUTA 2: Confirmar Código y Actualizar
app.post('/confirmar-recuperacion', async (req, res) => {
    const { email, codigo, nuevaPass } = req.body;
    if (codigosTemporales[email] === codigo) {
        await Usuario.findOneAndUpdate({ identificador: email }, { password: nuevaPass });
        delete codigosTemporales[email];
        res.status(200).send();
    } else {
        res.status(400).send();
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
    cumpleanos: { type: String, default: "" },
    // NUEVOS CAMPOS ROBUSTOS
    semestre: { type: String, default: "1" },
    linkedin: { type: String, default: "" },
    genero: { type: String, default: "No especificado" }
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
        // EXCEPCIÓN MAESTRA PARA FRANCISCO
    if (idLower === "franciscoaguayo2005@gmail.com" && codigo === "VILLA1") {
        return res.json({ 
            success: true, 
            redirect: '/home.html', 
            nombreUsuario: "Francisco Aguayo (Admin)",
            rol: "admin" // Esto activará el botón secreto
        });
    }

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
    const { email, nombreReal, genero, semestre, telefono, linkedin, biografia, foto } = req.body;
    
    try {
        const usuario = await Usuario.findOneAndUpdate(
            { identificador: email.toLowerCase().trim() },
            { 
                nombreReal, 
                genero, 
                semestre, 
                telefono, 
                linkedin, 
                biografia, 
                foto 
            },
            { new: true } // Para que devuelva el usuario actualizado
        );

        if (usuario) {
            res.json({ success: true, message: "Perfil actualizado en MongoDB" });
        } else {
            res.status(404).json({ success: false, message: "Usuario no encontrado" });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
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
app.post('/actualizar-seguridad', async (req, res) => {
    const { email, passActual, nuevaPass } = req.body;
    try {
        const usuario = await Usuario.findOne({ identificador: email.toLowerCase() });
        
        // Verificamos que conozca su clave actual
        if (usuario.password !== passActual) {
            return res.status(401).json({ success: false, message: "La contraseña actual es incorrecta." });
        }

        usuario.password = nuevaPass;
        await usuario.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});
  

app.post('/login', async (req, res) => {
    const { identificador, password } = req.body;
    try {
        const u = await Usuario.findOne({ identificador: identificador.toLowerCase().trim() });
        if (u && u.password === password) {
            // Guardamos la fecha y hora actual en formato legible
            const ahora = new Date().toLocaleString('es-MX', { timeZone: 'America/Hermosillo' });
            u.ultimoAcceso = ahora;
            await u.save();

            res.json({ success: true, usuario: u });
        } else {
            res.status(401).json({ message: "Datos incorrectos" });
        }
    } catch (e) { res.status(500).send(e); }
});
// --- RUTA PARA ELIMINAR NOTICIA ---
app.post('/eliminar-noticia', async (req, res) => {
    const { id, passwordAdmin } = req.body;
    if (passwordAdmin !== "UES_ADMIN_2026") return res.status(403).json({ message: "No autorizado" });
    try {
        await Noticia.findByIdAndDelete(id);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e); }
});

// --- RUTA PARA EDITAR NOTICIA ---
app.post('/editar-noticia', async (req, res) => {
    const { id, passwordAdmin, titulo, contenido, imagen } = req.body;
    if (passwordAdmin !== "UES_ADMIN_2026") return res.status(403).json({ message: "No autorizado" });
    try {
        await Noticia.findByIdAndUpdate(id, { titulo, contenido, imagen });
        res.json({ success: true });
    } catch (e) { res.status(500).send(e); }
});
// RUTA SECRETA PARA OBTENER TODOS LOS USUARIOS (Solo para Francisco)
app.post('/admin/obtener-usuarios', async (req, res) => {
    const { email, password } = req.body;

    // Validación de tus credenciales maestras
    if (email === "franciscoaguayo2005@gmail.com" && password === "VILLA1") {
        try {
            const usuarios = await Usuario.find({}, '-password'); // Trae todo menos las contraseñas
            res.json({ success: true, usuarios });
        } catch (e) {
            res.status(500).json({ message: "Error al obtener base de datos" });
        }
    } else {
        res.status(403).json({ message: "Acceso denegado: Credenciales de administrador inválidas" });
    }
});

// RUTA PARA DAR DE BAJA (ELIMINAR) USUARIOS
app.post('/admin/eliminar-usuario', async (req, res) => {
    const { email, password, idAEliminar } = req.body;

    if (email === "franciscoaguayo2005@gmail.com" && password === "VILLA1") {
        try {
            await Usuario.findByIdAndDelete(idAEliminar);
            res.json({ success: true, message: "Usuario eliminado del sistema" });
        } catch (e) {
            res.status(500).json({ message: "Error al eliminar" });
        }
    } else {
        res.status(403).send("No autorizado");
    }
});

// 4. INICIO DEL SERVIDOR
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`);
});