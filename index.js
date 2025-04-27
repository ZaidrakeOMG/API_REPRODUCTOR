const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const IP = '192.168.1.23'; // ← tu IP local

// Middleware
app.use(cors());

// Carpeta raíz de tus videos
const VIDEOS_DIR = path.join(__dirname, 'Videos', 'categoria');

// Función para listar videos de una subcategoría
function listarVideosDeCategoria(categoria) {
  const categoriaPath = path.join(VIDEOS_DIR, categoria);
  console.log(`Buscando en la categoría: ${categoriaPath}`);

  if (!fs.existsSync(categoriaPath)) {
    console.log(`⚠️ Carpeta no encontrada: ${categoriaPath}`);
    return [];
  }

  const archivos = fs.readdirSync(categoriaPath);
  console.log(`Archivos encontrados en la categoría ${categoria}:`, archivos);

  return archivos
    .filter(nombre => nombre.toLowerCase().endsWith('.mp4'))
    .map(nombre => ({
      titulo: nombre.replace('.mp4', ''),
      url: `http://${IP}:${PORT}/videos/${encodeURIComponent(categoria)}/${encodeURIComponent(nombre)}`
    }));
}

// ✨ Función para listar categorías disponibles
function listarCategoriasDisponibles() {
  if (!fs.existsSync(VIDEOS_DIR)) {
    console.log(`⚠️ Carpeta no encontrada: ${VIDEOS_DIR}`);
    return [];
  }

  const carpetas = fs.readdirSync(VIDEOS_DIR).filter(nombre => {
    const rutaCompleta = path.join(VIDEOS_DIR, nombre);
    return fs.lstatSync(rutaCompleta).isDirectory();
  });

  console.log(`Categorías disponibles:`, carpetas);
  return carpetas;
}

// Ruta principal
app.get('/', (req, res) => {
  res.send('¡API de Videos funcionando!');
});

// Ruta para obtener la lista de categorías
app.get('/api/categorias', (req, res) => {
  console.log('Recibiendo solicitud para categorías...');
  const categorias = listarCategoriasDisponibles();
  
  if (categorias.length === 0) {
    console.log('No se encontraron categorías.');
    res.status(404).json({ mensaje: 'No se encontraron categorías.' });
  } else {
    console.log('Categorías encontradas:', categorias);
    res.json(categorias);
  }
});

// Ruta para obtener los videos de cualquier categoría
app.get('/api/videos/:categoria', (req, res) => {
  const categoria = req.params.categoria;
  console.log(`Recibiendo solicitud para videos de la categoría: ${categoria}`);
  const videos = listarVideosDeCategoria(categoria);

  if (videos.length === 0) {
    console.log('No se encontraron videos para esta categoría.');
    res.status(404).json({ mensaje: 'No se encontraron videos para esta categoría.' });
  } else {
    console.log('Videos encontrados:', videos);
    res.json(videos);
  }
});

// Ruta para servir los archivos de video
app.get('/videos/:categoria/:nombre', (req, res) => {
  const { categoria, nombre } = req.params;
  const videoPath = path.join(VIDEOS_DIR, categoria, nombre);
  console.log(`Buscando archivo de video en: ${videoPath}`);

  if (!fs.existsSync(videoPath)) {
    console.log('⚠️ Video no encontrado:', videoPath);
    return res.status(404).send('Video no encontrado.');
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  console.log(`Tamaño del archivo: ${fileSize} bytes`);

  if (range) {
    console.log('Rango recibido en la solicitud:', range);
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(videoPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };

    console.log(`Enviando video en el rango ${start}-${end} de ${fileSize} bytes.`);
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };

    console.log('Enviando video completo.');
    res.writeHead(200, head);
    fs.createReadStream(videoPath).pipe(res);
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://${IP}:${PORT}`);
});
