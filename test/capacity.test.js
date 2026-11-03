const assert = require("node:assert/strict");
const test = require("node:test");
const { createReservationPool } = require("../lib/capacity");

test("les reservations concurrentes ne depassent jamais le quota", () => {
  let committed = 20;
  const pool = createReservationPool({ limitBytes: 100, getCommittedBytes: () => committed });
  const first = pool.reserve(60);
  assert.ok(first);
  assert.equal(pool.reserve(30), null);
  assert.equal(pool.totalBytes, 80);

  committed = 30;
  assert.equal(pool.reserve(20), null);
  first.release();
  assert.ok(pool.reserve(70));
});

test("la fermeture d'une requete peut liberer sa reservation une seule fois", () => {
  const pool = createReservationPool({ limitBytes: 50 });
  const abortedRequest = pool.reserve(50);
  assert.ok(abortedRequest);
  assert.equal(pool.reserve(1), null);
  assert.equal(abortedRequest.release(), true);
  assert.equal(abortedRequest.release(), false);
  assert.equal(pool.reservedBytes, 0);
  assert.ok(pool.reserve(50));
});
