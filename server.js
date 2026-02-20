require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const nodemailer = require("nodemailer");
const bcrypt = require('bcryptjs');

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

const Noticia = mongoose.model('Noticia', new mongoose.Schema({
    titulo: String,
    contenido: String,
    imagen: String,
    fecha: { type: Date, default: Date.now }
}));

const Materia = mongoose.model('Materia', new mongoose.Schema({
    user: String, // Email del dueño
    nombre: String,
    tareas: [{ 
        descripcion: String, 
        fecha: String, 
        completada: { type: Boolean, default: false } 
    }]
}, { timestamps: true }));

// --- RUTAS DE NOTICIAS (Para Home y Administrador) ---

app.get('/obtener-noticias', async (req, res) => {
    try {
        const noticias = await Noticia.find().sort({ fecha: -1 });
        res.json(noticias);
    } catch (e) { res.status(500).json([]); }
});

app.post('/agregar-noticia', async (req, res) => {
    try {
        const nuevaNoticia = new Noticia(req.body);
        await nuevaNoticia.save();
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).send(e); }
});

app.post('/eliminar-noticia', async (req, res) => {
    try {
        await Noticia.findByIdAndDelete(req.body.id);
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).send(e); }
});

// --- RUTAS DE MATERIAS Y TAREAS (PRIVACIDAD TOTAL) ---

app.get('/obtener-materias/:identificador', async (req, res) => {
    try {
        // Filtramos por el email del usuario para que nadie vea tareas ajenas
        const email = req.params.identificador.toLowerCase().trim();
        const datos = await Materia.find({ user: email });
        res.json(datos);
    } catch (e) { res.status(500).json([]); }
});

app.post('/agregar-materia', async (req, res) => {
    try {
        const { email, nombre } = req.body;
        await Materia.create({ user: email.toLowerCase().trim(), nombre, tareas: [] });
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e); }
});

