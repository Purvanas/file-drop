const assert = require("node:assert/strict");
const test = require("node:test");
const { createPasswordService } = require("../lib/passwords");

test("borne les derivations scrypt concurrentes sans bloquer l'event loop", async () => {
  const callbacks = [];
  const service = createPasswordService({
    maxConcurrent: 2,
    randomBytes: () => Buffer.alloc(16, 1),
    scrypt: (password, salt, length, callback) => callbacks.push(callback),
  });

  const first = service.hash("un");
  const second = service.hash("deux");
  await assert.rejects(service.hash("trois"), error => error.code === "SCRYPT_BUSY");
  assert.equal(service.active, 2);

  callbacks.shift()(null, Buffer.alloc(32, 2));
  await first;
  assert.equal(service.active, 1);
  callbacks.shift()(null, Buffer.alloc(32, 3));
  await second;
  assert.equal(service.active, 0);
});

test("conserve la verification des anciens condensats SHA-256", async () => {
  const crypto = require("node:crypto");
  const legacy = crypto.createHash("sha256").update("secret").digest("hex");
  const service = createPasswordService();
  assert.equal(await service.verify("secret", legacy), true);
  assert.equal(await service.verify("incorrect", legacy), false);
});
