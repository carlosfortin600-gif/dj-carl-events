const fs = require("fs");
const path = require("path");

const MODULE_DIR = __dirname;
const CONFIG_FILE = path.join(MODULE_DIR, "data", "config.json");
const DEFAULT_PHOTOS_DIR = path.join(MODULE_DIR, "photos");
const LEGACY_PHOTOS_DIRS = [
  path.join(MODULE_DIR, "..", "..", "Photo en direct"),
  path.join(MODULE_DIR, "..", "..", "Photo People"),
  path.join(MODULE_DIR, "..", "Photos"),
  path.join(MODULE_DIR, "..", "data", "photos")
];
const LEGACY_CONFIG_FILES = [
  path.join(MODULE_DIR, "..", "data", "photo-wall-config.json")
];
const MAX_PHOTOS = 200;

let photos = [];
let activePhotosDir = null;

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }

  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch (error) {
    return {};
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

function migrateLegacyConfig() {
  if (fs.existsSync(CONFIG_FILE)) return;

  LEGACY_CONFIG_FILES.forEach((legacyConfig) => {
    if (fs.existsSync(legacyConfig)) {
      fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
      fs.copyFileSync(legacyConfig, CONFIG_FILE);
    }
  });
}

function resolvePhotosDir(input) {
  migrateLegacyConfig();
  const raw = String(input || "").trim();
  const configured = raw || readConfig().photosDir || DEFAULT_PHOTOS_DIR;
  return path.resolve(configured);
}

function getManifestPath(photosDir = getPhotosDir()) {
  return path.join(photosDir, "manifest.json");
}

function ensurePhotosDirAt(photosDir) {
  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
  }
}

function migrateLegacyPhotos(targetDir) {
  LEGACY_PHOTOS_DIRS.forEach((legacyDir) => {
    if (!fs.existsSync(legacyDir)) return;

    fs.readdirSync(legacyDir)
      .filter((name) => /\.(jpe?g|png|webp|gif|heic)$/i.test(name))
      .forEach((name) => {
        const from = path.join(legacyDir, name);
        const to = path.join(targetDir, name);

        if (!fs.existsSync(to)) {
          fs.copyFileSync(from, to);
        }
      });

    const legacyManifest = path.join(legacyDir, "manifest.json");
    const targetManifest = path.join(targetDir, "manifest.json");

    if (fs.existsSync(legacyManifest) && !fs.existsSync(targetManifest)) {
      fs.copyFileSync(legacyManifest, targetManifest);
    }
  });
}

function getPhotosDir() {
  if (!activePhotosDir) {
    activePhotosDir = resolvePhotosDir();
    ensurePhotosDirAt(activePhotosDir);
    migrateLegacyPhotos(activePhotosDir);
  }

  return activePhotosDir;
}

function setPhotosDir(input) {
  const resolved = resolvePhotosDir(input);

  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }

  const stats = fs.statSync(resolved);
  if (!stats.isDirectory()) {
    throw new Error("Le chemin indiqué n'est pas un dossier.");
  }

  activePhotosDir = resolved;
  writeConfig({ photosDir: resolved });
  loadPhotosFromDisk();
  return resolved;
}

function readManifest(photosDir = getPhotosDir()) {
  const manifestPath = getManifestPath(photosDir);

  if (!fs.existsSync(manifestPath)) {
    return {};
  }

  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch (error) {
    return {};
  }
}

function writeManifest(manifest, photosDir = getPhotosDir()) {
  ensurePhotosDirAt(photosDir);
  fs.writeFileSync(getManifestPath(photosDir), JSON.stringify(manifest, null, 2), "utf8");
}

function deletePhotoFile(filename, photosDir = getPhotosDir()) {
  const safeName = path.basename(String(filename || ""));
  if (!safeName) return;

  const filePath = path.join(photosDir, safeName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function clonePhoto(photo) {
  return { ...photo };
}

function buildPhotoUrl(filename) {
  return `/photo-people/files/${encodeURIComponent(path.basename(filename))}`;
}

function loadPhotosFromDisk() {
  const photosDir = getPhotosDir();
  photos = [];

  const manifest = readManifest(photosDir);
  const files = fs.readdirSync(photosDir)
    .filter((name) => /\.(jpe?g|png|webp|gif|heic)$/i.test(name))
    .map((name) => {
      const filePath = path.join(photosDir, name);
      const stats = fs.statSync(filePath);
      const saved = manifest[name] || {};

      return {
        id: saved.id || name.replace(/\.[^.]+$/, ""),
        filename: name,
        url: buildPhotoUrl(name),
        caption: String(saved.caption || "").trim(),
        uploaderName: String(saved.uploaderName || "").trim(),
        createdAt: saved.createdAt || stats.birthtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  photos = files;
}

function getPhotos() {
  return photos.map(clonePhoto);
}

function getPublicPhotoPeopleState() {
  return {
    photos: getPhotos(),
    count: photos.length,
    photosDir: getPhotosDir()
  };
}

function addPhoto({ filename, caption = "", uploaderName = "" }) {
  const photosDir = getPhotosDir();
  const safeName = path.basename(String(filename || ""));

  if (!safeName) {
    throw new Error("Nom de fichier invalide.");
  }

  const filePath = path.join(photosDir, safeName);
  if (!fs.existsSync(filePath)) {
    throw new Error("Fichier photo introuvable.");
  }

  const photo = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    filename: safeName,
    url: buildPhotoUrl(safeName),
    caption: String(caption || "").trim(),
    uploaderName: String(uploaderName || "").trim(),
    createdAt: new Date().toISOString()
  };

  const manifest = readManifest(photosDir);
  manifest[safeName] = {
    id: photo.id,
    caption: photo.caption,
    uploaderName: photo.uploaderName,
    createdAt: photo.createdAt
  };
  writeManifest(manifest, photosDir);

  photos.unshift(photo);

  while (photos.length > MAX_PHOTOS) {
    const removed = photos.pop();
    deletePhotoFile(removed.filename, photosDir);
    delete manifest[removed.filename];
    writeManifest(manifest, photosDir);
  }

  return clonePhoto(photo);
}

function clearAllPhotos() {
  photos = [];
}

function removePhoto(photoId) {
  const photosDir = getPhotosDir();
  const index = photos.findIndex((photo) => photo.id === photoId);

  if (index < 0) {
    throw new Error("Photo introuvable.");
  }

  const [removed] = photos.splice(index, 1);
  deletePhotoFile(removed.filename, photosDir);

  const manifest = readManifest(photosDir);
  delete manifest[removed.filename];
  writeManifest(manifest, photosDir);

  return clonePhoto(removed);
}

loadPhotosFromDisk();

module.exports = {
  MODULE_DIR,
  CONFIG_FILE,
  DEFAULT_PHOTOS_DIR,
  MAX_PHOTOS,
  getPhotosDir,
  setPhotosDir,
  getDefaultPhotosDir: () => DEFAULT_PHOTOS_DIR,
  loadPhotosFromDisk,
  getPhotos,
  getPublicPhotoPeopleState,
  addPhoto,
  clearAllPhotos,
  removePhoto
};
