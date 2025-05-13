const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const os = require("os");
const https = require("https");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = 3000;
const VIDEOS_DIR = "H:/Videos/categoria";
const THUMBNAILS_DIR = "H:/Videos/thumbnails";

const jwt = require("jsonwebtoken");
const config = {
  jwt: {
    secret: "Tu_SECRETO_AQUI",
  },
};

const IP_MANUAL = "192.168.1.12";
let IP_PUBLICA = IP_MANUAL || "localhost";

// ✅ SERVIR PÁGINAS ESTÁTICAS (esto va antes que cualquier ruta personalizada)
app.use(express.static(path.join(__dirname, "public")));
app.use("/thumbnails", express.static(THUMBNAILS_DIR));
app.use(cors());
app.use(express.json());

// IP dinámica (si no se usa IP_MANUAL)
if (!IP_MANUAL) {
  https
    .get("https://api.ipify.org?format=json", (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const ip = JSON.parse(data).ip;
          IP_PUBLICA = ip;
          console.log("🌐 IP pública detectada:", IP_PUBLICA);
        } catch {
          console.warn("⚠️ No se pudo obtener la IP pública");
        }
      });
    })
    .on("error", () => {
      console.warn("⚠️ Error al consultar la IP pública");
    });
}

// Conexión BD
let connection;

function handleDisconnect() {
  connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "redlucia",
  });

  connection.connect((err) => {
    if (err) {
      console.error("❌ Error al conectar a MySQL:", err);
      setTimeout(handleDisconnect, 2000); // intenta reconectar en 2 segundos
    } else {
      console.log("✅ Conexión a MySQL establecida");
    }
  });

  connection.on("error", (err) => {
    console.error("⚠️ Error de conexión MySQL:", err);
    if (err.code === "PROTOCOL_CONNECTION_LOST") {
      handleDisconnect(); // reconecta
    } else {
      throw err;
    }
  });
}

handleDisconnect();

