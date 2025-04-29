const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;
const IP = "192.168.1.6"; // Tu IP local

// Middleware
app.use(cors());

// Carpeta raíz de tus videos
const VIDEOS_DIR = "H:/Videos/categoria";

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
    .filter((nombre) => nombre.toLowerCase().endsWith(".mp4"))
    .map((nombre) => ({
      titulo: nombre.replace(".mp4", ""),
      url: `http://${IP}:${PORT}/videos/${encodeURIComponent(
        categoria
      )}/${encodeURIComponent(nombre)}`,
    }));
}

// Función para listar categorías disponibles
function listarCategoriasDisponibles() {
  if (!fs.existsSync(VIDEOS_DIR)) {
    return [];
  }
  const carpetas = fs
    .readdirSync(VIDEOS_DIR)
    .filter((nombre) =>
      fs.lstatSync(path.join(VIDEOS_DIR, nombre)).isDirectory()
    );

  // Ordenar alfabéticamente (insensible a mayúsculas)
  carpetas.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  return carpetas;
}

// Ruta principal
app.get("/", (req, res) => {
  res.send("¡API de Videos funcionando!");
});

// Obtener lista de categorías
app.get("/api/categorias", (req, res) => {
  const categorias = listarCategoriasDisponibles();
  if (categorias.length === 0) {
    return res.status(404).json({ mensaje: "No se encontraron categorías." });
  }
  res.json(categorias);
});

// Obtener **todos** los videos (sin categoría)
app.get(["/api/videos", "/api/videos/"], (req, res) => {
  console.log("Recibiendo solicitud para todos los videos");
  const categorias = listarCategoriasDisponibles();
  let todosLosVideos = [];
  categorias.forEach((cat) => {
    todosLosVideos = todosLosVideos.concat(listarVideosDeCategoria(cat));
  });
  if (todosLosVideos.length === 0) {
    return res.status(404).json({ mensaje: "No se encontraron videos." });
  }
  res.json(todosLosVideos);
});

// Obtener videos de **una** categoría
app.get("/api/videos/:categoria", (req, res) => {
  const categoria = req.params.categoria;
  console.log(`Recibiendo solicitud para videos de la categoría: ${categoria}`);
  const videos = listarVideosDeCategoria(categoria);
  if (videos.length === 0) {
    return res
      .status(404)
      .json({ mensaje: "No se encontraron videos para esta categoría." });
  }
  res.json(videos);
});

// Servir archivo de video (rango o completo)
app.get("/videos/:categoria/:nombre", (req, res) => {
  const { categoria, nombre } = req.params;
  const videoPath = path.join(VIDEOS_DIR, categoria, nombre);
  if (!fs.existsSync(videoPath)) {
    return res.status(404).send("Video no encontrado.");
  }
  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(videoPath, { start, end });
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4",
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
    });
    fs.createReadStream(videoPath).pipe(res);
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://${IP}:${PORT}`);
});
