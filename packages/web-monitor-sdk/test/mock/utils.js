/* eslint-disable @typescript-eslint/no-require-imports -- jest mock harness loads modules via CJS require */
export function overrideFetch(cb) {
  // Override the fetch patched by monitor to skip reporting
  const monitorFetch = window.fetch;
  window.fetch = function () {
    if (arguments[1] && arguments[1].type === "report-data") {
      if (cb) {
        cb.apply(this, arguments);
      }
      // report
      return Promise.resolve();
    }
    return monitorFetch.apply(this, arguments);
  };
}

/**
 * Resolve once `predicate` returns true, polling until `timeoutMs` elapses.
 * Report delivery runs through SDK-internal timers (outTime), so a fixed sleep
 * is flaky when several jest workers compete for CPU.
 */
export function waitFor(predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      if (predicate()) {
        resolve();
      } else if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`condition was not met within ${timeoutMs}ms`));
      } else {
        setTimeout(tick, 25);
      }
    };
    tick();
  });
}

const http = require("http");
const path = require("path");
const fs = require("fs");
export function httpServer(config) {
  const server = http.createServer((req, res) => {
    const reqPath = req.url.split("?")[0];
    if (reqPath === config.path) {
      if (config.isBlob) {
        const filePath = path.resolve(__dirname, "./mock.js");
        const stats = fs.statSync(filePath);
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": "attachment; filename=mock",
          "Content-length": stats.size,
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("x-qexr-trace-id", "Cxaq1.adc");
        res.setHeader("access-control-expose-headers", "x-qexr-trace-id");
        res.end(JSON.stringify(config.res));
      }
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  server.listen(config.port);
}