// Funciones auxiliares
function listarCategoriasDisponibles() {
  if (!fs.existsSync(VIDEOS_DIR)) return [];
  return fs
    .readdirSync(VIDEOS_DIR)
    .filter((nombre) =>
      fs.lstatSync(path.join(VIDEOS_DIR, nombre)).isDirectory()
    )
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function listarVideosDeCategoria(categoria) {
  const categoriaPath = path.join(VIDEOS_DIR, categoria);
  const thumbCategoriaPath = path.join(THUMBNAILS_DIR, categoria);

  if (!fs.existsSync(categoriaPath)) return [];

  if (!fs.existsSync(thumbCategoriaPath)) {
    fs.mkdirSync(thumbCategoriaPath, { recursive: true });
  }

  const archivos = fs
    .readdirSync(categoriaPath)
    .filter((nombre) => nombre.toLowerCase().endsWith(".mp4"));

  const nombresSinDuplicados = new Set();

  const videosFinales = archivos.filter((nombre) => {
    const base = nombre.replace("_faststart", "");
    if (nombresSinDuplicados.has(base)) return false;
    nombresSinDuplicados.add(base);
    return (
      !nombre.includes("_faststart") ||
      archivos.includes(base + "_faststart.mp4")
    );
  });

  return videosFinales
    .map((nombre) => {
      const videoPath = path.join(categoriaPath, nombre);
      const thumbPath = path.join(
        thumbCategoriaPath,
        nombre.replace(".mp4", ".jpg")
      );

      if (!fs.existsSync(thumbPath)) {
        ffmpeg(videoPath)
          .on("error", (err) =>
            console.error(
              `❌ Error generando thumbnail: ${nombre}`,
              err.message
            )
          )
          .on("end", () => console.log(`✅ Thumbnail generado: ${thumbPath}`))
          .screenshots({
            timestamps: ["10"],
            filename: nombre.replace(".mp4", ".jpg"),
            folder: thumbCategoriaPath,
            size: "320x?",
          });
      }

      const stats = fs.statSync(videoPath);
      return {
        titulo: nombre.replace(/_faststart/g, "").replace(".mp4", ""),
        url: `http://${IP_PUBLICA}:${PORT}/videos/${encodeURIComponent(
          categoria
        )}/${encodeURIComponent(nombre)}`,
        thumbnail: `http://${IP_PUBLICA}:${PORT}/thumbnails/${encodeURIComponent(
          categoria
        )}/${encodeURIComponent(nombre.replace(".mp4", ".jpg"))}`,
        fecha: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.fecha - a.fecha);
}

// RUTAS API

app.get("/", (req, res) => res.send("¡API de Videos funcionando!"));

app.get("/api/ip", (req, res) => {
  res.json({
    ip_publica: IP_PUBLICA,
    puerto: PORT,
    url_publica: `http://${IP_PUBLICA}:${PORT}/api/`,
  });
});

app.get("/api/categorias", (req, res) => {
  const categorias = listarCategoriasDisponibles();
  if (categorias.length === 0)
    return res.status(404).json({ mensaje: "No se encontraron categorías." });
  res.json(categorias);
});

app.get(["/api/videos", "/api/videos/"], (req, res) => {
  const categorias = listarCategoriasDisponibles();
  let todosLosVideos = [];
  categorias.forEach((cat) => {
    todosLosVideos = todosLosVideos.concat(listarVideosDeCategoria(cat));
  });
  if (todosLosVideos.length === 0)
    return res.status(404).json({ mensaje: "No se encontraron videos." });
  res.json(todosLosVideos);
});

app.get("/api/videos/:categoria", (req, res) => {
  const categoria = req.params.categoria;
  const videos = listarVideosDeCategoria(categoria);
  if (videos.length === 0)
    return res
      .status(404)
      .json({ mensaje: "No se encontraron videos para esta categoría." });
  res.json(videos);
});

app.get("/videos/:categoria/:nombre", (req, res) => {
  const { categoria, nombre } = req.params;
  const originalPath = path.join(VIDEOS_DIR, categoria, nombre);
  const isFaststart = nombre.includes("_faststart.mp4");
  const baseNombre = isFaststart
    ? nombre
    : nombre.replace(".mp4", "_faststart.mp4");
  const videoFinal = path.join(VIDEOS_DIR, categoria, baseNombre);

  if (!fs.existsSync(originalPath))
    return res.status(404).send("Video no encontrado.");

  if (!isFaststart && !fs.existsSync(videoFinal)) {
    console.log(`⚙️ Optimización en curso: ${baseNombre}`);
    return ffmpeg(originalPath)
      .outputOptions("-movflags +faststart")
      .outputOptions("-c copy")
      .on("end", () => {
        console.log(`✅ Optimizado: ${videoFinal}`);
        res.redirect(
          `/videos/${encodeURIComponent(categoria)}/${encodeURIComponent(
            baseNombre
          )}`
        );
      })
      .on("error", (err) => {
        console.error(`❌ Error optimizando ${nombre}:`, err.message);
        res.status(500).send("Error al preparar el video.");
      })
      .save(videoFinal);
  }

  const stat = fs.statSync(videoFinal);
  const fileSize = stat.size;
  const range = req.headers.range;
  let start = 0;
  let end = fileSize - 1;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    start = parseInt(parts[0], 10);
    end = parts[1] ? parseInt(parts[1], 10) : end;
  }

  const chunksize = end - start + 1;
  const file = fs.createReadStream(videoFinal, { start, end });

  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
    "Accept-Ranges": "bytes",
    "Content-Length": chunksize,
    "Content-Type": "video/mp4",
  });

  file.pipe(res);
});

// --- RUTAS DE AUTENTICACIÓN Y USUARIOS ---

