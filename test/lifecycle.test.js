const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { releaseOnResponseEnd } = require("../lib/lifecycle");

test("libere l'etat receiving quand le client ferme la connexion", () => {
  const response = new EventEmitter();
  let releases = 0;
  releaseOnResponseEnd(response, () => { releases++; });

  response.emit("close");
  response.emit("finish");
  assert.equal(releases, 1);
  assert.equal(response.listenerCount("close"), 0);
  assert.equal(response.listenerCount("finish"), 0);
});

test("la liberation anticipee reste idempotente", () => {
  const response = new EventEmitter();
  let releases = 0;
  const release = releaseOnResponseEnd(response, () => { releases++; });
  assert.equal(release(), true);
  assert.equal(release(), false);
  response.emit("close");
  assert.equal(releases, 1);
});
