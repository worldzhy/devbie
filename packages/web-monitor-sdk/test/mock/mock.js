export const mockBaseFetchApi = {
  api: "http://localhost:8996/getError/123?_=1608712358896&type=realTime&appId=Yiy52hX1608176251099&pageNo=1&pageSize=10&realTime=1",
  port: 8996,
  path: "/getError/123",
};
export const mockBaseXhrApi = {
  api: "http://localhost:8995/getError/321/b/789?_=1608712358896&type=realTime&appId=Yiy52hX1608176251099&pageNo=1&pageSize=10&realTime=1",
  port: 8995,
  path: "/getError/321/b/789",
};

export const mockXhrBlobApi = {
  api: "http://localhost:8994/getBlob?_=1608712358896&type=realTime&appId=Yiy52hX1608176251099&pageNo=1&pageSize=10&realTime=1",
  port: 8994,
  path: "/getBlob",
  isBlob: true,
};

export const mockErrcodeReportApi = {
  api: "http://localhost:8998/errcodeReportTest",
  res: { errcode: 1, errmsg: "errcodeReportTest" },
  port: 8998,
  path: "/errcodeReportTest",
};
export const mockHttpStatusError = {
  api: "http://localhost:8997/mockHttpStatusError/404?type=2",
  statuscode: 404,
  port: 8997,
  path: "/mockHttpStatusError",
};

const commonMock = {
  workerStart: 0,
  redirectStart: 0,
  redirectEnd: 0,
  fetchStart: 90427.23999964073,
  domainLookupStart: 0,
  domainLookupEnd: 0,
  connectStart: 0,
  connectEnd: 0,
  secureConnectionStart: 0,
  requestStart: 0,
  responseStart: 0,
  responseEnd: 90699.30499978364,
  transferSize: 0,
  encodedBodySize: 0,
  decodedBodySize: 0,
  serverTiming: [],
  workerTiming: [],
};
export const mockPerformanceResource = {
  xhr: {
    name: mockBaseXhrApi.api,
    entryType: "resource",
    startTime: 90427.23999964073,
    duration: 272.06500014290214,
    initiatorType: "xmlhttprequest",
    nextHopProtocol: "h2",
    ...commonMock,
  },
  xhrBlob: {
    name: mockXhrBlobApi.api,
    entryType: "resource",
    startTime: 90427.23999964073,
    duration: 272.06500014290214,
    initiatorType: "xmlhttprequest",
    nextHopProtocol: "h2",
    ...commonMock,
  },
  fetch: {
    name: mockBaseFetchApi.api,
    entryType: "resource",
    startTime: 90427.23999964073,
    duration: 272.06500014290214,
    initiatorType: "fetch",
    nextHopProtocol: "h2",
    ...commonMock,
  },
  fetchErrcode: {
    name: mockErrcodeReportApi.api,
    entryType: "resource",
    startTime: 90427.23999964073,
    duration: 272.06500014290214,
    initiatorType: "fetch",
    nextHopProtocol: "h2",
    ...commonMock,
  },
  fetchHttpErr: {
    name: mockHttpStatusError.api,
    entryType: "resource",
    startTime: 90427.23999964073,
    duration: 272.06500014290214,
    initiatorType: "fetch",
    nextHopProtocol: "h2",
    ...commonMock,
  },
};
export const XMLConstructorEnum = {
  UNSENT: 0,
  OPENED: 1,
  HEADERS_RECEIVED: 2,
  LOADING: 3,
  DONE: 4,
};

const mockError = new ReferenceError(`xx is not defined
    at Object.<anonymous> (all.js:24)
    at __webpack_require__ (bootstrap 6b2274ddf49ac8544721:712)
    at fn (bootstrap 6b2274ddf49ac8544721:117)
    at Object.<anonymous> (plugins.js:1)
    at __webpack_require__ (bootstrap 6b2274ddf49ac8544721:712)
    at fn (bootstrap 6b2274ddf49ac8544721:117)
    at Object.<anonymous> (log-apply-result.js:38)
    at __webpack_require__ (bootstrap 6b2274ddf49ac8544721:712)
    at fn (bootstrap 6b2274ddf49ac8544721:117)
    at Object.<anonymous> (index.vue:46)`);
mockError.message = "xx is not defined";
export const mockOnerrorInfo = [
  "Uncaught ReferenceError: xx is not defined",
  "http://127.0.0.1:8281/app/dw-healthshop-panel/main.8efc946b.js",
  99803,
  13,
  mockError,
];
