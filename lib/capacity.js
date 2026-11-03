function createReservationPool({ limitBytes, getCommittedBytes = () => 0 }) {
  let reservedBytes = 0;

  function reserve(bytes) {
    if (!Number.isSafeInteger(bytes) || bytes <= 0) return null;
    if (getCommittedBytes() + reservedBytes + bytes > limitBytes) return null;
    reservedBytes += bytes;
    let released = false;
    return {
      bytes,
      release() {
        if (released) return false;
        released = true;
        reservedBytes -= bytes;
        return true;
      },
    };
  }

  return {
    reserve,
    get reservedBytes() { return reservedBytes; },
    get totalBytes() { return getCommittedBytes() + reservedBytes; },
  };
}

module.exports = { createReservationPool };
