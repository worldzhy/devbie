/* eslint-disable @typescript-eslint/no-require-imports -- jest mock harness loads modules via CJS require */
import { perResource as _perResource } from "./mock";
import fetch from "node-fetch";

window.fetch = fetch;
// jest provides the window object via jsdom
window.XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
// Enumerable properties: XMLHttpRequest instances have them, but so does the XMLHttpRequest constructor, which some libraries rely on
window.XMLHttpRequest.UNSENT = 0;
window.XMLHttpRequest.OPENED = 1;
window.XMLHttpRequest.HEADERS_RECEIVED = 2;
window.XMLHttpRequest.LOADING = 3;
window.XMLHttpRequest.DONE = 4;
window.performance.getEntries = function () {
  return [];
};
let _entriesByTypeArr = [];
const observerCallbacks = [];
window.performance.getEntriesByType = function (type) {
  if (type === "navigation") {
    return [
      {
        connectEnd: 1.4800000935792923,
        connectStart: 1.4800000935792923,
        decodedBodySize: 738,
        domComplete: 583.9700000360608,
        domContentLoadedEventEnd: 267.86500005982816,
        domContentLoadedEventStart: 267.750000115484,
        domInteractive: 267.7150000818074,
        domainLookupEnd: 1.4800000935792923,
        domainLookupStart: 1.4800000935792923,
        duration: 584.000000031665,
        encodedBodySize: 738,
        entryType: "navigation",
        fetchStart: 1.4800000935792923,
        initiatorType: "navigation",
        loadEventEnd: 584.000000031665,
        loadEventStart: 583.9900001883507,
        name: "https://localhost/",
        nextHopProtocol: "h2",
        redirectCount: 0,
        redirectEnd: 0,
        redirectStart: 0,
        requestStart: 6.880000000819564,
        responseEnd: 48.7900001462549,
        responseStart: 47.17000015079975,
        secureConnectionStart: 0,
        serverTiming: [],
        startTime: 0,
        transferSize: 95,
        type: "reload",
        unloadEventEnd: 53.7650000769645,
        unloadEventStart: 53.7650000769645,
        workerStart: 0,
        workerTiming: [],
      },
    ];
  }
  if (type === "paint") {
    return [
      {
        duration: 0,
        entryType: "paint",
        name: "first-paint",
        startTime: 581.9850000552833,
      },
      {
        duration: 0,
        entryType: "paint",
        name: "first-contentful-paint",
        startTime: 581.9850000552833,
      },
    ];
  }
  return _entriesByTypeArr;
};

/** Manually flush the simulated performance resource queue */
window.mockPerformanceEntriesAdd = (resource) => {
  _entriesByTypeArr.push(resource);
  observerCallbacks.forEach((cb) => {
    cb({
      getEntriesByType() {
        return [resource];
      },
    });
  });
};

/** Simulated PerformanceObserver with a resource listener queue */
window.PerformanceObserver = function (fn) {
  this.observe = function () {};
  observerCallbacks.push(fn);
};

window.performance.clearResourceTimings = function () {
  _entriesByTypeArr = [];
};
window.performance.timing = {
  connectStart: 1608692819143,
  navigationStart: 1608692819142,
  loadEventEnd: 1608692820349,
  domLoading: 1608692819259,
  secureConnectionStart: 0,
  fetchStart: 1608692819143,
  domContentLoadedEventStart: 1608692819622,
  responseStart: 1608692819197,
  responseEnd: 1608692819199,
  domInteractive: 1608692819622,
  domainLookupEnd: 1608692819143,
  redirectStart: 0,
  requestStart: 1608692819155,
  unloadEventEnd: 1608692819249,
  unloadEventStart: 1608692819249,
  domComplete: 1608692820348,
  domainLookupStart: 1608692819143,
  loadEventStart: 1608692820348,
  domContentLoadedEventEnd: 1608692819622,
  redirectEnd: 0,
  connectEnd: 1608692819143,
};
