require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const cron = require('node-cron');
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("¡Conectado a MongoDB con éxito!"))
    .catch(err => console.error("Error al conectar BD:", err));

// --- ESQUEMA DE DATOS ---
const MateriaSchema = new mongoose.Schema({
    emailEstudiante: String,
    nombre: String, 
    tareas: [{
        descripcion: String, 
        fecha: String,
        recordatorioEnviado: { type: Boolean, default: false } //
    }]
});
const Materia = mongoose.model('Materia', MateriaSchema);

// --- CONFIGURACIÓN DE CORREO ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

let codigosTemporales = {};

// --- FUNCIONES DE APOYO ---
const obtenerFechaLocal = () => {
    const fecha = new Date();
    // Ajuste para la zona horaria de Sonora/Hermosillo
    return fecha.toLocaleDateString('en-CA'); // Retorna "YYYY-MM-DD"
};

const enviarEmailRecordatorio = (correo, tarea, materia) => {
    const mailOptions = {
        from: '"Asistente UES" <' + process.env.EMAIL_USER + '>',
        to: correo,
        subject: `⚠️ RECORDATORIO: Tarea de ${materia}`,
        text: `¡Hola! Tienes una tarea para hoy en la materia ${materia}: "${tarea}". ¡Éxito!`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) console.log("Error al enviar el correo:", error);
        else console.log(`Correo enviado con éxito a: ${correo}`);
    });
};

// --- RUTAS DE AUTENTICACIÓN ---
app.post('/enviar-codigo', (req, res) => {
    const { email } = req.body;
    const codigo = Math.floor(100000 + Math.random() * 900000);
    codigosTemporales[email] = codigo;

    // Log para ver el código en la terminal de VS Code
    console.log("==========================================");
    console.log(`📩 PETICIÓN DE ACCESO: ${email}`);
    console.log(`🔑 CÓDIGO GENERADO: ${codigo}`);
    console.log("==========================================");

    const mailOptions = {
        from: 'Sistema Académico UES',
        to: email,
        subject: 'Tu código de acceso - UES',
        text: `Tu código de verificación es: ${codigo}`
    };

    transporter.sendMail(mailOptions, (error) => {
        if (error) return res.status(500).send(error.toString());
        res.status(200).send({ message: 'Correo enviado con éxito' });
    });
});

app.post('/verificar-codigo', (req, res) => {
    const { email, codigo } = req.body;
    
    // Cambiamos la lógica: Si el "código" es igual a tu contraseña fija
    const PASSWORD_MAESTRA = "UES2026"; 

    if (codigo === PASSWORD_MAESTRA) {
        res.status(200).send({ message: 'Acceso concedido', redirect: '/home.html' });
    } else {
        res.status(400).send({ message: 'Contraseña incorrecta' });
    }
});

// --- RUTAS DE MATERIAS Y TAREAS ---
app.post('/agregar-materia', async (req, res) => {
    try {
        const { email, nombreMateria } = req.body;
        const nuevaMateria = new Materia({ 
            emailEstudiante: email, 
            nombre: nombreMateria, 
            tareas: [] 
        });
        await nuevaMateria.save();
        res.status(200).send({ message: 'Materia guardada' });
    } catch (error) {
        res.status(500).send({ message: 'Error en el servidor' });
    }
});

app.post('/agregar-tarea', async (req, res) => {
    try {
        const { materiaId, descripcion, fecha } = req.body;
        const materia = await Materia.findById(materiaId);
        
        materia.tareas.push({ descripcion, fecha, recordatorioEnviado: false });
        await materia.save();

        const hoy = obtenerFechaLocal();
        // Disparo inmediato si la tarea es para hoy
        if (fecha === hoy) {
            enviarEmailRecordatorio(materia.emailEstudiante, descripcion, materia.nombre);
            
            // Marcamos como enviada para evitar duplicados por el CRON
            const tareaRecienAgregada = materia.tareas[materia.tareas.length - 1];
            tareaRecienAgregada.recordatorioEnviado = true;
            await materia.save();

            res.status(200).send({ message: 'Tarea guardada y recordatorio enviado', alerta: true });
        } else {
            res.status(200).send({ message: 'Tarea guardada' });
        }
    } catch (error) {
        res.status(500).send({ message: 'Error al procesar tarea' });
    }
});

app.get('/obtener-materias/:email', async (req, res) => {
    try {
        const materias = await Materia.find({ emailEstudiante: req.params.email });
        res.json(materias);
    } catch (error) {
        res.status(500).send({ message: "Error al obtener materias" });
    }
});

// --- SISTEMA DE REVISIÓN AUTOMÁTICA ---
const revisarRecordatorios = async () => {
    const hoy = obtenerFechaLocal();
    try {
        const materias = await Materia.find({
            "tareas.fecha": hoy,
            "tareas.recordatorioEnviado": false
        });

        for (let materia of materias) {
            let huboCambios = false;
            materia.tareas.forEach(tarea => {
                if (tarea.fecha === hoy && !tarea.recordatorioEnviado) {
                    enviarEmailRecordatorio(materia.emailEstudiante, tarea.descripcion, materia.nombre);
                    tarea.recordatorioEnviado = true;
                    huboCambios = true;
                }
            });
            if (huboCambios) await materia.save();
        }
    } catch (error) {
        console.error("Error en recordatorios automáticos:", error);
    }
};

// Cron: Revisa cada minuto de forma silenciosa
cron.schedule('* * * * *', () => {
    revisarRecordatorios();
});

// --- ENCENDER SERVIDOR ---
app.listen(3000, () => {
    console.log('====================================');
    console.log('🚀 SERVIDOR ACTIVO EN: http://localhost:3000');
    console.log('✅ CONECTADO A MONGODB CON ÉXITO');
    console.log('====================================');
    
    revisarRecordatorios();
});