const assert = require("node:assert/strict");
const test = require("node:test");
const { createAttemptLimiter } = require("../lib/attempts");

test("borne les tentatives et reouvre la fenetre apres expiration", () => {
  let timestamp = 1_000;
  const limiter = createAttemptLimiter({ maxAttempts: 2, windowMs: 500, now: () => timestamp });
  assert.equal(limiter.attempt("ip:share"), true);
  assert.equal(limiter.attempt("ip:share"), true);
  assert.equal(limiter.attempt("ip:share"), false);
  timestamp = 1_501;
  assert.equal(limiter.attempt("ip:share"), true);
});

test("efface les echecs apres une authentification reussie", () => {
  const limiter = createAttemptLimiter({ maxAttempts: 1, windowMs: 500 });
  assert.equal(limiter.attempt("ip:share"), true);
  assert.equal(limiter.attempt("ip:share"), false);
  limiter.clear("ip:share");
  assert.equal(limiter.attempt("ip:share"), true);
});
