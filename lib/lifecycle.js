function releaseOnResponseEnd(response, release) {
  let released = false;
  const releaseOnce = () => {
    if (released) return false;
    released = true;
    response.removeListener("finish", releaseOnce);
    response.removeListener("close", releaseOnce);
    release();
    return true;
  };
  response.once("finish", releaseOnce);
  response.once("close", releaseOnce);
  return releaseOnce;
}

module.exports = { releaseOnResponseEnd };