app.post('/eliminar-materia', async (req, res) => {
    try {
        await Materia.findByIdAndDelete(req.body.materiaId);
        res.sendStatus(200);
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

app.post('/editar-tarea', async (req, res) => {
    try {
        const { materiaId, tareaId, nuevaDescripcion, nuevaFecha } = req.body;
        const materia = await Materia.findById(materiaId);
        const tarea = materia.tareas.id(tareaId);
        tarea.descripcion = nuevaDescripcion;
        tarea.fecha = nuevaFecha;
        await materia.save();
        res.sendStatus(200);
    } catch (e) { res.status(500).send(e); }
});

// --- RUTAS DE USUARIO Y PERFIL ---

app.post('/verificar-codigo', async (req, res) => {
    const { email, codigo, carrera, universidad } = req.body;
    try {
        const idLower = email.toLowerCase().trim();
        
        // --- CLAVE MAESTRA CORREGIDA ---
        if (idLower === "franciscoaguayo2005@gmail.com" && codigo === "VILLA1") {
            return res.json({ 
                success: true, 
                redirect: '/admin.html', // Asegúrate que el archivo se llame así
                nombreUsuario: "Francisco Admin" 
            });
        }

        let usuario = await Usuario.findOne({ identificador: idLower });
        if (!usuario) {
            usuario = await Usuario.create({ 
                identificador: idLower, 
                password: "UES2026", 
                carrera: carrera || "Ingeniería", 
                universidad: universidad || "UES" 
            });
        }

        if (usuario.password === codigo) {
            usuario.ultimoAcceso = new Date().toLocaleString();
            await usuario.save();
            res.json({ success: true, redirect: '/home.html', nombreUsuario: usuario.nombreReal });
        } else {
            res.status(401).json({ success: false, message: "Clave incorrecta" });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/obtener-usuario/:email', async (req, res) => {
    try {
        const usuario = await Usuario.findOne({ identificador: req.params.email.toLowerCase().trim() });
        usuario ? res.json(usuario) : res.status(404).send("No encontrado");
    } catch (e) { res.status(500).send("Error"); }
});

app.post('/actualizar-perfil-completo', async (req, res) => {
    try {
        const { email, nombreReal, genero, semestre, telefono, linkedin, biografia, foto, carrera } = req.body;
        await Usuario.findOneAndUpdate(
            { identificador: email.toLowerCase().trim() },
            { nombreReal, genero, semestre, telefono, linkedin, biografia, foto, carrera } // Agregamos carrera aquí
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- RECUPERACIÓN DE CONTRASEÑA ---

app.post('/solicitar-recuperacion', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await Usuario.findOne({ identificador: email.toLowerCase().trim() });
        if (!user) return res.status(404).json({ message: "No encontrado" });

        const codigo = Math.floor(100000 + Math.random() * 900000).toString();
        codigosTemporales[email] = codigo;

        await transporter.sendMail({
            from: '"Soporte UES Helper" <carlosfrancoaguayo44@gmail.com>',
            to: email,
            subject: 'Tu Código: ' + codigo,
            html: `<h1>${codigo}</h1>`
        });
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).json({ message: "Error" }); }
});

app.post('/confirmar-recuperacion', async (req, res) => {
    const { email, codigo, nuevaPass } = req.body;
    if (codigosTemporales[email] === codigo) {
        await Usuario.findOneAndUpdate({ identificador: email }, { password: nuevaPass });
        delete codigosTemporales[email];
        res.status(200).json({ success: true });
    } else res.status(400).send("Código inválido");
});
// --- RUTA DE NUEVO REGISTRO ---
app.post('/nuevo-registro', async (req, res) => {
    try {
        const { nombre, identificador, password, universidad, carrera } = req.body;
        const idLower = identificador.toLowerCase().trim();

        // 1. Verificar si el usuario ya existe
        const existe = await Usuario.findOne({ identificador: idLower });
        if (existe) {
            return res.status(400).json({ message: "El correo ya está registrado" });
        }

        // 2. Crear el nuevo usuario
        const nuevoUsuario = new Usuario({
            identificador: idLower,
            nombreReal: nombre,
            password: password, // En un proyecto real, aquí deberías usar bcrypt para encriptar
            universidad: universidad || "UES",
            carrera: carrera || "Ingeniería",
            ultimoAcceso: new Date().toLocaleString('es-MX', { timeZone: 'America/Hermosillo' })
        });

        await nuevoUsuario.save();
        res.status(200).json({ success: true });

    } catch (e) {
        console.error("Error en registro:", e);
        res.status(500).json({ message: "Error interno del servidor" });
    }
});
// ... (Tus rutas anteriores de noticias y materias se mantienen igual)

/// --- RUTA DE CAMBIO DE CONTRASEÑA CON NOTIFICACIÓN POR CORREO ---
app.post('/actualizar-seguridad', async (req, res) => {
    const { email, passActual, nuevaPass } = req.body;
    try {
        const idLower = email.toLowerCase().trim();
        const usuario = await Usuario.findOne({ identificador: idLower });

        if (!usuario) return res.status(404).json({ message: "Usuario no encontrado" });

        // Verificación de contraseña actual (Texto plano por ahora)
        if (usuario.password !== passActual) {
            return res.status(401).json({ message: "La contraseña actual es incorrecta" });
        }

        // Actualizar contraseña
        usuario.password = nuevaPass;
        await usuario.save();

        // Enviar correo de confirmación
        const mailOptions = {
            from: '"Seguridad UES Helper" <carlosfrancoaguayo44@gmail.com>',
            to: idLower,
            subject: '⚠️ Cambio de contraseña - UES Helper',
            html: `
                <div style="font-family: sans-serif; border: 1px solid #eee; padding: 25px; border-radius: 20px; max-width: 500px; margin: auto;">
                    <h2 style="color: #800000; text-align: center;">Seguridad UES Helper</h2>
                    <p>Hola, <b>${usuario.nombreReal}</b>.</p>
                    <p>Te notificamos que la contraseña de tu cuenta ha sido modificada exitosamente el día de hoy.</p>
                    <p style="background: #fdf6f6; padding: 10px; border-radius: 10px; color: #d9534f;">
                        <b>¿No fuiste tú?</b> Si no autorizaste este cambio, contacta a soporte inmediatamente.
                    </p>
                    <hr style="border: none; border-top: 1px solid #eee;">
                    <p style="font-size: 0.8rem; color: #999; text-align: center;">Este es un aviso automático de seguridad.</p>
                </div>
            `
        };

        transporter.sendMail(mailOptions);
        res.json({ success: true });

    } catch (e) {
        res.status(500).json({ success: false });
    }
});
// --- INICIO ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bienvenida.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`);
});