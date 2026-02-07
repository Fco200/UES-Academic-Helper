
const mongoose = require('mongoose');

const MateriaSchema = new mongoose.Schema({
    emailEstudiante: String,
    nombre: String,
    tareas: [{
        descripcion: String,
        fecha: String,
        recordatorioEnviado: { type: Boolean, default: false } // Esto evita el bucle
    }]
});

module.exports = mongoose.model('Materia', MateriaSchema);