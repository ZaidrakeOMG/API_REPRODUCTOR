const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());

// Carpeta donde tienes tus videos
const VIDEOS_DIR = path.join(__dirname, 'videos');

// Función para listar los videos de una categoría
function listarVideosDeCategoria(categoria) {
  const categoriaPath = path.join(VIDEOS_DIR, categoria);
  if (!fs.existsSync(categoriaPath)) return [];

  const archivos = fs.readdirSync(categoriaPath);
  return archivos
    .filter(nombre => nombre.endsWith('.mp4'))
    .map(nombre => ({
      titulo: nombre.replace('.mp4', ''),
      url: `http://localhost:${PORT}/videos/${categoria}/${nombre}`
    }));
}

// Ruta principal
app.get('/', (req, res) => {
  res.send('¡API de Videos funcionando!');
});

// Endpoint para obtener videos de una categoría
app.get('/api/videos/:categoria', (req, res) => {
  const categoria = req.params.categoria;
  const videos = listarVideosDeCategoria(categoria);
  res.json(videos);
});

// Servir archivos de la carpeta videos
app.use('/videos', express.static(VIDEOS_DIR));

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
