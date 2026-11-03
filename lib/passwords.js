const crypto = require("crypto");

function busyError() {
  const error = new Error("Service de mot de passe occupe");
  error.code = "SCRYPT_BUSY";
  return error;
}

function createPasswordService({
  maxConcurrent = 4,
  scrypt = crypto.scrypt,
  randomBytes = crypto.randomBytes,
} = {}) {
  let active = 0;

  async function derive(password, salt) {
    if (active >= maxConcurrent) throw busyError();
    active++;
    try {
      return await new Promise((resolve, reject) => {
        scrypt(String(password || "").slice(0, 1024), salt, 32, (error, key) => {
          if (error) reject(error);
          else resolve(key);
        });
      });
    } finally {
      active--;
    }
  }

  async function hash(password) {
    const salt = randomBytes(16).toString("hex");
    const key = await derive(password, salt);
    return `scrypt$${salt}$${key.toString("hex")}`;
  }

  async function verify(password, stored) {
    let candidate;
    let expected;
    if (typeof stored === "string" && stored.startsWith("scrypt$")) {
      const [, salt, encoded] = stored.split("$");
      if (!salt || !/^[a-f0-9]{64}$/i.test(encoded || "")) return false;
      candidate = await derive(password, salt);
      expected = Buffer.from(encoded, "hex");
    } else {
      candidate = Buffer.from(crypto.createHash("sha256").update(String(password || "")).digest("hex"), "hex");
      expected = Buffer.from(typeof stored === "string" ? stored : "", "hex");
    }
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }

  return {
    hash,
    verify,
    get active() { return active; },
  };
}

module.exports = { createPasswordService };