app.post("/api/register", (req, res) => {
  console.log("📥 Se recibió solicitud en /api/register");

  const { nombre, apellidos, telefono, contrasena, tipo_usuario } = req.body;
  const usuario = telefono;
  const tiposValidos = ["Basico", "Premium", "Dedicado"];

  // Validar tipo_usuario
  if (!tiposValidos.includes(tipo_usuario)) {
    return res.status(400).json({
      success: false,
      mensaje: `Tipo de usuario inválido. Debe ser uno de: ${tiposValidos.join(
        ", "
      )}`,
    });
  }

  const dispositivos_maximos = tipo_usuario === "Dedicado" ? 5 : 1;

  bcrypt.hash(contrasena, 10, (err, hash) => {
    if (err) {
      console.error("Error al cifrar la contraseña", err);
      return res.status(500).json({
        success: false,
        mensaje: "Error al cifrar contraseña",
      });
    }

    const sql = `
      INSERT INTO usuarios 
      (nombre, apellidos, telefono, usuario, contrasena, tipo_usuario, dispositivos_maximos, estado) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const valores = [
      nombre,
      apellidos,
      telefono,
      usuario,
      hash,
      tipo_usuario,
      dispositivos_maximos,
      "Inactivo", // 👈 se guarda como inactivo
    ];

    connection.query(sql, valores, (err) => {
      if (err) {
        console.error("Error al ejecutar el query de registro", err);
        if (err.code === "ER_DUP_ENTRY") {
          return res.json({
            success: false,
            mensaje: "Usuario o teléfono ya registrado",
          });
        }
        return res.status(500).json({
          success: false,
          mensaje: "Error al registrar",
        });
      }

      res.json({
        success: true,
        mensaje:
          "Usuario registrado correctamente. Espera activación del administrador.",
      });
    });
  });
});



app.post("/api/login", (req, res) => {
  const { usuario, contrasena } = req.body;

  connection.query(
    "SELECT * FROM usuarios WHERE usuario = ? AND estado = 'Activo'",
    [usuario],
    (err, results) => {
      if (err)
        return res
          .status(500)
          .json({ success: false, mensaje: "Error en la base de datos" });
      if (results.length === 0)
        return res.json({
          success: false,
          mensaje: "Usuario no encontrado o inactivo",
        });

      const user = results[0];
      bcrypt.compare(contrasena, user.contrasena, (err, match) => {
        if (!match)
          return res.jason({
            success: false,
            mensaje: "Contraseña incorrecta",
          });

        //Generacion del token jwt
        const payload = { id: user.id, usuario: user.usuario, tipo: user.tipo_usuario };
        const token = jwt.sign(payload, config.jwt.secret, { expiresIn: '2d' }); // La sesion dura abierta dos dias

        // Respuesta al token junto al resto de la info
        return res.json({
          success: true,
          mensaje: "Login exitoso",
          token,
          usuario: user.usuario,
          tipo_usuario: user.tipo_usuario,
        });
      });
    }
  );
});

app.get("/api/usuarios", (req, res) => {
  const sql =
    "SELECT id, nombre, apellidos, telefono, usuario, tipo_usuario, estado, dispositivos_maximos FROM usuarios";

  connection.query(sql, (err, results) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, mensaje: "Error al consultar usuarios" });
    }

    res.json({
      success: true,
      total: results.length,
      usuarios: results,
    });
  });
});

// Buscar usuario por teléfono
app.get("/api/usuario/:telefono", (req, res) => {
  const telefono = req.params.telefono;
  const sql =
    "SELECT id, nombre, apellidos, telefono, usuario, estado, tipo_usuario FROM usuarios WHERE telefono = ?";

  connection.query(sql, [telefono], (err, results) => {
    if (err)
      return res
        .status(500)
        .json({ success: false, mensaje: "Error en la consulta" });
    if (results.length === 0)
      return res
        .status(404)
        .json({ success: false, mensaje: "Usuario no encontrado" });

    res.json({ success: true, usuario: results[0] });
  });
});

// Cambiar estado del usuario (Activo/Inactivo)
app.put("/api/usuario/:telefono", (req, res) => {
  const telefono = req.params.telefono;
  const { nuevoEstado } = req.body;

  if (!["Activo", "Inactivo"].includes(nuevoEstado)) {
    return res.status(400).json({ success: false, mensaje: "Estado inválido" });
  }

  const sql = "UPDATE usuarios SET estado = ? WHERE telefono = ?";
  connection.query(sql, [nuevoEstado, telefono], (err, result) => {
    if (err)
      return res
        .status(500)
        .json({ success: false, mensaje: "Error al actualizar" });

    res.json({ success: true, mensaje: "Estado actualizado correctamente" });
  });
});

app.put("/api/cambiar-contrasena", (req, res) => {
  const { usuario, nuevaContrasena } = req.body;

  if (!usuario || !nuevaContrasena) {
    return res.status(400).json({ success: false, mensaje: "Faltan datos" });
  }

  bcrypt.hash(nuevaContrasena, 10, (err, hash) => {
    if (err) {
      console.error("❌ Error al cifrar nueva contraseña", err);
      return res.status(500).json({ success: false, mensaje: "Error interno" });
    }

    const sql = "UPDATE usuarios SET contrasena = ? WHERE usuario = ?";
    connection.query(sql, [hash, usuario], (err, result) => {
      if (err) {
        console.error("❌ Error al actualizar contraseña", err);
        return res
          .status(500)
          .json({ success: false, mensaje: "Error al guardar" });
      }

      res.json({ success: true, mensaje: "Contraseña actualizada con éxito" });
    });
  });
});

app.put("/api/usuario/:telefono/tipo", (req, res) => {
  const telefono = req.params.telefono;
  const { nuevoTipo } = req.body;
  const tiposValidos = ["Basico", "Premium", "Dedicado"];

  if (!tiposValidos.includes(nuevoTipo)) {
    return res.status(400).json({ success: false, mensaje: "Tipo inválido" });
  }

  const sql = "UPDATE usuarios SET tipo_usuario = ? WHERE telefono = ?";
  connection.query(sql, [nuevoTipo, telefono], (err, result) => {
    if (err)
      return res
        .status(500)
        .json({ success: false, mensaje: "Error al actualizar tipo" });

    res.json({
      success: true,
      mensaje: "Tipo de usuario actualizado correctamente",
    });
  });
});

app.post("/api/login", (req, res) => {
  const { usuario, contrasena, dispositivo_hash } = req.body;

  connection.query(
    "SELECT * FROM usuarios WHERE usuario = ? AND estado = 'Activo'",
    [usuario],
    (err, results) => {
      if (err)
        return res
          .status(500)
          .json({ success: false, mensaje: "Error en la base de datos" });
      if (results.length === 0)
        return res.json({
          success: false,
          mensaje: "Usuario no encontrado o inactivo",
        });

      const user = results[0];

      bcrypt.compare(contrasena, user.contrasena, (err, match) => {
        if (!match)
          return res.json({ success: false, mensaje: "Contraseña incorrecta" });

        // ✅ Verificar cantidad de dispositivos
        const tipo = user.tipo_usuario;
        const maxDispositivos =
          tipo === "Basico" ? 1 : tipo === "Premium" ? 2 : 3;

        // 1. ¿Ya está registrado este dispositivo?
        const checkQuery =
          "SELECT * FROM sesiones_dispositivos WHERE id_usuario = ? AND dispositivo_hash = ?";
        connection.query(
          checkQuery,
          [user.id, dispositivo_hash],
          (err, existing) => {
            if (err)
              return res
                .status(500)
                .json({
                  success: false,
                  mensaje: "Error al verificar dispositivo",
                });

            if (existing.length > 0) {
              // 😎 El dispositivo ya está registrado → login permitido
              return res.json({
                success: true,
                mensaje: "Login exitoso",
                usuario: user.usuario,
                tipo_usuario: user.tipo_usuario,
              });
            }

            // 2. ¿Cuántos dispositivos tiene?
            const countQuery =
              "SELECT COUNT(*) AS total FROM sesiones_dispositivos WHERE id_usuario = ?";
            connection.query(countQuery, [user.id], (err, countResult) => {
              if (err)
                return res
                  .status(500)
                  .json({
                    success: false,
                    mensaje: "Error al contar dispositivos",
                  });

              const total = countResult[0].total;
              if (total >= maxDispositivos) {
                return res.json({
                  success: false,
                  mensaje: `Límite de dispositivos alcanzado para tipo ${tipo}`,
                });
              }

              // 3. Registrar nuevo dispositivo
              const insertQuery =
                "INSERT INTO sesiones_dispositivos (id_usuario, dispositivo_hash) VALUES (?, ?)";
              connection.query(
                insertQuery,
                [user.id, dispositivo_hash],
                (err) => {
                  if (err)
                    return res
                      .status(500)
                      .json({
                        success: false,
                        mensaje: "Error al registrar dispositivo",
                      });

                  return res.json({
                    success: true,
                    mensaje: "Login exitoso",
                    usuario: user.usuario,
                    tipo_usuario: user.tipo_usuario,
                  });
                }
              );
            });
          }
        );
      });
    }
  );
});

// ⚠️ Esta debe ir al final
app.use((req, res) =>
  res.status(404).json({ mensaje: "Recurso no encontrado" })
);

// Iniciar servidor
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor escuchando en http://${IP_PUBLICA}:${PORT}`);
});
