const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { concatenateFiles, createMetadataStore, isInside } = require("../lib/storage");

test("restaure uniquement les partages actifs contenus dans uploads", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "filedrop-store-"));
  const uploads = path.join(root, "uploads");
  fs.mkdirSync(uploads);
  const activePath = path.join(uploads, "0123456789abcdef");
  fs.writeFileSync(activePath, "actif");
  fs.writeFileSync(path.join(root, "metadata.json"), JSON.stringify({ version: 1, records: [
    { id: "0123456789abcdef", filePath: activePath, expiresAt: 2_000, type: "paste", size: 5 },
    { id: "fedcba9876543210", filePath: path.join(root, "outside"), expiresAt: 2_000, type: "file", size: 1 },
  ] }));

  const store = createMetadataStore({ filePath: path.join(root, "metadata.json"), uploadDir: uploads, now: () => 1_000 });
  assert.deepEqual(store.load(), { loaded: 1, discarded: 1 });
  assert.equal(store.records.get("0123456789abcdef").type, "paste");
});

test("concatène les morceaux sans les charger entièrement en mémoire", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "filedrop-concat-"));
  const a = path.join(root, "a");
  const b = path.join(root, "b");
  const output = path.join(root, "out");
  fs.writeFileSync(a, "hello ");
  fs.writeFileSync(b, "world");
  await concatenateFiles([a, b], output);
  assert.equal(fs.readFileSync(output, "utf8"), "hello world");
});

test("préserve les fichiers si les métadonnées sont corrompues", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "filedrop-corrupt-"));
  const uploads = path.join(root, "uploads");
  fs.mkdirSync(uploads);
  const uploadPath = path.join(uploads, "aaaaaaaaaaaaaaaa");
  fs.writeFileSync(uploadPath, "important");
  const filePath = path.join(root, "metadata.json");
  fs.writeFileSync(filePath, "{invalide");

  const store = createMetadataStore({ filePath, uploadDir: uploads });
  assert.throws(() => store.load(), /preserver les fichiers/);
  assert.equal(fs.readFileSync(uploadPath, "utf8"), "important");
});

test("refuse le premier démarrage si uploads contient des fichiers sans index", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "filedrop-no-index-"));
  const uploads = path.join(root, "uploads");
  fs.mkdirSync(uploads);
  const uploadPath = path.join(uploads, "d".repeat(32));
  fs.writeFileSync(uploadPath, "legacy");
  const store = createMetadataStore({ filePath: path.join(root, "missing.json"), uploadDir: uploads });

  assert.throws(() => store.load(), /migration manuelle requise/);
  assert.equal(fs.readFileSync(uploadPath, "utf8"), "legacy");
});

test("annule l'ajout en mémoire si la persistance échoue", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "filedrop-persist-fail-"));
  const uploads = path.join(root, "uploads");
  fs.mkdirSync(uploads);
  const store = createMetadataStore({
    filePath: path.join(root, "metadata.json"),
    uploadDir: uploads,
    writeJson: () => { throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); },
  });

  assert.throws(() => store.set("a".repeat(32), { filePath: path.join(uploads, "a".repeat(32)), expiresAt: Date.now() + 1000 }), /disk full/);
  assert.equal(store.records.has("a".repeat(32)), false);
});

test("garde la métadonnée lorsque la suppression disque échoue", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "filedrop-unlink-fail-"));
  const uploads = path.join(root, "uploads");
  fs.mkdirSync(uploads);
  const filePath = path.join(uploads, "b".repeat(32));
  fs.writeFileSync(filePath, "contenu");
  let writes = 0;
  const failingFs = new Proxy(fs, {
    get(target, property) {
      if (property === "unlinkSync") return () => { throw Object.assign(new Error("permission denied"), { code: "EACCES" }); };
      return target[property];
    },
  });
  const store = createMetadataStore({
    filePath: path.join(root, "metadata.json"),
    uploadDir: uploads,
    fileSystem: failingFs,
    writeJson: () => { writes++; },
  });
  store.set("b".repeat(32), { filePath, expiresAt: Date.now() + 1000 });

  assert.equal(store.remove("b".repeat(32)), false);
  assert.equal(store.records.has("b".repeat(32)), true);
  assert.equal(writes, 1);
});

test("retire la métadonnée si le fichier est déjà absent", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "filedrop-unlink-missing-"));
  const uploads = path.join(root, "uploads");
  fs.mkdirSync(uploads);
  const filePath = path.join(uploads, "c".repeat(32));
  const missingFs = new Proxy(fs, {
    get(target, property) {
      if (property === "unlinkSync") return () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); };
      return target[property];
    },
  });
  const store = createMetadataStore({
    filePath: path.join(root, "metadata.json"),
    uploadDir: uploads,
    fileSystem: missingFs,
    writeJson: () => {},
  });
  store.set("c".repeat(32), { filePath, expiresAt: Date.now() + 1000 });

  assert.equal(store.remove("c".repeat(32)), true);
  assert.equal(store.records.has("c".repeat(32)), false);
});

test("refuse un chemin qui sort du répertoire d'uploads", () => {
  assert.equal(isInside("/srv/app/uploads", "/srv/app/uploads/file"), true);
  assert.equal(isInside("/srv/app/uploads", "/srv/app/private"), false);
});
