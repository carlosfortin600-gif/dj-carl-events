const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const multer = require("multer");
const {
  MODULE_DIR,
  getPhotosDir,
  setPhotosDir,
  getPublicPhotoPeopleState,
  addPhoto,
  clearAllPhotos
} = require("./state");

const PUBLIC_DIR = path.join(MODULE_DIR, "public");
const guestSockets = new Set();
let uploadsBlocked = false;

function getConnectionCount() {
  return guestSockets.size;
}

function getAccessState() {
  return {
    count: getConnectionCount(),
    blocked: uploadsBlocked
  };
}

function emitConnectionCount(io) {
  io.to("photopeople").emit("photoPeopleConnections", getAccessState());
}

const PUBLIC_FILES = new Set([
  "styles.css",
  "host.js",
  "viewer.js",
  "upload.js",
  "frame-noel.png",
  "attente-noel.jpg"
]);
let slideshowLooping = false;

function getPhotoPeopleViewState() {
  return {
    ...getPublicPhotoPeopleState(),
    looping: slideshowLooping
  };
}

function sendPublicFile(filename) {
  return (req, res) => {
    if (!PUBLIC_FILES.has(filename)) {
      return res.status(404).end();
    }

    res.sendFile(path.join(PUBLIC_DIR, filename));
  };
}

function sendPhotoFile(req, res) {
  const filename = path.basename(String(req.params.filename || ""));

  if (!filename) {
    return res.status(404).end();
  }

  const filePath = path.join(getPhotosDir(), filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).end();
  }

  res.sendFile(filePath);
}

