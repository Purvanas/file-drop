const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "filedrop-http-"));
process.env.UPLOAD_DIR = path.join(root, "uploads");
process.env.CHUNKS_DIR = path.join(root, "chunks");
process.env.DATA_DIR = path.join(root, "data");
process.env.RATE_LIMIT_MAX = "1000";

const { app } = require("../server");

async function withServer(callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("Multer 2 accepte le formulaire historique borne", async () => {
  await withServer(async baseUrl => {
    const form = new FormData();
    form.append("file", new Blob(["contenu"], { type: "text/plain" }), "note.txt");
    form.append("ttl", "15");
    form.append("password", "secret-de-test");
    const response = await fetch(`${baseUrl}/api/upload`, { method: "POST", body: form });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.match(body.id, /^[a-f0-9]{32}$/);
    assert.equal(body.hasPassword, true);
  });
});

test("rejette les parties multipart excedentaires", async () => {
  await withServer(async baseUrl => {
    const form = new FormData();
    form.append("file", new Blob(["contenu"]), "note.txt");
    form.append("ttl", "15");
    form.append("password", "secret-de-test");
    form.append("extra", "interdit");
    const response = await fetch(`${baseUrl}/api/upload`, { method: "POST", body: form });
    assert.equal(response.status, 400);
  });
});
