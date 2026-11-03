const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { finished, pipeline } = require("stream/promises");

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch {}
    throw error;
  }
}

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function createMetadataStore({ filePath, uploadDir, now = () => Date.now(), fileSystem = fs, writeJson = atomicWriteJson }) {
  const records = new Map();

  function persist() {
    const serializable = [...records.entries()].map(([id, meta]) => ({ id, ...meta }));
    writeJson(filePath, { version: 1, records: serializable });
  }

  function load() {
    let data = { records: [] };
    const indexExists = fileSystem.existsSync(filePath);
    if (indexExists) {
      try { data = JSON.parse(fileSystem.readFileSync(filePath, "utf8")); }
      catch { throw new Error("Metadonnees de partage illisibles; demarrage interrompu pour preserver les fichiers"); }
      if (!data || !Array.isArray(data.records)) {
        throw new Error("Format de metadonnees invalide; demarrage interrompu pour preserver les fichiers");
      }
    } else {
      const existingUploads = fileSystem.readdirSync(uploadDir, { withFileTypes: true }).filter(entry => entry.isFile());
      if (existingUploads.length > 0) {
        throw new Error("Index shares.json absent alors que uploads contient des fichiers; migration manuelle requise, aucun fichier supprime");
      }
    }

    let discarded = 0;
    for (const item of Array.isArray(data.records) ? data.records : []) {
      const { id, ...meta } = item || {};
      // Keep legacy 64-bit IDs readable while issuing 128-bit IDs for new shares.
      const safeId = typeof id === "string" && /^(?:[a-f0-9]{16}|[a-f0-9]{32})$/.test(id);
      const safePath = typeof meta.filePath === "string" && isInside(uploadDir, meta.filePath);
      const safeSize = Number.isSafeInteger(meta.size) && meta.size >= 0;
      const usable = safeId && safePath && safeSize && Number.isFinite(meta.expiresAt) && meta.expiresAt > now() && fileSystem.existsSync(meta.filePath);
      if (!usable) {
        discarded++;
        if (safePath && fileSystem.existsSync(meta.filePath)) {
          try { fileSystem.unlinkSync(meta.filePath); } catch {}
        }
        continue;
      }
      records.set(id, meta);
    }
    const referenced = new Set([...records.values()].map(meta => path.resolve(meta.filePath)));
    for (const entry of fileSystem.readdirSync(uploadDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const candidate = path.resolve(uploadDir, entry.name);
      if (!referenced.has(candidate)) {
        try { fileSystem.unlinkSync(candidate); discarded++; } catch {}
      }
    }
    persist();
    return { loaded: records.size, discarded };
  }

  function set(id, meta) {
    const hadPrevious = records.has(id);
    const previous = records.get(id);
    records.set(id, meta);
    try { persist(); }
    catch (error) {
      if (hadPrevious) records.set(id, previous);
      else records.delete(id);
      throw error;
    }
  }

  function remove(id, { deleteFile = true } = {}) {
    const meta = records.get(id);
    if (!meta) return false;
    if (deleteFile && isInside(uploadDir, meta.filePath)) {
      try { fileSystem.unlinkSync(meta.filePath); }
      catch (error) {
        if (error?.code !== "ENOENT") return false;
      }
    }
    records.delete(id);
    try { persist(); }
    catch (error) {
      records.set(id, meta);
      throw error;
    }
    return true;
  }

  return { records, load, persist, set, remove };
}

async function concatenateFiles(sourcePaths, destinationPath) {
  const output = fs.createWriteStream(destinationPath, { flags: "wx", mode: 0o600 });
  try {
    for (const sourcePath of sourcePaths) {
      await pipeline(fs.createReadStream(sourcePath), output, { end: false });
    }
    output.end();
    await finished(output);
  } catch (error) {
    output.destroy();
    try { fs.unlinkSync(destinationPath); } catch {}
    throw error;
  }
}

module.exports = { atomicWriteJson, concatenateFiles, createMetadataStore, isInside };