function createPhotoUpload() {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, callback) => {
        callback(null, getPhotosDir());
      },
      filename: (req, file, callback) => {
        const ext = path.extname(String(file.originalname || "")).toLowerCase();
        const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"]);
        const safeExt = allowed.has(ext) ? ext : ".jpg";
        callback(null, `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
      }
    }),
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
      if (String(file.mimetype || "").startsWith("image/")) {
        callback(null, true);
        return;
      }

      callback(new Error("Seules les images sont acceptées."));
    }
  });
}

function registerPhotoPeopleRoutes(app, { io, getBaseUrl, getLocalIp, port, QRCode, qrScanOptions }) {
  const photoUpload = createPhotoUpload();

  PUBLIC_FILES.forEach((filename) => {
    app.get(`/photo-people/${filename}`, sendPublicFile(filename));
  });

  app.get("/photo-people/files/:filename", sendPhotoFile);
  app.get("/photos/:filename", sendPhotoFile);

  app.get("/photo-people", (req, res) => {
    res.redirect("/photo-people/host");
  });

  app.get("/photo-people/host", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "host.html"));
  });

  app.get("/photo-people/viewer", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "viewer.html"));
  });

  app.get("/photo-people/upload", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "upload.html"));
  });

  app.get("/photo-wall", (req, res) => {
    res.redirect("/photo-people/host");
  });

  app.get("/photo-wall/host", (req, res) => {
    res.redirect("/photo-people/host");
  });

  app.get("/photo-wall/viewer", (req, res) => {
    res.redirect("/photo-people/viewer");
  });

  app.get("/photo-wall/upload", (req, res) => {
    res.redirect("/photo-people/upload");
  });

  app.get("/api/photo-people/network", async (req, res) => {
    try {
      const joinUrl = `${getBaseUrl()}/join`;
      const viewerUrl = `${getBaseUrl()}/photo-people/viewer`;
      const joinQr = await QRCode.toDataURL(joinUrl, qrScanOptions);
      const viewerQr = await QRCode.toDataURL(viewerUrl, qrScanOptions);

      res.json({
        ip: getLocalIp(),
        port,
        baseUrl: getBaseUrl(),
        joinUrl,
        joinQr,
        uploadUrl: joinUrl,
        uploadQr: joinQr,
        viewerUrl,
        viewerQr
      });
    } catch (error) {
      res.status(500).json({ error: "Erreur QR Code" });
    }
  });

  app.get("/api/photo-people/state", (req, res) => {
    res.json(getPhotoPeopleViewState());
  });

  app.get("/api/photo-people/info", (req, res) => {
    res.json({
      photosDir: getPhotosDir(),
      moduleDir: MODULE_DIR,
      count: getPublicPhotoPeopleState().count,
      connectionCount: getConnectionCount(),
      blocked: uploadsBlocked,
      canPickFolder: process.platform === "darwin"
    });
  });

  app.post("/api/photo-people/config", (req, res) => {
    const photosDir = String(req.body?.photosDir || "").trim();

    if (!photosDir) {
      return res.status(400).json({ error: "Chemin de dossier requis." });
    }

    try {
      const resolved = setPhotosDir(photosDir);
      const state = getPhotoPeopleViewState();
      io.to("photopeople").emit("photoPeopleState", state);

      res.json({
        ok: true,
        photosDir: resolved,
        count: state.count
      });
    } catch (error) {
      res.status(400).json({
        error: error.message || "Impossible d'utiliser ce dossier."
      });
    }
  });

  app.post("/api/photo-people/pick-folder", (req, res) => {
    if (process.platform !== "darwin") {
      return res.status(400).json({
        error: "Sélecteur de dossier disponible sur Mac. Saisis le chemin manuellement."
      });
    }

    try {
      const picked = execFileSync(
        "osascript",
        ["-e", 'POSIX path of (choose folder with prompt "Dossier Photo en direct")'],
        { encoding: "utf8" }
      ).trim();

      const resolved = setPhotosDir(picked);
      const state = getPhotoPeopleViewState();
      io.to("photopeople").emit("photoPeopleState", state);

      res.json({
        ok: true,
        photosDir: resolved,
        count: state.count
      });
    } catch (error) {
      if (error.status === 1) {
        return res.json({ ok: false, cancelled: true });
      }

      res.status(500).json({
        error: error.message || "Impossible d'ouvrir le sélecteur de dossier."
      });
    }
  });

  app.post("/api/photo-people/upload", photoUpload.single("photo"), (req, res) => {
    if (uploadsBlocked) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(403).json({
        error: "Les envois sont bloqués par l'animateur."
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Photo requise." });
    }

    try {
      const photo = addPhoto({
        filename: req.file.filename,
        caption: req.body?.caption,
        uploaderName: req.body?.uploaderName
      });

      io.to("photopeople").emit("photoPeopleAdd", photo);
      io.to("photopeople").emit("photoPeopleState", getPhotoPeopleViewState());

      res.json({
        success: true,
        photo
      });
    } catch (error) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(400).json({
        error: error.message || "Impossible d'enregistrer la photo."
      });
    }
  });
}

function registerPhotoPeopleSockets(io, socket) {
  function sendPhotoPeopleState(target = socket) {
    target.emit("photoPeopleState", getPhotoPeopleViewState());
  }

  socket.on("joinPhotoPeopleHost", (callback) => {
    socket.join("photopeople");
    const state = getPhotoPeopleViewState();
    sendPhotoPeopleState(socket);
    socket.emit("photoPeopleConnections", getAccessState());

    if (typeof callback === "function") {
      callback({
        ...state,
        ...getAccessState(),
        connectionCount: getConnectionCount()
      });
    }
  });

  socket.on("joinPhotoPeopleViewer", (callback) => {
    socket.join("photopeople");
    const state = getPhotoPeopleViewState();
    sendPhotoPeopleState(socket);

    if (typeof callback === "function") {
      callback(state);
    }
  });

  socket.on("joinPhotoPeopleUpload", (callback) => {
    if (uploadsBlocked) {
      socket.emit("photoPeopleAccess", { blocked: true });

      if (typeof callback === "function") {
        callback({ ok: false, blocked: true });
      }
      return;
    }

    guestSockets.add(socket.id);
    socket.join("photopeople-guests");
    emitConnectionCount(io);
    socket.emit("photoPeopleAccess", { blocked: false });

    if (typeof callback === "function") {
      callback({ ok: true, blocked: false });
    }
  });

  socket.on("photoPeopleResetConnections", (callback) => {
    guestSockets.forEach((id) => {
      const guest = io.sockets.sockets.get(id);
      if (!guest) return;

      guest.emit("photoPeopleKicked");
      guest.leave("photopeople-guests");
    });
    guestSockets.clear();
    emitConnectionCount(io);

    if (typeof callback === "function") {
      callback({ ok: true, ...getAccessState() });
    }
  });

  socket.on("photoPeopleSetBlocked", (blocked, callback) => {
    uploadsBlocked = Boolean(blocked);
    io.to("photopeople-guests").emit("photoPeopleAccess", { blocked: uploadsBlocked });
    emitConnectionCount(io);

    if (typeof callback === "function") {
      callback({ ok: true, ...getAccessState() });
    }
  });

  socket.on("disconnect", () => {
    if (guestSockets.delete(socket.id)) {
      emitConnectionCount(io);
    }
  });

  socket.on("photoPeopleSetLoop", (looping, callback) => {
    slideshowLooping = Boolean(looping);
    const state = getPhotoPeopleViewState();
    io.to("photopeople").emit("photoPeopleState", state);

    if (typeof callback === "function") {
      callback({ ok: true, state });
    }
  });

  socket.on("photoPeopleClear", (callback) => {
    try {
      clearAllPhotos();
      slideshowLooping = false;
      io.to("photopeople").emit("photoPeopleClear");
      io.to("photopeople").emit("photoPeopleState", getPhotoPeopleViewState());

      if (typeof callback === "function") {
        callback({ ok: true, state: getPhotoPeopleViewState() });
      }
    } catch (error) {
      if (typeof callback === "function") {
        callback({ ok: false, error: error.message });
      }
    }
  });
}

function getStartupInfo(getBaseUrl) {
  return {
    moduleDir: MODULE_DIR,
    photosDir: getPhotosDir(),
    hostUrl: `${getBaseUrl()}/photo-people/host`,
    viewerUrl: `${getBaseUrl()}/photo-people/viewer`
  };
}

module.exports = {
  MODULE_DIR,
  registerPhotoPeopleRoutes,
  registerPhotoPeopleSockets,
  getStartupInfo,
  getPhotosDir
};
