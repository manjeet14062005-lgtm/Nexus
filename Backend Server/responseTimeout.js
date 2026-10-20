// The investigation owns an 85s cancellation deadline; its HTTP response must
// remain open long enough to return that result/error before the client's 100s
// deadline. Ordinary endpoints retain the configured short response timeout.
function createResponseTimeout({ defaultTimeoutMs = 30000, investigationTimeoutMs = 95000 } = {}) {
  return (req, res, next) => {
    const investigation = req.method === 'POST' && /^\/workspaces\/[^/]+\/intelligence$/.test(req.path);
    res.setTimeout(investigation ? Math.max(defaultTimeoutMs, investigationTimeoutMs) : defaultTimeoutMs);
    next();
  };
}
module.exports = { createResponseTimeout };
