import { createRequire } from 'node:module'; import nodePath from 'node:path'; const require = createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/@hono/node-server/dist/constants-BLSFu_RU.mjs
var X_ALREADY_SENT;
var init_constants_BLSFu_RU = __esm({
  "node_modules/@hono/node-server/dist/constants-BLSFu_RU.mjs"() {
    X_ALREADY_SENT = "x-hono-already-sent";
  }
});

// node_modules/hono/dist/helper/websocket/index.js
var defineWebSocketHelper;
var init_websocket = __esm({
  "node_modules/hono/dist/helper/websocket/index.js"() {
    defineWebSocketHelper = (handler) => {
      return (...args) => {
        if (typeof args[0] === "function") {
          const [createEvents, options] = args;
          return async function upgradeWebSocket2(c, next) {
            const events = await createEvents(c);
            const result = await handler(c, events, options);
            if (result) {
              return result;
            }
            await next();
          };
        } else {
          const [c, events, options] = args;
          return (async () => {
            const upgraded = await handler(c, events, options);
            if (!upgraded) {
              throw new Error("Failed to upgrade WebSocket");
            }
            return upgraded;
          })();
        }
      };
    };
  }
});

// node_modules/@hono/node-server/dist/index.mjs
var dist_exports = {};
__export(dist_exports, {
  RequestError: () => RequestError,
  createAdaptorServer: () => createAdaptorServer,
  getRequestListener: () => getRequestListener,
  serve: () => serve,
  upgradeWebSocket: () => upgradeWebSocket
});
import { STATUS_CODES, createServer } from "node:http";
import { Http2ServerRequest, constants } from "node:http2";
import { Readable } from "node:stream";
async function readWithoutBlocking(readPromise) {
  return Promise.race([readPromise, Promise.resolve().then(() => Promise.resolve(void 0))]);
}
function writeFromReadableStreamDefaultReader(reader, writable, currentReadPromise) {
  const cancel = (error) => {
    reader.cancel(error).catch(() => {
    });
  };
  writable.on("close", cancel);
  writable.on("error", cancel);
  (currentReadPromise ?? reader.read()).then(flow, handleStreamError);
  return reader.closed.finally(() => {
    writable.off("close", cancel);
    writable.off("error", cancel);
  });
  function handleStreamError(error) {
    if (error) writable.destroy(error);
  }
  function onDrain() {
    reader.read().then(flow, handleStreamError);
  }
  function flow({ done, value }) {
    try {
      if (done) writable.end();
      else if (!writable.write(value)) writable.once("drain", onDrain);
      else return reader.read().then(flow, handleStreamError);
    } catch (e) {
      handleStreamError(e);
    }
  }
}
function writeFromReadableStream(stream, writable) {
  if (stream.locked) throw new TypeError("ReadableStream is locked.");
  else if (writable.destroyed) return;
  return writeFromReadableStreamDefaultReader(stream.getReader(), writable);
}
var RequestError, nonJoinedHeaders, validHeaderName, isHttpWhitespace, normalizeHeaderValue, forbiddenHeaderValue, GlobalHeaders, materializeHeaders, RequestHeaders, newHeadersFromIncoming, reValidRequestUrl, reDotSegment, reValidHost, buildUrl, toRequestError, GlobalRequest, Request$1, wrapBodyStream, byteExactEncodings, isByteExactEncoding, bodyBufferedBeforeDisconnectKey, bodyBufferedLengthBeforeDisconnectKey, toBufferChunk, isRecoverableDisconnectedIncoming, recordBodyBufferedBeforeDisconnect, readBodyBufferedBeforeDisconnect, enqueueBufferedBody, newRequestFromIncoming, getRequestCache, requestCache, incomingKey, urlKey, methodKey, headersKey, abortControllerKey, getAbortController, abortRequest, bodyBufferKey, bodyReadPromiseKey, bodyConsumedDirectlyKey, bodyLockReaderKey, abortReasonKey, newBodyUnusableError, rejectBodyUnusable, textDecoder, consumeBodyDirectOnce, toArrayBuffer, contentType, methodTokenRegExp, normalizeIncomingMethod, validateDirectReadMethod, readBodyWithFastPath, readRawBodyIfAvailable, normalizeAbortError, readBodyDirect, requestPrototype, newRequest, defaultContentType, responseCache, getResponseCache, cacheKey, GlobalResponse, Response$1, validRedirectUrl, parseRedirectUrl, validRedirectStatuses, buildOutgoingHttpHeaders, outgoingEnded, incomingDraining, DRAIN_TIMEOUT_MS, MAX_DRAIN_BYTES, drainIncoming, makeCloseHandler, isImmediateCacheableResponse, handleRequestError, handleFetchError, handleResponseError, flushHeaders, responseViaCache, isPromise, responseViaResponseObject, getRequestListener, CloseEvent, ErrorEvent, generateConnectionSymbol, CONNECTION_SYMBOL_KEY, WAIT_FOR_WEBSOCKET_SYMBOL, responseHeadersToSkip, appendResponseHeaders, rejectUpgradeRequest, createUpgradeRequest, setupWebSocket, upgradeWebSocket, createAdaptorServer, serve;
var init_dist = __esm({
  "node_modules/@hono/node-server/dist/index.mjs"() {
    init_constants_BLSFu_RU();
    init_websocket();
    RequestError = class extends Error {
      constructor(message, options) {
        super(message, options);
        this.name = "RequestError";
      }
    };
    nonJoinedHeaders = /* @__PURE__ */ new Set([
      "age",
      "authorization",
      "content-length",
      "content-type",
      "etag",
      "expires",
      "from",
      "host",
      "if-modified-since",
      "if-unmodified-since",
      "last-modified",
      "location",
      "max-forwards",
      "proxy-authorization",
      "referer",
      "retry-after",
      "server",
      "user-agent"
    ]);
    validHeaderName = /^[!#$%&'*+\-.^_`|~\dA-Za-z]+$/;
    isHttpWhitespace = (code) => code === 9 || code === 10 || code === 13 || code === 32;
    normalizeHeaderValue = (value) => {
      if (!isHttpWhitespace(value.charCodeAt(0)) && !isHttpWhitespace(value.charCodeAt(value.length - 1))) return value;
      let start = 0;
      let end = value.length;
      while (start < end && isHttpWhitespace(value.charCodeAt(start))) start++;
      while (end > start && isHttpWhitespace(value.charCodeAt(end - 1))) end--;
      return value.slice(start, end);
    };
    forbiddenHeaderValue = /[\0\r\n]/;
    GlobalHeaders = globalThis.Headers;
    materializeHeaders = (rawHeaders, HeadersCtor = GlobalHeaders) => {
      const headers = new HeadersCtor();
      for (let i = 0; i < rawHeaders.length; i += 2) {
        const name = rawHeaders[i];
        if (!name.startsWith(":")) headers.append(name, rawHeaders[i + 1]);
      }
      return headers;
    };
    RequestHeaders = class {
      #incoming;
      #rawHeaders;
      #headers;
      #invalidValue;
      constructor(incoming) {
        this.#incoming = incoming;
        if (incoming instanceof Http2ServerRequest) this.#rawHeaders = incoming.rawHeaders.slice();
      }
      get #lazyRawHeaders() {
        return this.#rawHeaders ??= this.#incoming.rawHeaders.slice();
      }
      get #native() {
        if (!this.#headers) {
          this.#headers = materializeHeaders(this.#lazyRawHeaders);
          this.#rawHeaders = void 0;
        }
        return this.#headers;
      }
      #normalizedName(name) {
        if (typeof name !== "string") return;
        if (!validHeaderName.test(name)) throw new TypeError(`Invalid header name: ${name}`);
        return name.toLowerCase();
      }
      #lookupHttp1(lowerName) {
        const headers = this.#incoming instanceof Http2ServerRequest ? void 0 : this.#incoming.headers;
        if (!headers || nonJoinedHeaders.has(lowerName) || lowerName === "set-cookie" || lowerName === "__proto__") return;
        if (!Object.hasOwn(headers, lowerName)) return null;
        const rawValue = headers[lowerName];
        if (typeof rawValue === "string") {
          const value = normalizeHeaderValue(rawValue);
          return forbiddenHeaderValue.test(value) ? void 0 : value;
        }
      }
      #lookup(rawHeaders, lowerName) {
        const separator = lowerName === "cookie" ? "; " : ", ";
        let value = null;
        for (let i = 0; i < rawHeaders.length; i += 2) {
          const rawName = rawHeaders[i];
          if (rawName.length === lowerName.length && rawName.toLowerCase() === lowerName) {
            const rawValue = normalizeHeaderValue(rawHeaders[i + 1]);
            if (forbiddenHeaderValue.test(rawValue)) {
              this.#invalidValue = true;
              return;
            }
            value = value === null ? rawValue : value + separator + rawValue;
          }
        }
        return value;
      }
      append(name, value) {
        this.#native.append(name, value);
      }
      delete(name) {
        this.#native.delete(name);
      }
      get(name) {
        const lowerName = this.#normalizedName(name);
        if (lowerName && !this.#headers && !this.#invalidValue) {
          const http1Value = this.#lookupHttp1(lowerName);
          if (http1Value !== void 0) return http1Value;
          const value = this.#lookup(this.#lazyRawHeaders, lowerName);
          if (value !== void 0) return value;
        }
        return this.#native.get(name);
      }
      has(name) {
        const lowerName = this.#normalizedName(name);
        if (lowerName && !this.#headers && !this.#invalidValue) {
          const http1Value = this.#lookupHttp1(lowerName);
          if (http1Value !== void 0) return http1Value !== null;
          const value = this.#lookup(this.#lazyRawHeaders, lowerName);
          if (value !== void 0) return value !== null;
        }
        return this.#native.has(name);
      }
      set(name, value) {
        this.#native.set(name, value);
      }
      getSetCookie() {
        return this.#native.getSetCookie();
      }
      keys() {
        return this.#native.keys();
      }
      values() {
        return this.#native.values();
      }
      entries() {
        return this.#native.entries();
      }
      forEach(callback, thisArg) {
        this.#native.forEach((value, key) => {
          callback.call(thisArg, value, key, this);
        });
      }
      [Symbol.iterator]() {
        return this.entries();
      }
    };
    Object.defineProperty(RequestHeaders.prototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
      return `Headers (lightweight) ${inspectFn(Object.fromEntries(this), {
        ...options,
        depth: depth == null ? null : depth - 1
      })}`;
    } });
    Object.setPrototypeOf(RequestHeaders.prototype, GlobalHeaders.prototype);
    newHeadersFromIncoming = (incoming) => globalThis.Headers === GlobalHeaders ? new RequestHeaders(incoming) : materializeHeaders(incoming.rawHeaders, globalThis.Headers);
    reValidRequestUrl = /^\/[!#$&-;=?-\[\]_a-z~]*$/;
    reDotSegment = /\/\.\.?(?:[/?#]|$)/;
    reValidHost = /^[a-z0-9._-]+(?::(?:[1-5]\d{3,4}|[6-9]\d{3}))?$/;
    buildUrl = (scheme, host2, incomingUrl) => {
      const url = `${scheme}://${host2}${incomingUrl}`;
      if (!reValidHost.test(host2)) {
        const urlObj = new URL(url);
        if (urlObj.hostname.length !== host2.length && urlObj.hostname !== (host2.includes(":") ? host2.replace(/:\d+$/, "") : host2).toLowerCase()) throw new RequestError("Invalid host header");
        return urlObj.href;
      } else if (incomingUrl.length === 0) return url + "/";
      else {
        if (incomingUrl.charCodeAt(0) !== 47) throw new RequestError("Invalid URL");
        if (!reValidRequestUrl.test(incomingUrl) || reDotSegment.test(incomingUrl)) return new URL(url).href;
        return url;
      }
    };
    toRequestError = (e) => {
      if (e instanceof RequestError) return e;
      return new RequestError(e.message, { cause: e });
    };
    GlobalRequest = global.Request;
    Request$1 = class extends GlobalRequest {
      constructor(input, options) {
        if (typeof input === "object" && getRequestCache in input) {
          const hasReplacementBody = options !== void 0 && "body" in options && options.body != null;
          if (input[bodyConsumedDirectlyKey] && !hasReplacementBody) throw new TypeError("Cannot construct a Request with a Request object that has already been used.");
          input = input[getRequestCache]();
        }
        if (typeof options?.body?.getReader !== "undefined") options.duplex ??= "half";
        super(input, options);
      }
    };
    wrapBodyStream = Symbol("wrapBodyStream");
    byteExactEncodings = /* @__PURE__ */ new Set([
      "latin1",
      "binary",
      "hex",
      "base64",
      "base64url"
    ]);
    isByteExactEncoding = (encoding) => encoding === null || byteExactEncodings.has(encoding);
    bodyBufferedBeforeDisconnectKey = Symbol("bodyBufferedBeforeDisconnect");
    bodyBufferedLengthBeforeDisconnectKey = Symbol("bodyBufferedLengthBeforeDisconnect");
    toBufferChunk = (chunk, encoding) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding ?? "utf8");
    isRecoverableDisconnectedIncoming = (incoming) => !(incoming instanceof Http2ServerRequest) && !!incoming.complete && !!incoming.readableAborted && typeof incoming.read === "function" && isByteExactEncoding(incoming.readableEncoding);
    recordBodyBufferedBeforeDisconnect = (incoming) => {
      if (incoming.readableDidRead || !isRecoverableDisconnectedIncoming(incoming)) return;
      const incomingWithRecovery = incoming;
      incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey] ??= incoming.readableLength;
    };
    readBodyBufferedBeforeDisconnect = (incoming, chunks) => {
      if (incoming.readableDidRead && !chunks || !isRecoverableDisconnectedIncoming(incoming)) return;
      const incomingWithRecovery = incoming;
      if (incomingWithRecovery[bodyBufferedBeforeDisconnectKey] !== void 0) return incomingWithRecovery[bodyBufferedBeforeDisconnectKey];
      let result;
      const errored = incoming.errored;
      if (errored && errored.code !== "ECONNRESET") result = errored;
      else if (incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey] !== void 0 && incoming.readableLength !== incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey]) result = newBodyUnusableError();
      else {
        const bodyChunks = chunks ?? [];
        const chunk = incoming.read();
        if (chunk !== null) bodyChunks.push(toBufferChunk(chunk, incoming.readableEncoding));
        const buffer = bodyChunks.length === 1 ? bodyChunks[0] : Buffer.concat(bodyChunks);
        result = buffer;
        const contentLength = incoming.headers["content-length"];
        if (typeof contentLength === "string" && /^\d+$/.test(contentLength)) {
          const expectedLength = Number(contentLength);
          if (Number.isSafeInteger(expectedLength) && buffer.length !== expectedLength) result = newBodyUnusableError();
        }
      }
      incomingWithRecovery[bodyBufferedBeforeDisconnectKey] = result;
      return result;
    };
    enqueueBufferedBody = (controller, buffered) => {
      if (buffered instanceof Error) {
        controller.error(buffered);
        return;
      }
      if (buffered.length > 0) controller.enqueue(buffered);
      controller.close();
    };
    newRequestFromIncoming = (method, url, headers, incoming, abortController) => {
      const init = {
        method,
        headers,
        signal: abortController.signal
      };
      if (method === "TRACE") {
        init.method = "GET";
        const req = new Request$1(url, init);
        Object.defineProperty(req, "method", { get() {
          return "TRACE";
        } });
        return req;
      }
      if (!(method === "GET" || method === "HEAD")) if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) init.body = new ReadableStream({ start(controller) {
        controller.enqueue(incoming.rawBody);
        controller.close();
      } });
      else if (incoming[wrapBodyStream]) {
        let reader;
        init.body = new ReadableStream({ async pull(controller) {
          try {
            if (!reader) {
              const buffered = readBodyBufferedBeforeDisconnect(incoming);
              if (buffered !== void 0) {
                enqueueBufferedBody(controller, buffered);
                return;
              }
            }
            reader ||= Readable.toWeb(incoming).getReader();
            const { done, value } = await reader.read();
            if (done) controller.close();
            else controller.enqueue(value);
          } catch (error) {
            controller.error(error);
          }
        } });
      } else {
        const buffered = readBodyBufferedBeforeDisconnect(incoming);
        if (buffered !== void 0) init.body = new ReadableStream({ start(controller) {
          enqueueBufferedBody(controller, buffered);
        } });
        else init.body = Readable.toWeb(incoming);
      }
      return new Request$1(url, init);
    };
    getRequestCache = Symbol("getRequestCache");
    requestCache = Symbol("requestCache");
    incomingKey = Symbol("incomingKey");
    urlKey = Symbol("urlKey");
    methodKey = Symbol("methodKey");
    headersKey = Symbol("headersKey");
    abortControllerKey = Symbol("abortControllerKey");
    getAbortController = Symbol("getAbortController");
    abortRequest = Symbol("abortRequest");
    bodyBufferKey = Symbol("bodyBuffer");
    bodyReadPromiseKey = Symbol("bodyReadPromise");
    bodyConsumedDirectlyKey = Symbol("bodyConsumedDirectly");
    bodyLockReaderKey = Symbol("bodyLockReader");
    abortReasonKey = Symbol("abortReason");
    newBodyUnusableError = () => {
      return /* @__PURE__ */ new TypeError("Body is unusable");
    };
    rejectBodyUnusable = () => {
      return Promise.reject(newBodyUnusableError());
    };
    textDecoder = new TextDecoder();
    consumeBodyDirectOnce = (request) => {
      if (request[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
      request[bodyConsumedDirectlyKey] = true;
    };
    toArrayBuffer = (buf) => {
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    };
    contentType = (request) => {
      return (request[headersKey] ||= newHeadersFromIncoming(request[incomingKey])).get("content-type") || "";
    };
    methodTokenRegExp = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
    normalizeIncomingMethod = (method) => {
      if (typeof method !== "string" || method.length === 0) return "GET";
      switch (method) {
        case "DELETE":
        case "GET":
        case "HEAD":
        case "OPTIONS":
        case "PATCH":
        case "POST":
        case "PUT":
        case "QUERY":
          return method;
      }
      const upper = method.toUpperCase();
      switch (upper) {
        case "DELETE":
        case "GET":
        case "HEAD":
        case "OPTIONS":
        case "POST":
        case "PUT":
          return upper;
        default:
          return method;
      }
    };
    validateDirectReadMethod = (method) => {
      if (!methodTokenRegExp.test(method)) return /* @__PURE__ */ new TypeError(`'${method}' is not a valid HTTP method.`);
      const normalized = method.toUpperCase();
      if (normalized === "CONNECT" || normalized === "TRACK" || normalized === "TRACE" && method !== "TRACE") return /* @__PURE__ */ new TypeError(`'${method}' HTTP method is unsupported.`);
    };
    readBodyWithFastPath = (request, method, fromBuffer) => {
      if (request[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
      const methodName = request.method;
      if (methodName === "GET" || methodName === "HEAD") return request[getRequestCache]()[method]();
      const methodValidationError = validateDirectReadMethod(methodName);
      if (methodValidationError) return Promise.reject(methodValidationError);
      if (request[requestCache]) {
        if (methodName !== "TRACE") return request[requestCache][method]();
      }
      const alreadyUsedError = consumeBodyDirectOnce(request);
      if (alreadyUsedError) return alreadyUsedError;
      const raw2 = readRawBodyIfAvailable(request);
      if (raw2) {
        const result = Promise.resolve(fromBuffer(raw2, request));
        request[bodyBufferKey] = void 0;
        return result;
      }
      return readBodyDirect(request).then((buf) => {
        const result = fromBuffer(buf, request);
        request[bodyBufferKey] = void 0;
        return result;
      });
    };
    readRawBodyIfAvailable = (request) => {
      const incoming = request[incomingKey];
      if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) return incoming.rawBody;
    };
    normalizeAbortError = (request, incoming) => {
      if (incoming.errored) return incoming.errored;
      const reason = request[abortReasonKey];
      if (reason !== void 0) return reason instanceof Error ? reason : new Error(String(reason));
      return /* @__PURE__ */ new Error("Client connection prematurely closed.");
    };
    readBodyDirect = (request) => {
      if (request[bodyBufferKey]) return Promise.resolve(request[bodyBufferKey]);
      if (request[bodyReadPromiseKey]) return request[bodyReadPromiseKey];
      const incoming = request[incomingKey];
      if (incoming.readableDidRead) return rejectBodyUnusable();
      const buffered = readBodyBufferedBeforeDisconnect(incoming);
      if (buffered !== void 0) {
        if (buffered instanceof Error) return Promise.reject(buffered);
        request[bodyBufferKey] = buffered;
        return Promise.resolve(buffered);
      }
      const promise = new Promise((resolve, reject) => {
        const chunks = [];
        let settled = false;
        const finish = (callback) => {
          if (settled) return;
          settled = true;
          cleanup();
          callback();
        };
        const recoverCompleteBodyAfterDisconnect = (error) => {
          const streamError = incoming.errored ?? error;
          if (!isRecoverableDisconnectedIncoming(incoming) || streamError && streamError.code !== "ECONNRESET") return false;
          finish(() => {
            const recovered = readBodyBufferedBeforeDisconnect(incoming, chunks);
            if (recovered instanceof Error) reject(recovered);
            else if (recovered === void 0) reject(error ?? normalizeAbortError(request, incoming));
            else {
              request[bodyBufferKey] = recovered;
              resolve(recovered);
            }
          });
          return true;
        };
        const onData = (chunk) => {
          chunks.push(toBufferChunk(chunk, incoming.readableEncoding));
        };
        const onEnd = () => {
          finish(() => {
            const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
            request[bodyBufferKey] = buffer;
            resolve(buffer);
          });
        };
        const onError = (error) => {
          if (recoverCompleteBodyAfterDisconnect(error)) return;
          finish(() => {
            reject(error);
          });
        };
        const onClose = () => {
          if (incoming.readableEnded) {
            onEnd();
            return;
          }
          if (recoverCompleteBodyAfterDisconnect()) return;
          finish(() => {
            reject(normalizeAbortError(request, incoming));
          });
        };
        const cleanup = () => {
          incoming.off("data", onData);
          incoming.off("end", onEnd);
          incoming.off("error", onError);
          incoming.off("close", onClose);
          request[bodyReadPromiseKey] = void 0;
        };
        incoming.on("data", onData);
        incoming.on("end", onEnd);
        incoming.on("error", onError);
        incoming.on("close", onClose);
        queueMicrotask(() => {
          if (settled) return;
          if (incoming.readableEnded) onEnd();
          else if (incoming.errored) onError(incoming.errored);
          else if (incoming.destroyed) onClose();
        });
      });
      request[bodyReadPromiseKey] = promise;
      return promise;
    };
    requestPrototype = {
      get method() {
        return this[methodKey];
      },
      get url() {
        return this[urlKey];
      },
      get headers() {
        return this[headersKey] ||= newHeadersFromIncoming(this[incomingKey]);
      },
      [abortRequest](reason) {
        if (this[abortReasonKey] === void 0) this[abortReasonKey] = reason;
        const abortController = this[abortControllerKey];
        if (abortController && !abortController.signal.aborted) abortController.abort(reason);
      },
      [getAbortController]() {
        this[abortControllerKey] ||= new AbortController();
        if (this[abortReasonKey] !== void 0 && !this[abortControllerKey].signal.aborted) this[abortControllerKey].abort(this[abortReasonKey]);
        return this[abortControllerKey];
      },
      [getRequestCache]() {
        const abortController = this[getAbortController]();
        if (this[requestCache]) return this[requestCache];
        const method = this.method;
        if (this[bodyConsumedDirectlyKey] && !(method === "GET" || method === "HEAD")) {
          this[bodyBufferKey] = void 0;
          const init = {
            method: method === "TRACE" ? "GET" : method,
            headers: this.headers,
            signal: abortController.signal
          };
          if (method !== "TRACE") {
            init.body = new ReadableStream({ start(c) {
              c.close();
            } });
            init.duplex = "half";
          }
          const req = new Request$1(this[urlKey], init);
          if (method === "TRACE") Object.defineProperty(req, "method", { get() {
            return "TRACE";
          } });
          return this[requestCache] = req;
        }
        return this[requestCache] = newRequestFromIncoming(this.method, this[urlKey], this.headers, this[incomingKey], abortController);
      },
      get body() {
        if (!this[bodyConsumedDirectlyKey]) return this[getRequestCache]().body;
        const request = this[getRequestCache]();
        if (!this[bodyLockReaderKey] && request.body) this[bodyLockReaderKey] = request.body.getReader();
        return request.body;
      },
      get bodyUsed() {
        if (this[bodyConsumedDirectlyKey]) return true;
        if (this[requestCache]) return this[requestCache].bodyUsed;
        return false;
      }
    };
    Object.defineProperty(requestPrototype, "signal", { get() {
      return this[getAbortController]().signal;
    } });
    [
      "cache",
      "credentials",
      "destination",
      "integrity",
      "mode",
      "redirect",
      "referrer",
      "referrerPolicy",
      "keepalive"
    ].forEach((k) => {
      Object.defineProperty(requestPrototype, k, { get() {
        return this[getRequestCache]()[k];
      } });
    });
    ["clone", "formData"].forEach((k) => {
      Object.defineProperty(requestPrototype, k, { value: function() {
        if (this[bodyConsumedDirectlyKey]) {
          if (k === "clone") throw newBodyUnusableError();
          return rejectBodyUnusable();
        }
        return this[getRequestCache]()[k]();
      } });
    });
    Object.defineProperty(requestPrototype, "text", { value: function() {
      return readBodyWithFastPath(this, "text", (buf) => textDecoder.decode(buf));
    } });
    Object.defineProperty(requestPrototype, "arrayBuffer", { value: function() {
      return readBodyWithFastPath(this, "arrayBuffer", (buf) => toArrayBuffer(buf));
    } });
    Object.defineProperty(requestPrototype, "blob", { value: function() {
      return readBodyWithFastPath(this, "blob", (buf, request) => {
        const type = contentType(request);
        const init = type ? { headers: { "content-type": type } } : void 0;
        return new Response(buf, init).blob();
      });
    } });
    Object.defineProperty(requestPrototype, "json", { value: function() {
      if (this[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
      return this.text().then(JSON.parse);
    } });
    Object.defineProperty(requestPrototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
      return `Request (lightweight) ${inspectFn({
        method: this.method,
        url: this.url,
        headers: this.headers,
        nativeRequest: this[requestCache]
      }, {
        ...options,
        depth: depth == null ? null : depth - 1
      })}`;
    } });
    Object.setPrototypeOf(requestPrototype, Request$1.prototype);
    newRequest = (incoming, defaultHostname) => {
      const req = Object.create(requestPrototype);
      req[incomingKey] = incoming;
      req[methodKey] = normalizeIncomingMethod(incoming.method);
      const incomingUrl = incoming.url || "";
      if (incomingUrl[0] !== "/" && (incomingUrl.startsWith("http://") || incomingUrl.startsWith("https://"))) {
        if (incoming instanceof Http2ServerRequest) throw new RequestError("Absolute URL for :path is not allowed in HTTP/2");
        try {
          req[urlKey] = new URL(incomingUrl).href;
        } catch (e) {
          throw new RequestError("Invalid absolute URL", { cause: e });
        }
        return req;
      }
      const host2 = (incoming instanceof Http2ServerRequest ? incoming.authority : incoming.headers.host) || defaultHostname;
      if (!host2) throw new RequestError("Missing host header");
      let scheme;
      if (incoming instanceof Http2ServerRequest) {
        scheme = incoming.scheme;
        if (!(scheme === "http" || scheme === "https")) throw new RequestError("Unsupported scheme");
      } else scheme = incoming.socket && incoming.socket.encrypted ? "https" : "http";
      try {
        req[urlKey] = buildUrl(scheme, host2, incomingUrl);
      } catch (e) {
        if (e instanceof RequestError) throw e;
        else throw new RequestError("Invalid URL", { cause: e });
      }
      return req;
    };
    defaultContentType = "text/plain; charset=UTF-8";
    responseCache = Symbol("responseCache");
    getResponseCache = Symbol("getResponseCache");
    cacheKey = Symbol("cache");
    GlobalResponse = global.Response;
    Response$1 = class Response$12 {
      #body;
      #init;
      [getResponseCache]() {
        const cache = this[cacheKey];
        const liveHeaders = cache && cache[2] instanceof Headers ? cache[2] : void 0;
        delete this[cacheKey];
        return this[responseCache] ||= new GlobalResponse(this.#body, liveHeaders ? {
          status: this.#init?.status,
          statusText: this.#init?.statusText,
          headers: liveHeaders
        } : this.#init);
      }
      constructor(body, init) {
        let headers;
        this.#body = body;
        if (init instanceof GlobalResponse) {
          const cachedGlobalResponse = init[responseCache];
          if (cachedGlobalResponse) {
            this.#init = cachedGlobalResponse;
            this[getResponseCache]();
            return;
          }
          this.#init = init instanceof Response$12 ? init.#init : init;
          headers = new Headers(init.headers);
        } else this.#init = init;
        if (body == null || typeof body === "string" || typeof body?.getReader !== "undefined" || body instanceof Blob || body instanceof Uint8Array) this[cacheKey] = [
          init?.status || 200,
          body ?? null,
          headers || init?.headers
        ];
      }
      get headers() {
        const cache = this[cacheKey];
        if (cache) {
          if (!(cache[2] instanceof Headers)) cache[2] = new Headers(cache[2] || (cache[1] === null ? void 0 : { "content-type": defaultContentType }));
          return cache[2];
        }
        return this[getResponseCache]().headers;
      }
      get status() {
        return this[cacheKey]?.[0] ?? this[getResponseCache]().status;
      }
      get ok() {
        const status = this.status;
        return status >= 200 && status < 300;
      }
    };
    [
      "body",
      "bodyUsed",
      "redirected",
      "statusText",
      "trailers",
      "type",
      "url"
    ].forEach((k) => {
      Object.defineProperty(Response$1.prototype, k, { get() {
        return this[getResponseCache]()[k];
      } });
    });
    [
      "arrayBuffer",
      "blob",
      "clone",
      "formData",
      "json",
      "text"
    ].forEach((k) => {
      Object.defineProperty(Response$1.prototype, k, { value: function() {
        return this[getResponseCache]()[k]();
      } });
    });
    Object.defineProperty(Response$1.prototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
      return `Response (lightweight) ${inspectFn({
        status: this.status,
        headers: this.headers,
        ok: this.ok,
        nativeResponse: this[responseCache]
      }, {
        ...options,
        depth: depth == null ? null : depth - 1
      })}`;
    } });
    Object.setPrototypeOf(Response$1, GlobalResponse);
    Object.setPrototypeOf(Response$1.prototype, GlobalResponse.prototype);
    validRedirectUrl = /^https?:\/\/[!#-;=?-[\]_a-z~A-Z]+$/;
    parseRedirectUrl = (url) => {
      if (url instanceof URL) return url.href;
      if (validRedirectUrl.test(url)) return url;
      return new URL(url).href;
    };
    validRedirectStatuses = /* @__PURE__ */ new Set([
      301,
      302,
      303,
      307,
      308
    ]);
    Object.defineProperty(Response$1, "redirect", {
      value: function redirect(url, status = 302) {
        if (!validRedirectStatuses.has(status)) throw new RangeError("Invalid status code");
        return new Response$1(null, {
          status,
          headers: { location: parseRedirectUrl(url) }
        });
      },
      writable: true,
      configurable: true
    });
    Object.defineProperty(Response$1, "json", {
      value: function json(data, init) {
        const body = JSON.stringify(data);
        if (body === void 0) throw new TypeError("The data is not JSON serializable");
        const initHeaders = init?.headers;
        let headers;
        if (initHeaders) {
          headers = new Headers(initHeaders);
          if (!headers.has("content-type")) headers.set("content-type", "application/json");
        } else headers = { "content-type": "application/json" };
        return new Response$1(body, {
          status: init?.status ?? 200,
          statusText: init?.statusText,
          headers
        });
      },
      writable: true,
      configurable: true
    });
    buildOutgoingHttpHeaders = (headers, defaultContentType2) => {
      const res = {};
      if (!(headers instanceof Headers)) headers = new Headers(headers ?? void 0);
      if (headers.has("set-cookie")) {
        const cookies = [];
        for (const [k, v] of headers) if (k === "set-cookie") cookies.push(v);
        else res[k] = v;
        if (cookies.length > 0) res["set-cookie"] = cookies;
      } else for (const [k, v] of headers) res[k] = v;
      if (defaultContentType2) res["content-type"] ??= defaultContentType2;
      return res;
    };
    outgoingEnded = Symbol("outgoingEnded");
    incomingDraining = Symbol("incomingDraining");
    DRAIN_TIMEOUT_MS = 500;
    MAX_DRAIN_BYTES = 64 * 1024 * 1024;
    drainIncoming = (incoming) => {
      const incomingWithDrainState = incoming;
      if (incoming.destroyed || incomingWithDrainState[incomingDraining]) return;
      incomingWithDrainState[incomingDraining] = true;
      if (incoming instanceof Http2ServerRequest) {
        try {
          incoming.stream?.close?.(constants.NGHTTP2_NO_ERROR);
        } catch {
        }
        return;
      }
      let bytesRead = 0;
      const cleanup = () => {
        clearTimeout(timer);
        incoming.off("data", onData);
        incoming.off("end", cleanup);
        incoming.off("error", cleanup);
      };
      const forceClose = () => {
        cleanup();
        const socket = incoming.socket;
        if (socket && !socket.destroyed) {
          if (typeof socket.destroySoon === "function") socket.destroySoon();
          else if (typeof socket.destroy === "function") socket.destroy();
        }
      };
      const timer = setTimeout(forceClose, DRAIN_TIMEOUT_MS);
      timer.unref?.();
      const onData = (chunk) => {
        bytesRead += chunk.length;
        if (bytesRead > MAX_DRAIN_BYTES) forceClose();
      };
      incoming.on("data", onData);
      incoming.on("end", cleanup);
      incoming.on("error", cleanup);
      incoming.resume();
    };
    makeCloseHandler = (req, incoming, outgoing, needsBodyCleanup) => () => {
      if (incoming.errored) {
        recordBodyBufferedBeforeDisconnect(incoming);
        req[abortRequest](incoming.errored.toString());
      } else if (!outgoing.writableFinished) {
        recordBodyBufferedBeforeDisconnect(incoming);
        req[abortRequest]("Client connection prematurely closed.");
      }
      if (needsBodyCleanup && !incoming.readableEnded) setTimeout(() => {
        if (!incoming.readableEnded) setTimeout(() => {
          drainIncoming(incoming);
        });
      });
    };
    isImmediateCacheableResponse = (res) => {
      if (!(cacheKey in res)) return false;
      const body = res[cacheKey][1];
      return body === null || typeof body === "string" || body instanceof Uint8Array;
    };
    handleRequestError = () => new Response(null, { status: 400 });
    handleFetchError = (e) => new Response(null, { status: e instanceof Error && (e.name === "TimeoutError" || e.constructor.name === "TimeoutError") ? 504 : 500 });
    handleResponseError = (e, outgoing) => {
      const err = e instanceof Error ? e : new Error("unknown error", { cause: e });
      if (err.code === "ERR_STREAM_PREMATURE_CLOSE") console.info("The user aborted a request.");
      else {
        console.error(e);
        if (!outgoing.headersSent) outgoing.writeHead(500, { "Content-Type": "text/plain" });
        outgoing.end(`Error: ${err.message}`);
        outgoing.destroy(err);
      }
    };
    flushHeaders = (outgoing) => {
      if ("flushHeaders" in outgoing && outgoing.writable) outgoing.flushHeaders();
    };
    responseViaCache = async (res, outgoing) => {
      let [status, body, header] = res[cacheKey];
      if (!header) {
        if (body === null) {
          outgoing.writeHead(status);
          outgoing.end();
        } else if (typeof body === "string") {
          outgoing.writeHead(status, {
            "Content-Type": defaultContentType,
            "Content-Length": Buffer.byteLength(body)
          });
          outgoing.end(body);
        } else if (body instanceof Uint8Array) {
          outgoing.writeHead(status, {
            "Content-Type": defaultContentType,
            "Content-Length": body.byteLength
          });
          outgoing.end(body);
        } else if (body instanceof Blob) {
          outgoing.writeHead(status, {
            "Content-Type": defaultContentType,
            "Content-Length": body.size
          });
          outgoing.end(new Uint8Array(await body.arrayBuffer()));
        } else {
          outgoing.writeHead(status, { "Content-Type": defaultContentType });
          flushHeaders(outgoing);
          await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
        }
        outgoing[outgoingEnded]?.();
        return;
      }
      let hasContentLength = false;
      if (header instanceof Headers) {
        hasContentLength = header.has("content-length");
        header = buildOutgoingHttpHeaders(header, body === null ? void 0 : defaultContentType);
      } else if (Array.isArray(header)) {
        const headerObj = new Headers(header);
        hasContentLength = headerObj.has("content-length");
        header = buildOutgoingHttpHeaders(headerObj, body === null ? void 0 : defaultContentType);
      } else for (const key in header) if (key.length === 14 && key.toLowerCase() === "content-length") {
        hasContentLength = true;
        break;
      }
      if (!hasContentLength) {
        if (typeof body === "string") header["Content-Length"] = Buffer.byteLength(body);
        else if (body instanceof Uint8Array) header["Content-Length"] = body.byteLength;
        else if (body instanceof Blob) header["Content-Length"] = body.size;
      }
      outgoing.writeHead(status, header);
      if (body == null) outgoing.end();
      else if (typeof body === "string" || body instanceof Uint8Array) outgoing.end(body);
      else if (body instanceof Blob) outgoing.end(new Uint8Array(await body.arrayBuffer()));
      else {
        flushHeaders(outgoing);
        await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
      }
      outgoing[outgoingEnded]?.();
    };
    isPromise = (res) => typeof res.then === "function";
    responseViaResponseObject = async (res, outgoing, options = {}) => {
      if (isPromise(res)) if (options.errorHandler) try {
        res = await res;
      } catch (err) {
        const errRes = await options.errorHandler(err);
        if (!errRes) return;
        res = errRes;
      }
      else res = await res.catch(handleFetchError);
      if (cacheKey in res) return responseViaCache(res, outgoing);
      const resHeaderRecord = buildOutgoingHttpHeaders(res.headers, res.body === null ? void 0 : defaultContentType);
      if (res.body) {
        const reader = res.body.getReader();
        const values = [];
        let done = false;
        let currentReadPromise = void 0;
        if (resHeaderRecord["transfer-encoding"] !== "chunked") {
          let maxReadCount = 2;
          for (let i = 0; i < maxReadCount; i++) {
            currentReadPromise ||= reader.read();
            const chunk = await readWithoutBlocking(currentReadPromise).catch((e) => {
              console.error(e);
              done = true;
            });
            if (!chunk) {
              if (i === 1) {
                await new Promise((resolve) => setTimeout(resolve));
                maxReadCount = 3;
                continue;
              }
              break;
            }
            currentReadPromise = void 0;
            if (chunk.value) values.push(chunk.value);
            if (chunk.done) {
              done = true;
              break;
            }
          }
          if (done && !("content-length" in resHeaderRecord)) resHeaderRecord["content-length"] = values.reduce((acc, value) => acc + value.length, 0);
        }
        outgoing.writeHead(res.status, resHeaderRecord);
        values.forEach((value) => {
          outgoing.write(value);
        });
        if (done) outgoing.end();
        else {
          if (values.length === 0) flushHeaders(outgoing);
          await writeFromReadableStreamDefaultReader(reader, outgoing, currentReadPromise);
        }
      } else if (resHeaderRecord[X_ALREADY_SENT]) {
      } else {
        outgoing.writeHead(res.status, resHeaderRecord);
        outgoing.end();
      }
      outgoing[outgoingEnded]?.();
    };
    getRequestListener = (fetchCallback, options = {}) => {
      const autoCleanupIncoming = options.autoCleanupIncoming ?? true;
      if (options.overrideGlobalObjects !== false && global.Request !== Request$1) {
        Object.defineProperty(global, "Request", { value: Request$1 });
        Object.defineProperty(global, "Response", { value: Response$1 });
      }
      return async (incoming, outgoing) => {
        let res, req;
        let needsBodyCleanup = false;
        let closeHandlerAttached = false;
        const ensureCloseHandler = () => {
          if (!req || closeHandlerAttached) return;
          closeHandlerAttached = true;
          outgoing.on("close", makeCloseHandler(req, incoming, outgoing, needsBodyCleanup));
        };
        try {
          req = newRequest(incoming, options.hostname);
          needsBodyCleanup = autoCleanupIncoming && !(incoming.method === "GET" || incoming.method === "HEAD");
          if (needsBodyCleanup) {
            incoming[wrapBodyStream] = true;
            if (incoming instanceof Http2ServerRequest) outgoing[outgoingEnded] = () => {
              if (!incoming.readableEnded) setTimeout(() => {
                if (!incoming.readableEnded) setTimeout(() => {
                  incoming.destroy();
                  outgoing.destroy();
                });
              });
            };
          }
          res = fetchCallback(req, {
            incoming,
            outgoing
          });
          if (!isPromise(res) && isImmediateCacheableResponse(res)) {
            if (needsBodyCleanup && !incoming.readableEnded) outgoing.once("finish", () => {
              if (!incoming.readableEnded) drainIncoming(incoming);
            });
            return responseViaCache(res, outgoing);
          }
          ensureCloseHandler();
        } catch (e) {
          if (!res) if (options.errorHandler) {
            ensureCloseHandler();
            res = await options.errorHandler(req ? e : toRequestError(e));
            if (!res) return;
          } else if (!req) res = handleRequestError();
          else res = handleFetchError(e);
          else return handleResponseError(e, outgoing);
        }
        try {
          return await responseViaResponseObject(res, outgoing, options);
        } catch (e) {
          return handleResponseError(e, outgoing);
        }
      };
    };
    CloseEvent = globalThis.CloseEvent ?? class extends Event {
      #eventInitDict;
      constructor(type, eventInitDict = {}) {
        super(type, eventInitDict);
        this.#eventInitDict = eventInitDict;
      }
      get wasClean() {
        return this.#eventInitDict.wasClean ?? false;
      }
      get code() {
        return this.#eventInitDict.code ?? 0;
      }
      get reason() {
        return this.#eventInitDict.reason ?? "";
      }
    };
    ErrorEvent = globalThis.ErrorEvent ?? class extends Event {
      #eventInitDict;
      constructor(type, eventInitDict = {}) {
        super(type, eventInitDict);
        this.#eventInitDict = eventInitDict;
      }
      get message() {
        return this.#eventInitDict.message ?? "";
      }
      get filename() {
        return this.#eventInitDict.filename ?? "";
      }
      get lineno() {
        return this.#eventInitDict.lineno ?? 0;
      }
      get colno() {
        return this.#eventInitDict.colno ?? 0;
      }
      get error() {
        return this.#eventInitDict.error ?? null;
      }
    };
    generateConnectionSymbol = () => Symbol("connection");
    CONNECTION_SYMBOL_KEY = Symbol("CONNECTION_SYMBOL_KEY");
    WAIT_FOR_WEBSOCKET_SYMBOL = Symbol("WAIT_FOR_WEBSOCKET_SYMBOL");
    responseHeadersToSkip = /* @__PURE__ */ new Set([
      "connection",
      "content-length",
      "keep-alive",
      "proxy-authenticate",
      "proxy-authorization",
      "te",
      "trailer",
      "transfer-encoding",
      "upgrade",
      "sec-websocket-accept",
      "sec-websocket-extensions",
      "sec-websocket-protocol"
    ]);
    appendResponseHeaders = (headers, responseHeaders) => {
      if (!responseHeaders) return;
      responseHeaders.forEach((value, key) => {
        if (responseHeadersToSkip.has(key.toLowerCase())) return;
        headers.push(`${key}: ${value}`);
      });
    };
    rejectUpgradeRequest = (socket, status, responseHeaders) => {
      const responseLines = ["Connection: close", "Content-Length: 0"];
      appendResponseHeaders(responseLines, responseHeaders);
      socket.end(`HTTP/1.1 ${status.toString()} ${STATUS_CODES[status] ?? ""}\r
${responseLines.join("\r\n")}\r
\r
`);
    };
    createUpgradeRequest = (request) => {
      const protocol = request.socket.encrypted ? "https" : "http";
      const url = new URL(request.url ?? "/", `${protocol}://${request.headers.host ?? "localhost"}`);
      const headers = new Headers();
      for (const key in request.headers) {
        const value = request.headers[key];
        if (!value) continue;
        headers.append(key, Array.isArray(value) ? value[0] : value);
      }
      return new Request(url, { headers });
    };
    setupWebSocket = (options) => {
      const { server, fetchCallback, wss } = options;
      const waiterMap = /* @__PURE__ */ new Map();
      wss.on("connection", (ws, request) => {
        const waiter = waiterMap.get(request);
        if (waiter) {
          waiter.resolve(ws);
          waiterMap.delete(request);
        }
      });
      const rejectWaiter = (request) => {
        const waiter = waiterMap.get(request);
        if (waiter) {
          waiterMap.delete(request);
          waiter.reject(/* @__PURE__ */ new Error("WebSocket handshake aborted"));
        }
      };
      const waitForWebSocket = (request, connectionSymbol) => {
        return new Promise((resolve, reject) => {
          waiterMap.set(request, {
            resolve,
            reject,
            connectionSymbol
          });
        });
      };
      server.on("upgrade", async (request, socket, head) => {
        if (request.headers.upgrade?.toLowerCase() !== "websocket") return;
        const env = {
          incoming: request,
          outgoing: void 0,
          wss,
          [WAIT_FOR_WEBSOCKET_SYMBOL]: waitForWebSocket
        };
        let status = 400;
        let responseHeaders;
        try {
          const response = await fetchCallback(createUpgradeRequest(request), env);
          if (response instanceof Response) {
            status = response.status;
            responseHeaders = response.headers;
          }
        } catch {
          if (server.listenerCount("upgrade") === 1) rejectUpgradeRequest(socket, 500);
          return;
        }
        const waiter = waiterMap.get(request);
        if (!waiter || waiter.connectionSymbol !== env[CONNECTION_SYMBOL_KEY]) {
          rejectWaiter(request);
          if (server.listenerCount("upgrade") === 1) rejectUpgradeRequest(socket, status, responseHeaders);
          return;
        }
        const addResponseHeaders = (headers) => {
          appendResponseHeaders(headers, responseHeaders);
        };
        const reclaimWaiterOnClose = () => rejectWaiter(request);
        socket.once("close", reclaimWaiterOnClose);
        wss.on("headers", addResponseHeaders);
        try {
          wss.handleUpgrade(request, socket, head, (ws) => {
            socket.off("close", reclaimWaiterOnClose);
            wss.emit("connection", ws, request);
          });
        } finally {
          wss.off("headers", addResponseHeaders);
        }
      });
      server.on("close", () => {
        wss.close();
      });
    };
    upgradeWebSocket = defineWebSocketHelper(async (c, events, options) => {
      if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return;
      const env = c.env;
      const waitForWebSocket = env[WAIT_FOR_WEBSOCKET_SYMBOL];
      if (!waitForWebSocket || !env.incoming) return new Response(null, { status: 500 });
      const connectionSymbol = generateConnectionSymbol();
      env[CONNECTION_SYMBOL_KEY] = connectionSymbol;
      (async () => {
        let ws;
        try {
          ws = await waitForWebSocket(env.incoming, connectionSymbol);
        } catch {
          return;
        }
        const messagesReceivedInStarting = [];
        const bufferMessage = (data, isBinary) => {
          messagesReceivedInStarting.push([data, isBinary]);
        };
        ws.on("message", bufferMessage);
        const ctx = {
          binaryType: "arraybuffer",
          close(code, reason) {
            ws.close(code, reason);
          },
          protocol: ws.protocol,
          raw: ws,
          get readyState() {
            return ws.readyState;
          },
          send(source, opts) {
            ws.send(source, { compress: opts?.compress });
          },
          url: new URL(c.req.url)
        };
        try {
          events?.onOpen?.(new Event("open"), ctx);
        } catch (e) {
          (options?.onError ?? console.error)(e);
        }
        const handleMessage = (data, isBinary) => {
          const datas = Array.isArray(data) ? data : [data];
          for (const data2 of datas) try {
            events?.onMessage?.(new MessageEvent("message", { data: isBinary ? data2 instanceof ArrayBuffer ? data2 : data2.buffer.slice(data2.byteOffset, data2.byteOffset + data2.byteLength) : typeof data2 === "string" ? data2 : Buffer.from(data2).toString("utf-8") }), ctx);
          } catch (e) {
            (options?.onError ?? console.error)(e);
          }
        };
        ws.off("message", bufferMessage);
        for (const message of messagesReceivedInStarting) handleMessage(...message);
        ws.on("message", (data, isBinary) => {
          handleMessage(data, isBinary);
        });
        ws.on("close", (code, reason) => {
          try {
            events?.onClose?.(new CloseEvent("close", {
              code,
              reason: reason.toString()
            }), ctx);
          } catch (e) {
            (options?.onError ?? console.error)(e);
          }
        });
        ws.on("error", (error) => {
          try {
            events?.onError?.(new ErrorEvent("error", { error }), ctx);
          } catch (e) {
            (options?.onError ?? console.error)(e);
          }
        });
      })();
      return new Response();
    });
    createAdaptorServer = (options) => {
      const fetchCallback = options.fetch;
      const requestListener = getRequestListener(fetchCallback, {
        hostname: options.hostname,
        overrideGlobalObjects: options.overrideGlobalObjects,
        autoCleanupIncoming: options.autoCleanupIncoming
      });
      const server = (options.createServer || createServer)(options.serverOptions || {}, requestListener);
      if (options.websocket && options.websocket.server) {
        if (options.websocket.server.options.noServer !== true) throw new Error("WebSocket server must be created with { noServer: true } option");
        setupWebSocket({
          server,
          fetchCallback,
          wss: options.websocket.server
        });
      }
      return server;
    };
    serve = (options, listeningListener) => {
      const server = createAdaptorServer(options);
      server.listen(options?.port ?? 3e3, options.hostname, () => {
        const serverInfo = server.address();
        listeningListener && listeningListener(serverInfo);
      });
      return server;
    };
  }
});

// node_modules/hono/dist/compose.js
var compose;
var init_compose = __esm({
  "node_modules/hono/dist/compose.js"() {
    compose = (middleware, onError, onNotFound) => {
      return (context, next) => {
        let index = -1;
        return dispatch(0);
        async function dispatch(i) {
          if (i <= index) {
            throw new Error("next() called multiple times");
          }
          index = i;
          let res;
          let isError = false;
          let handler;
          if (middleware[i]) {
            handler = middleware[i][0][0];
            context.req.routeIndex = i;
          } else {
            handler = i === middleware.length && next || void 0;
          }
          if (handler) {
            try {
              res = await handler(context, () => dispatch(i + 1));
            } catch (err) {
              if (err instanceof Error && onError) {
                context.error = err;
                res = await onError(err, context);
                isError = true;
              } else {
                throw err;
              }
            }
          } else {
            if (context.finalized === false && onNotFound) {
              res = await onNotFound(context);
            }
          }
          if (res && (context.finalized === false || isError)) {
            context.res = res;
          }
          return context;
        }
      };
    };
  }
});

// node_modules/hono/dist/http-exception.js
var init_http_exception = __esm({
  "node_modules/hono/dist/http-exception.js"() {
  }
});

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT;
var init_constants = __esm({
  "node_modules/hono/dist/request/constants.js"() {
    GET_MATCH_RESULT = /* @__PURE__ */ Symbol();
  }
});

// node_modules/hono/dist/utils/crypto.js
var init_crypto = __esm({
  "node_modules/hono/dist/utils/crypto.js"() {
  }
});

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData;
var init_buffer = __esm({
  "node_modules/hono/dist/utils/buffer.js"() {
    init_crypto();
    bufferToFormData = (arrayBuffer, contentType2) => {
      const response = new Response(arrayBuffer, {
        headers: {
          // Normalize the media type (case-insensitive) while keeping parameters like the boundary
          "Content-Type": contentType2.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
        }
      });
      return response.formData();
    };
  }
});

// node_modules/hono/dist/utils/body.js
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) {
    return convertFormDataToBodyData(
      await request.bodyCache.formData,
      options
    );
  }
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) {
    request.bodyCache.formData = formDataPromise;
  }
  const formData = await formDataPromise;
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value, nestingState);
        delete form[key];
      }
    });
  }
  return form;
}
var MAX_NESTING_DEPTH, MAX_NESTED_OBJECTS, isRawRequest, parseBody, handleParsingAllValues, handleParsingNestedValues, throwNestingLimitExceeded;
var init_body = __esm({
  "node_modules/hono/dist/utils/body.js"() {
    init_buffer();
    MAX_NESTING_DEPTH = 32;
    MAX_NESTED_OBJECTS = 1e4;
    isRawRequest = (request) => "headers" in request;
    parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
      const { all = false, dot = false } = options;
      const headers = isRawRequest(request) ? request.headers : request.raw.headers;
      const contentType2 = headers.get("Content-Type");
      const mediaType = contentType2?.split(";")[0].trim().toLowerCase();
      if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
        return parseFormData(request, { all, dot });
      }
      return {};
    };
    handleParsingAllValues = (form, key, value) => {
      if (form[key] !== void 0) {
        if (Array.isArray(form[key])) {
          ;
          form[key].push(value);
        } else {
          form[key] = [form[key], value];
        }
      } else {
        if (!key.endsWith("[]")) {
          form[key] = value;
        } else {
          form[key] = [value];
        }
      }
    };
    handleParsingNestedValues = (form, key, value, state) => {
      if (/(?:^|\.)__proto__\./.test(key)) {
        return;
      }
      let nestedForm = form;
      const keys = key.split(".", MAX_NESTING_DEPTH + 2);
      if (keys.length > MAX_NESTING_DEPTH + 1) {
        throwNestingLimitExceeded();
      }
      keys.forEach((key2, index) => {
        if (index === keys.length - 1) {
          nestedForm[key2] = value;
        } else {
          if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
            if (state.count++ >= MAX_NESTED_OBJECTS) {
              throwNestingLimitExceeded();
            }
            nestedForm[key2] = /* @__PURE__ */ Object.create(null);
          }
          nestedForm = nestedForm[key2];
        }
      });
    };
    throwNestingLimitExceeded = () => {
      throw new Error("Nesting limit exceeded");
    };
  }
});

// node_modules/hono/dist/utils/url.js
var splitPath, splitRoutingPath, extractGroupsFromPath, replaceGroupMarks, patternCache, getPattern, tryDecode, tryDecodeURI, getPath, getPathNoStrict, mergePath, checkOptionalParameter, tryDecodeURIComponent, _decodeURI, _getQueryParam, getQueryParam, getQueryParams, decodeURIComponent_;
var init_url = __esm({
  "node_modules/hono/dist/utils/url.js"() {
    splitPath = (path) => {
      const paths = path.split("/");
      if (paths[0] === "") {
        paths.shift();
      }
      return paths;
    };
    splitRoutingPath = (routePath) => {
      const { groups, path } = extractGroupsFromPath(routePath);
      const paths = splitPath(path);
      return replaceGroupMarks(paths, groups);
    };
    extractGroupsFromPath = (path) => {
      const groups = [];
      path = path.replace(/\{[^}]+\}/g, (match2, index) => {
        const mark = `@${index}`;
        groups.push([mark, match2]);
        return mark;
      });
      return { groups, path };
    };
    replaceGroupMarks = (paths, groups) => {
      for (let i = groups.length - 1; i >= 0; i--) {
        const [mark] = groups[i];
        for (let j = paths.length - 1; j >= 0; j--) {
          if (paths[j].includes(mark)) {
            paths[j] = paths[j].replace(mark, groups[i][1]);
            break;
          }
        }
      }
      return paths;
    };
    patternCache = {};
    getPattern = (label, next) => {
      if (label === "*") {
        return "*";
      }
      const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      if (match2) {
        const cacheKey2 = `${label}#${next}`;
        if (!patternCache[cacheKey2]) {
          if (match2[2]) {
            patternCache[cacheKey2] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey2, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
          } else {
            patternCache[cacheKey2] = [label, match2[1], true];
          }
        }
        return patternCache[cacheKey2];
      }
      return null;
    };
    tryDecode = (str, decoder) => {
      try {
        return decoder(str);
      } catch {
        return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
          try {
            return decoder(match2);
          } catch {
            return match2;
          }
        });
      }
    };
    tryDecodeURI = (str) => tryDecode(str, decodeURI);
    getPath = (request) => {
      const url = request.url;
      const start = url.indexOf("/", url.indexOf(":") + 4);
      let i = start;
      for (; i < url.length; i++) {
        const charCode = url.charCodeAt(i);
        if (charCode === 37) {
          const queryIndex = url.indexOf("?", i);
          const hashIndex = url.indexOf("#", i);
          const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
          const path = url.slice(start, end);
          return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
        } else if (charCode === 63 || charCode === 35) {
          break;
        }
      }
      return url.slice(start, i);
    };
    getPathNoStrict = (request) => {
      const result = getPath(request);
      return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
    };
    mergePath = (base, sub, ...rest) => {
      if (rest.length) {
        sub = mergePath(sub, ...rest);
      }
      return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
    };
    checkOptionalParameter = (path) => {
      if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
        return null;
      }
      const segments = path.split("/");
      const results = [];
      let basePath = "";
      segments.forEach((segment) => {
        if (segment !== "" && !/\:/.test(segment)) {
          basePath += "/" + segment;
        } else if (/\:/.test(segment)) {
          if (segment.charCodeAt(segment.length - 1) === 63) {
            if (results.length === 0 && basePath === "") {
              results.push("/");
            } else {
              results.push(basePath);
            }
            const optionalSegment = segment.slice(0, -1);
            basePath += "/" + optionalSegment;
            results.push(basePath);
          } else {
            basePath += "/" + segment;
          }
        }
      });
      return results.filter((v, i, a) => a.indexOf(v) === i);
    };
    tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
    _decodeURI = (value) => {
      if (value.indexOf("+") !== -1) {
        value = value.replace(/\+/g, " ");
      }
      return tryDecodeURIComponent(value);
    };
    _getQueryParam = (url, key, multiple) => {
      const hashIndex = url.indexOf("#", 8);
      if (hashIndex !== -1) {
        url = url.slice(0, hashIndex);
      }
      let encoded;
      if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
        let keyIndex2 = url.indexOf("?", 8);
        if (keyIndex2 === -1) {
          return void 0;
        }
        if (!url.startsWith(key, keyIndex2 + 1)) {
          keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
        }
        while (keyIndex2 !== -1) {
          const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
          if (trailingKeyCode === 61) {
            const valueIndex = keyIndex2 + key.length + 2;
            const endIndex = url.indexOf("&", valueIndex);
            return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
          } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
            return "";
          }
          keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
        }
        encoded = /[%+]/.test(url);
        if (!encoded) {
          return void 0;
        }
      }
      const results = /* @__PURE__ */ Object.create(null);
      encoded ??= /[%+]/.test(url);
      let keyIndex = url.indexOf("?", 8);
      while (keyIndex !== -1) {
        const nextKeyIndex = url.indexOf("&", keyIndex + 1);
        let valueIndex = url.indexOf("=", keyIndex);
        if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
          valueIndex = -1;
        }
        let name = url.slice(
          keyIndex + 1,
          valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
        );
        if (encoded) {
          name = _decodeURI(name);
        }
        keyIndex = nextKeyIndex;
        if (name === "") {
          continue;
        }
        let value;
        if (valueIndex === -1) {
          value = "";
        } else {
          value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
          if (encoded) {
            value = _decodeURI(value);
          }
        }
        if (multiple) {
          if (!(results[name] && Array.isArray(results[name]))) {
            results[name] = [];
          }
          ;
          results[name].push(value);
        } else {
          results[name] ??= value;
        }
      }
      return key ? results[key] : results;
    };
    getQueryParam = _getQueryParam;
    getQueryParams = (url, key) => {
      return _getQueryParam(url, key, true);
    };
    decodeURIComponent_ = decodeURIComponent;
  }
});

// node_modules/hono/dist/request.js
var HonoRequest;
var init_request = __esm({
  "node_modules/hono/dist/request.js"() {
    init_http_exception();
    init_constants();
    init_body();
    init_url();
    HonoRequest = class {
      /**
       * `.raw` can get the raw Request object.
       *
       * @see {@link https://hono.dev/docs/api/request#raw}
       *
       * @example
       * ```ts
       * // For Cloudflare Workers
       * app.post('/', async (c) => {
       *   const metadata = c.req.raw.cf?.hostMetadata?
       *   ...
       * })
       * ```
       */
      raw;
      #validatedData;
      // Short name of validatedData
      #matchResult;
      routeIndex = 0;
      /**
       * `.path` can get the pathname of the request.
       *
       * @see {@link https://hono.dev/docs/api/request#path}
       *
       * @example
       * ```ts
       * app.get('/about/me', (c) => {
       *   const pathname = c.req.path // `/about/me`
       * })
       * ```
       */
      path;
      bodyCache = {};
      constructor(request, path = "/", matchResult = [[]]) {
        this.raw = request;
        this.path = path;
        this.#matchResult = matchResult;
      }
      param(key) {
        return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
      }
      #getDecodedParam(key) {
        const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
        const param = this.#getParamValue(paramKey);
        return param && tryDecodeURIComponent(param);
      }
      #getAllDecodedParams() {
        const decoded = {};
        const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
        for (const key of keys) {
          const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
          if (value !== void 0) {
            decoded[key] = tryDecodeURIComponent(value);
          }
        }
        return decoded;
      }
      #getParamValue(paramKey) {
        return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
      }
      query(key) {
        return getQueryParam(this.url, key);
      }
      queries(key) {
        return getQueryParams(this.url, key);
      }
      header(name) {
        if (name) {
          return this.raw.headers.get(name) ?? void 0;
        }
        const headerData = /* @__PURE__ */ Object.create(null);
        this.raw.headers.forEach((value, key) => {
          headerData[key] = value;
        });
        return headerData;
      }
      async parseBody(options) {
        return parseBody(this, options);
      }
      #cachedBody = (key) => {
        const { bodyCache, raw: raw2 } = this;
        const cachedBody = bodyCache[key];
        if (cachedBody) {
          return cachedBody;
        }
        for (const anyCachedKey in bodyCache) {
          return bodyCache[anyCachedKey].then((body) => {
            if (anyCachedKey === "json") {
              body = JSON.stringify(body);
            }
            return new Response(body)[key]();
          });
        }
        return bodyCache[key] = raw2[key]();
      };
      /**
       * `.json()` can parse Request body of type `application/json`
       *
       * @see {@link https://hono.dev/docs/api/request#json}
       *
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.json()
       * })
       * ```
       */
      json() {
        return this.#cachedBody("text").then((text) => JSON.parse(text));
      }
      /**
       * `.text()` can parse Request body of type `text/plain`
       *
       * @see {@link https://hono.dev/docs/api/request#text}
       *
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.text()
       * })
       * ```
       */
      text() {
        return this.#cachedBody("text");
      }
      /**
       * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
       *
       * @see {@link https://hono.dev/docs/api/request#arraybuffer}
       *
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.arrayBuffer()
       * })
       * ```
       */
      arrayBuffer() {
        return this.#cachedBody("arrayBuffer");
      }
      /**
       * `.bytes()` parses the request body as a `Uint8Array`.
       *
       * @see {@link https://hono.dev/docs/api/request#bytes}
       *
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.bytes()
       * })
       * ```
       */
      bytes() {
        return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
      }
      /**
       * Parses the request body as a `Blob`.
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.blob();
       * });
       * ```
       * @see https://hono.dev/docs/api/request#blob
       */
      blob() {
        return this.#cachedBody("blob");
      }
      /**
       * Parses the request body as `FormData`.
       * @example
       * ```ts
       * app.post('/entry', async (c) => {
       *   const body = await c.req.formData();
       * });
       * ```
       * @see https://hono.dev/docs/api/request#formdata
       */
      formData() {
        return this.#cachedBody("formData");
      }
      /**
       * Adds validated data to the request.
       *
       * @param target - The target of the validation.
       * @param data - The validated data to add.
       */
      addValidatedData(target, data) {
        ;
        (this.#validatedData ??= {})[target] = data;
      }
      valid(target) {
        return this.#validatedData?.[target];
      }
      /**
       * `.url()` can get the request url strings.
       *
       * @see {@link https://hono.dev/docs/api/request#url}
       *
       * @example
       * ```ts
       * app.get('/about/me', (c) => {
       *   const url = c.req.url // `http://localhost:8787/about/me`
       *   ...
       * })
       * ```
       */
      get url() {
        return this.raw.url;
      }
      /**
       * `.method()` can get the method name of the request.
       *
       * @see {@link https://hono.dev/docs/api/request#method}
       *
       * @example
       * ```ts
       * app.get('/about/me', (c) => {
       *   const method = c.req.method // `GET`
       * })
       * ```
       */
      get method() {
        return this.raw.method;
      }
      get [GET_MATCH_RESULT]() {
        return this.#matchResult;
      }
      /**
       * `.matchedRoutes()` can return a matched route in the handler
       *
       * @deprecated
       *
       * Use matchedRoutes helper defined in "hono/route" instead.
       *
       * @see {@link https://hono.dev/docs/api/request#matchedroutes}
       *
       * @example
       * ```ts
       * app.use('*', async function logger(c, next) {
       *   await next()
       *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
       *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
       *     console.log(
       *       method,
       *       ' ',
       *       path,
       *       ' '.repeat(Math.max(10 - path.length, 0)),
       *       name,
       *       i === c.req.routeIndex ? '<- respond from here' : ''
       *     )
       *   })
       * })
       * ```
       */
      get matchedRoutes() {
        return this.#matchResult[0].map(([[, route]]) => route);
      }
      /**
       * `routePath()` can retrieve the path registered within the handler
       *
       * @deprecated
       *
       * Use routePath helper defined in "hono/route" instead.
       *
       * @see {@link https://hono.dev/docs/api/request#routepath}
       *
       * @example
       * ```ts
       * app.get('/posts/:id', (c) => {
       *   return c.json({ path: c.req.routePath })
       * })
       * ```
       */
      get routePath() {
        return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
      }
    };
  }
});

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase, raw, resolveCallback;
var init_html = __esm({
  "node_modules/hono/dist/utils/html.js"() {
    HtmlEscapedCallbackPhase = {
      Stringify: 1,
      BeforeStream: 2,
      Stream: 3
    };
    raw = (value, callbacks) => {
      const escapedString = new String(value);
      escapedString.isEscaped = true;
      escapedString.callbacks = callbacks;
      return escapedString;
    };
    resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
      if (typeof str === "object" && !(str instanceof String)) {
        if (!(str instanceof Promise)) {
          str = str.toString();
        }
        if (str instanceof Promise) {
          str = await str;
        }
      }
      const callbacks = str.callbacks;
      if (!callbacks?.length) {
        return Promise.resolve(str);
      }
      if (buffer) {
        buffer[0] += str;
      } else {
        buffer = [str];
      }
      const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
        (res) => Promise.all(
          res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
        ).then(() => buffer[0])
      );
      if (preserveCallbacks) {
        return raw(await resStr, callbacks);
      } else {
        return resStr;
      }
    };
  }
});

// node_modules/hono/dist/context.js
var TEXT_PLAIN, setDefaultContentType, createResponseInstance, Context;
var init_context = __esm({
  "node_modules/hono/dist/context.js"() {
    init_request();
    init_html();
    TEXT_PLAIN = "text/plain; charset=UTF-8";
    setDefaultContentType = (contentType2, headers) => {
      return {
        "Content-Type": contentType2,
        ...headers
      };
    };
    createResponseInstance = (body, init) => new Response(body, init);
    Context = class {
      #rawRequest;
      #req;
      /**
       * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
       *
       * @see {@link https://hono.dev/docs/api/context#env}
       *
       * @example
       * ```ts
       * // Environment object for Cloudflare Workers
       * app.get('*', async c => {
       *   const counter = c.env.COUNTER
       * })
       * ```
       */
      env = {};
      #var;
      finalized = false;
      /**
       * `.error` can get the error object from the middleware if the Handler throws an error.
       *
       * @see {@link https://hono.dev/docs/api/context#error}
       *
       * @example
       * ```ts
       * app.use('*', async (c, next) => {
       *   await next()
       *   if (c.error) {
       *     // do something...
       *   }
       * })
       * ```
       */
      error;
      #status;
      #executionCtx;
      #res;
      #layout;
      #renderer;
      #notFoundHandler;
      #preparedHeaders;
      #matchResult;
      #path;
      /**
       * Creates an instance of the Context class.
       *
       * @param req - The Request object.
       * @param options - Optional configuration options for the context.
       */
      constructor(req, options) {
        this.#rawRequest = req;
        if (options) {
          this.#executionCtx = options.executionCtx;
          this.env = options.env;
          this.#notFoundHandler = options.notFoundHandler;
          this.#path = options.path;
          this.#matchResult = options.matchResult;
        }
      }
      /**
       * `.req` is the instance of {@link HonoRequest}.
       */
      get req() {
        this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
        return this.#req;
      }
      /**
       * @see {@link https://hono.dev/docs/api/context#event}
       * The FetchEvent associated with the current request.
       *
       * @throws Will throw an error if the context does not have a FetchEvent.
       */
      get event() {
        if (this.#executionCtx && "respondWith" in this.#executionCtx) {
          return this.#executionCtx;
        } else {
          throw Error("This context has no FetchEvent");
        }
      }
      /**
       * @see {@link https://hono.dev/docs/api/context#executionctx}
       * The ExecutionContext associated with the current request.
       *
       * @throws Will throw an error if the context does not have an ExecutionContext.
       */
      get executionCtx() {
        if (this.#executionCtx) {
          return this.#executionCtx;
        } else {
          throw Error("This context has no ExecutionContext");
        }
      }
      /**
       * @see {@link https://hono.dev/docs/api/context#res}
       * The Response object for the current request.
       */
      get res() {
        return this.#res ||= createResponseInstance(null, {
          headers: this.#preparedHeaders ??= new Headers()
        });
      }
      /**
       * Sets the Response object for the current request.
       *
       * @param _res - The Response object to set.
       */
      set res(_res) {
        if (this.#res && _res) {
          _res = createResponseInstance(_res.body, _res);
          for (const [k, v] of this.#res.headers.entries()) {
            if (k === "content-type") {
              continue;
            }
            if (k === "set-cookie") {
              const cookies = this.#res.headers.getSetCookie();
              _res.headers.delete("set-cookie");
              for (const cookie of cookies) {
                _res.headers.append("set-cookie", cookie);
              }
            } else {
              _res.headers.set(k, v);
            }
          }
        }
        this.#res = _res;
        this.finalized = true;
      }
      /**
       * `.render()` can create a response within a layout.
       *
       * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
       *
       * @example
       * ```ts
       * app.get('/', (c) => {
       *   return c.render('Hello!')
       * })
       * ```
       */
      render = (...args) => {
        this.#renderer ??= (content) => this.html(content);
        return this.#renderer(...args);
      };
      /**
       * Sets the layout for the response.
       *
       * @param layout - The layout to set.
       * @returns The layout function.
       */
      setLayout = (layout) => this.#layout = layout;
      /**
       * Gets the current layout for the response.
       *
       * @returns The current layout function.
       */
      getLayout = () => this.#layout;
      /**
       * `.setRenderer()` can set the layout in the custom middleware.
       *
       * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
       *
       * @example
       * ```tsx
       * app.use('*', async (c, next) => {
       *   c.setRenderer((content) => {
       *     return c.html(
       *       <html>
       *         <body>
       *           <p>{content}</p>
       *         </body>
       *       </html>
       *     )
       *   })
       *   await next()
       * })
       * ```
       */
      setRenderer = (renderer) => {
        this.#renderer = renderer;
      };
      /**
       * `.header()` can set headers.
       *
       * @see {@link https://hono.dev/docs/api/context#header}
       *
       * @example
       * ```ts
       * app.get('/welcome', (c) => {
       *   // Set headers
       *   c.header('X-Message', 'Hello!')
       *   c.header('Content-Type', 'text/plain')
       *
       *   // Append multiple headers using the append option (e.g. Vary)
       *   c.header('Vary', 'Accept-Encoding', { append: true })
       *   c.header('Vary', 'User-Agent', { append: true })
       *
       *   return c.body('Thank you for coming')
       * })
       * ```
       */
      header = (name, value, options) => {
        if (this.finalized) {
          this.#res = createResponseInstance(this.#res.body, this.#res);
        }
        const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
        if (value === void 0) {
          headers.delete(name);
        } else if (options?.append) {
          headers.append(name, value);
        } else {
          headers.set(name, value);
        }
      };
      status = (status) => {
        this.#status = status;
      };
      /**
       * `.set()` can set the value specified by the key.
       *
       * @see {@link https://hono.dev/docs/api/context#set-get}
       *
       * @example
       * ```ts
       * app.use('*', async (c, next) => {
       *   c.set('message', 'Hono is hot!!')
       *   await next()
       * })
       * ```
       */
      set = (key, value) => {
        this.#var ??= /* @__PURE__ */ new Map();
        this.#var.set(key, value);
      };
      /**
       * `.get()` can use the value specified by the key.
       *
       * @see {@link https://hono.dev/docs/api/context#set-get}
       *
       * @example
       * ```ts
       * app.get('/', (c) => {
       *   const message = c.get('message')
       *   return c.text(`The message is "${message}"`)
       * })
       * ```
       */
      get = (key) => {
        return this.#var ? this.#var.get(key) : void 0;
      };
      /**
       * `.var` can access the value of a variable.
       *
       * @see {@link https://hono.dev/docs/api/context#var}
       *
       * @example
       * ```ts
       * const result = c.var.client.oneMethod()
       * ```
       */
      // c.var.propName is a read-only
      get var() {
        if (!this.#var) {
          return {};
        }
        return Object.fromEntries(this.#var);
      }
      #newResponse(data, arg, headers) {
        let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
        if (typeof arg === "object" && arg.headers) {
          responseHeaders ??= new Headers();
          for (const [key, value] of new Headers(arg.headers)) {
            if (key === "set-cookie") {
              responseHeaders.append(key, value);
            } else {
              responseHeaders.set(key, value);
            }
          }
        }
        if (headers) {
          if (!responseHeaders) {
            let count = 0;
            for (const k in headers) {
              if (++count > 1 || typeof headers[k] !== "string") {
                responseHeaders = new Headers();
                break;
              }
            }
          }
          if (responseHeaders) {
            for (const k in headers) {
              const v = headers[k];
              if (typeof v === "string") {
                responseHeaders.set(k, v);
              } else {
                responseHeaders.delete(k);
                for (const v2 of v) {
                  responseHeaders.append(k, v2);
                }
              }
            }
          }
        }
        const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
        return createResponseInstance(data, {
          status,
          headers: responseHeaders ?? headers
        });
      }
      newResponse = (...args) => this.#newResponse(...args);
      /**
       * `.body()` can return the HTTP response.
       * You can set headers with `.header()` and set HTTP status code with `.status`.
       * This can also be set in `.text()`, `.json()` and so on.
       *
       * @see {@link https://hono.dev/docs/api/context#body}
       *
       * @example
       * ```ts
       * app.get('/welcome', (c) => {
       *   // Set headers
       *   c.header('X-Message', 'Hello!')
       *   c.header('Content-Type', 'text/plain')
       *   // Set HTTP status code
       *   c.status(201)
       *
       *   // Return the response body
       *   return c.body('Thank you for coming')
       * })
       * ```
       */
      body = (data, arg, headers) => this.#newResponse(data, arg, headers);
      /**
       * `.text()` can render text as `Content-Type:text/plain`.
       *
       * @see {@link https://hono.dev/docs/api/context#text}
       *
       * @example
       * ```ts
       * app.get('/say', (c) => {
       *   return c.text('Hello!')
       * })
       * ```
       */
      text = (text, arg, headers) => {
        return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
          text,
          arg,
          setDefaultContentType(TEXT_PLAIN, headers)
        );
      };
      /**
       * `.json()` can render JSON as `Content-Type:application/json`.
       *
       * @see {@link https://hono.dev/docs/api/context#json}
       *
       * @example
       * ```ts
       * app.get('/api', (c) => {
       *   return c.json({ message: 'Hello!' })
       * })
       * ```
       */
      json = (object, arg, headers) => {
        return this.#newResponse(
          JSON.stringify(object),
          arg,
          setDefaultContentType("application/json", headers)
        );
      };
      html = (html, arg, headers) => {
        const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
        return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
      };
      /**
       * `.redirect()` can Redirect, default status code is 302.
       *
       * @see {@link https://hono.dev/docs/api/context#redirect}
       *
       * @example
       * ```ts
       * app.get('/redirect', (c) => {
       *   return c.redirect('/')
       * })
       * app.get('/redirect-permanently', (c) => {
       *   return c.redirect('/', 301)
       * })
       * ```
       */
      redirect = (location, status) => {
        const locationString = String(location);
        this.header(
          "Location",
          // Multibyes should be encoded
          // eslint-disable-next-line no-control-regex
          !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
        );
        return this.newResponse(null, status ?? 302);
      };
      /**
       * `.notFound()` can return the Not Found Response.
       *
       * @see {@link https://hono.dev/docs/api/context#notfound}
       *
       * @example
       * ```ts
       * app.get('/notfound', (c) => {
       *   return c.notFound()
       * })
       * ```
       */
      notFound = () => {
        this.#notFoundHandler ??= () => createResponseInstance();
        return this.#notFoundHandler(this);
      };
    };
  }
});

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL, METHOD_NAME_ALL_LOWERCASE, METHODS, MESSAGE_MATCHER_IS_ALREADY_BUILT, UnsupportedPathError;
var init_router = __esm({
  "node_modules/hono/dist/router.js"() {
    METHOD_NAME_ALL = "ALL";
    METHOD_NAME_ALL_LOWERCASE = "all";
    METHODS = ["get", "post", "put", "delete", "options", "patch", "query"];
    MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
    UnsupportedPathError = class extends Error {
    };
  }
});

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER;
var init_constants2 = __esm({
  "node_modules/hono/dist/utils/constants.js"() {
    COMPOSED_HANDLER = "__COMPOSED_HANDLER";
  }
});

// node_modules/hono/dist/hono-base.js
var notFoundHandler, errorHandler, Hono;
var init_hono_base = __esm({
  "node_modules/hono/dist/hono-base.js"() {
    init_compose();
    init_context();
    init_router();
    init_constants2();
    init_url();
    notFoundHandler = (c) => {
      return c.text("404 Not Found", 404);
    };
    errorHandler = (err, c) => {
      if ("getResponse" in err) {
        const res = err.getResponse();
        return c.newResponse(res.body, res);
      }
      console.error(err);
      return c.text("Internal Server Error", 500);
    };
    Hono = class _Hono {
      get;
      post;
      put;
      delete;
      options;
      patch;
      query;
      all;
      on;
      use;
      /*
        This class is like an abstract class and does not have a router.
        To use it, inherit the class and implement router in the constructor.
      */
      router;
      getPath;
      // Cannot use `#` because it requires visibility at JavaScript runtime.
      _basePath = "/";
      #path = "/";
      routes = [];
      constructor(options = {}) {
        const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
        allMethods.forEach((method) => {
          this[method] = (args1, ...args) => {
            const methodName = method.toUpperCase();
            if (typeof args1 === "string") {
              this.#path = args1;
            } else {
              this.#addRoute(methodName, this.#path, args1);
            }
            args.forEach((handler) => {
              this.#addRoute(methodName, this.#path, handler);
            });
            return this;
          };
        });
        this.on = (method, path, ...handlers) => {
          for (const p of [path].flat()) {
            this.#path = p;
            for (const m of [method].flat()) {
              const methodName = m.toUpperCase();
              for (const handler of handlers) {
                this.#addRoute(methodName, this.#path, handler);
              }
            }
          }
          return this;
        };
        this.use = (arg1, ...handlers) => {
          if (typeof arg1 === "string") {
            this.#path = arg1;
          } else {
            this.#path = "*";
            handlers.unshift(arg1);
          }
          handlers.forEach((handler) => {
            this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
          });
          return this;
        };
        const { strict, ...optionsWithoutStrict } = options;
        Object.assign(this, optionsWithoutStrict);
        this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
      }
      #clone() {
        const clone = new _Hono({
          router: this.router,
          getPath: this.getPath
        });
        clone.errorHandler = this.errorHandler;
        clone.#notFoundHandler = this.#notFoundHandler;
        clone.routes = this.routes;
        return clone;
      }
      #notFoundHandler = notFoundHandler;
      // Cannot use `#` because it requires visibility at JavaScript runtime.
      errorHandler = errorHandler;
      /**
       * `.route()` allows grouping other Hono instance in routes.
       *
       * @see {@link https://hono.dev/docs/api/routing#grouping}
       *
       * @param {string} path - base Path
       * @param {Hono} app - other Hono instance
       * @returns {Hono} routed Hono instance
       *
       * @example
       * ```ts
       * const app = new Hono()
       * const app2 = new Hono()
       *
       * app2.get("/user", (c) => c.text("user"))
       * app.route("/api", app2) // GET /api/user
       * ```
       */
      route(path, app3) {
        const subApp = this.basePath(path);
        app3.routes.map((r) => {
          let handler;
          if (app3.errorHandler === errorHandler) {
            handler = r.handler;
          } else {
            handler = async (c, next) => (await compose([], app3.errorHandler)(c, () => r.handler(c, next))).res;
            handler[COMPOSED_HANDLER] = r.handler;
          }
          subApp.#addRoute(r.method, r.path, handler, r.basePath);
        });
        return this;
      }
      /**
       * `.basePath()` allows base paths to be specified.
       *
       * @see {@link https://hono.dev/docs/api/routing#base-path}
       *
       * @param {string} path - base Path
       * @returns {Hono} changed Hono instance
       *
       * @example
       * ```ts
       * const api = new Hono().basePath('/api')
       * ```
       */
      basePath(path) {
        const subApp = this.#clone();
        subApp._basePath = mergePath(this._basePath, path);
        return subApp;
      }
      /**
       * `.onError()` handles an error and returns a customized Response.
       *
       * @see {@link https://hono.dev/docs/api/hono#error-handling}
       *
       * @param {ErrorHandler} handler - request Handler for error
       * @returns {Hono} changed Hono instance
       *
       * @example
       * ```ts
       * app.onError((err, c) => {
       *   console.error(`${err}`)
       *   return c.text('Custom Error Message', 500)
       * })
       * ```
       */
      onError = (handler) => {
        this.errorHandler = handler;
        return this;
      };
      /**
       * `.notFound()` allows you to customize a Not Found Response.
       *
       * @see {@link https://hono.dev/docs/api/hono#not-found}
       *
       * @param {NotFoundHandler} handler - request handler for not-found
       * @returns {Hono} changed Hono instance
       *
       * @example
       * ```ts
       * app.notFound((c) => {
       *   return c.text('Custom 404 Message', 404)
       * })
       * ```
       */
      notFound = (handler) => {
        this.#notFoundHandler = handler;
        return this;
      };
      /**
       * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
       *
       * @see {@link https://hono.dev/docs/api/hono#mount}
       *
       * @param {string} path - base Path
       * @param {Function} applicationHandler - other Request Handler
       * @param {MountOptions} [options] - options of `.mount()`
       * @returns {Hono} mounted Hono instance
       *
       * @example
       * ```ts
       * import { Router as IttyRouter } from 'itty-router'
       * import { Hono } from 'hono'
       * // Create itty-router application
       * const ittyRouter = IttyRouter()
       * // GET /itty-router/hello
       * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
       *
       * const app = new Hono()
       * app.mount('/itty-router', ittyRouter.handle)
       * ```
       *
       * @example
       * ```ts
       * const app = new Hono()
       * // Send the request to another application without modification.
       * app.mount('/app', anotherApp, {
       *   replaceRequest: (req) => req,
       * })
       * ```
       */
      mount(path, applicationHandler, options) {
        let replaceRequest;
        let optionHandler;
        if (options) {
          if (typeof options === "function") {
            optionHandler = options;
          } else {
            optionHandler = options.optionHandler;
            if (options.replaceRequest === false) {
              replaceRequest = (request) => request;
            } else {
              replaceRequest = options.replaceRequest;
            }
          }
        }
        const getOptions = optionHandler ? (c) => {
          const options2 = optionHandler(c);
          return Array.isArray(options2) ? options2 : [options2];
        } : (c) => {
          let executionContext = void 0;
          try {
            executionContext = c.executionCtx;
          } catch {
          }
          return [c.env, executionContext];
        };
        replaceRequest ||= (() => {
          const mergedPath = mergePath(this._basePath, path);
          const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
          return (request) => {
            const url = new URL(request.url);
            url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
            return new Request(url, request);
          };
        })();
        const handler = async (c, next) => {
          const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
          if (res) {
            return res;
          }
          await next();
        };
        this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
        return this;
      }
      #addRoute(method, path, handler, baseRoutePath) {
        path = mergePath(this._basePath, path);
        const r = {
          basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
          path,
          method,
          handler
        };
        this.router.add(method, path, [handler, r]);
        this.routes.push(r);
      }
      #handleError(err, c) {
        if (err instanceof Error) {
          return this.errorHandler(err, c);
        }
        throw err;
      }
      #dispatch(request, executionCtx, env, method) {
        if (method === "HEAD") {
          return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
        }
        const path = this.getPath(request, { env });
        const matchResult = this.router.match(method, path);
        const c = new Context(request, {
          path,
          matchResult,
          env,
          executionCtx,
          notFoundHandler: this.#notFoundHandler
        });
        if (matchResult[0].length === 1) {
          let res;
          try {
            res = matchResult[0][0][0][0](c, async () => {
              c.res = await this.#notFoundHandler(c);
            });
          } catch (err) {
            return this.#handleError(err, c);
          }
          return res instanceof Promise ? res.then(
            (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
          ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
        }
        const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
        return (async () => {
          try {
            const context = await composed(c);
            if (!context.finalized) {
              throw new Error(
                "Context is not finalized. Did you forget to return a Response object or `await next()`?"
              );
            }
            return context.res;
          } catch (err) {
            return this.#handleError(err, c);
          }
        })();
      }
      /**
       * `.fetch()` will be entry point of your app.
       *
       * @see {@link https://hono.dev/docs/api/hono#fetch}
       *
       * @param {Request} request - request Object of request
       * @param {Env} env - env Object
       * @param {ExecutionContext} executionCtx - context of execution
       * @returns {Response | Promise<Response>} response of request
       *
       */
      fetch = (request, ...rest) => {
        return this.#dispatch(request, rest[1], rest[0], request.method);
      };
      /**
       * `.request()` is a useful method for testing.
       * You can pass a URL or pathname to send a GET request.
       * app will return a Response object.
       * ```ts
       * test('GET /hello is ok', async () => {
       *   const res = await app.request('/hello')
       *   expect(res.status).toBe(200)
       * })
       * ```
       * @see https://hono.dev/docs/api/hono#request
       */
      request = (input, requestInit, Env, executionCtx) => {
        if (input instanceof Request) {
          return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
        }
        input = input.toString();
        return this.fetch(
          new Request(
            /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
            requestInit
          ),
          Env,
          executionCtx
        );
      };
      /**
       * `.fire()` automatically adds a global fetch event listener.
       * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
       * @deprecated
       * Use `fire` from `hono/service-worker` instead.
       * ```ts
       * import { Hono } from 'hono'
       * import { fire } from 'hono/service-worker'
       *
       * const app = new Hono()
       * // ...
       * fire(app)
       * ```
       * @see https://hono.dev/docs/api/hono#fire
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
       * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
       */
      fire = () => {
        addEventListener("fetch", (event) => {
          event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
        });
      };
    };
  }
});

// node_modules/hono/dist/router/utils.js
var createNullObject;
var init_utils = __esm({
  "node_modules/hono/dist/router/utils.js"() {
    createNullObject = () => /* @__PURE__ */ Object.create(null);
  }
});

// node_modules/hono/dist/router/reg-exp-router/matcher.js
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = (method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  };
  this.match = match2;
  return match2(method, path);
}
var emptyParam;
var init_matcher = __esm({
  "node_modules/hono/dist/router/reg-exp-router/matcher.js"() {
    init_router();
    emptyParam = [];
  }
});

// node_modules/hono/dist/router/reg-exp-router/node.js
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return b === TAIL_WILDCARD_REG_EXP_STR ? -1 : 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var LABEL_REG_EXP_STR, ONLY_WILDCARD_REG_EXP_STR, TAIL_WILDCARD_REG_EXP_STR, PATH_ERROR, regExpMetaChars, Node;
var init_node = __esm({
  "node_modules/hono/dist/router/reg-exp-router/node.js"() {
    init_utils();
    LABEL_REG_EXP_STR = "[^/]+";
    ONLY_WILDCARD_REG_EXP_STR = ".*";
    TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
    PATH_ERROR = /* @__PURE__ */ Symbol();
    regExpMetaChars = new Set(".\\+*[^]$()");
    Node = class _Node {
      // handler index of a dynamic path, or -1 for a static path terminal
      #index;
      #varIndex;
      #children = createNullObject();
      insert(tokens, index, paramMap, context, isStatic) {
        let node = this;
        for (let i = 0, len = tokens.length; i < len; i++) {
          const token = tokens[i];
          const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : null : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
          let nextNode;
          if (pattern) {
            const name = pattern[1];
            let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
            if (name && pattern[2]) {
              if (regexpStr === ".*") {
                throw PATH_ERROR;
              }
              regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
              if (/\((?!\?:)/.test(regexpStr)) {
                throw PATH_ERROR;
              }
              if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) {
                throw PATH_ERROR;
              }
            }
            nextNode = node.#children[regexpStr];
            if (!nextNode) {
              if (regexpStr !== ONLY_WILDCARD_REG_EXP_STR && regexpStr !== TAIL_WILDCARD_REG_EXP_STR) {
                for (const k in node.#children) {
                  if (
                    // a single-char pattern coexists with single-char literals as a literal does
                    (regexpStr.length > 1 || k.length > 1) && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
                  ) {
                    throw PATH_ERROR;
                  }
                }
              }
              nextNode = node.#children[regexpStr] = new _Node();
            }
            if (name !== "") {
              nextNode.#varIndex ??= context.varIndex++;
              paramMap.push([name, nextNode.#varIndex]);
            }
          } else {
            nextNode = node.#children[token];
            if (!nextNode) {
              for (const k in node.#children) {
                if (k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR) {
                  throw PATH_ERROR;
                }
              }
              nextNode = node.#children[token] = new _Node();
            }
          }
          node = nextNode;
        }
        if (node.#index !== void 0) {
          throw PATH_ERROR;
        }
        node.#index = isStatic ? -1 : index;
      }
      buildRegExpStr() {
        const childKeys = Object.keys(this.#children).sort(compareKey);
        const strList = childKeys.map((k) => {
          const c = this.#children[k];
          const childStr = c.buildRegExpStr();
          return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
        }).filter(Boolean);
        if (typeof this.#index === "number" && this.#index !== -1) {
          strList.unshift(`#${this.#index}`);
        }
        if (strList.length === 0) {
          return "";
        }
        if (strList.length === 1) {
          return strList[0];
        }
        return "(?:" + strList.join("|") + ")";
      }
    };
  }
});

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie;
var init_trie = __esm({
  "node_modules/hono/dist/router/reg-exp-router/trie.js"() {
    init_utils();
    init_node();
    Trie = class {
      #context = { varIndex: 0 };
      #root = new Node();
      #index = 0;
      // dynamic path -> [handler index, param assoc]; static paths are not registered
      paths = createNullObject();
      insert(path, isStatic) {
        if (isStatic) {
          this.#root.insert(path.split(""), 0, [], this.#context, true);
          return;
        }
        const paramAssoc = [];
        const groups = [];
        let markedPath = path;
        for (let i = 0; ; ) {
          let replaced = false;
          markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
            const mark = `@\\${i}`;
            groups[i] = [mark, m];
            i++;
            replaced = true;
            return mark;
          });
          if (!replaced) {
            break;
          }
        }
        const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
        for (let i = groups.length - 1; i >= 0; i--) {
          const [mark] = groups[i];
          for (let j = tokens.length - 1; j >= 0; j--) {
            if (tokens[j].indexOf(mark) !== -1) {
              tokens[j] = tokens[j].replace(mark, groups[i][1]);
              break;
            }
          }
        }
        this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
        this.paths[path] = [this.#index++, paramAssoc];
      }
      buildRegExp() {
        let regexp = this.#root.buildRegExpStr();
        if (regexp === "") {
          return [/^$/, [], []];
        }
        let captureIndex = 0;
        const indexReplacementMap = [];
        const paramReplacementMap = [];
        regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
          if (handlerIndex !== void 0) {
            indexReplacementMap[++captureIndex] = Number(handlerIndex);
            return "$()";
          }
          if (paramIndex !== void 0) {
            paramReplacementMap[Number(paramIndex)] = ++captureIndex;
            return "";
          }
          return "";
        });
        return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
      }
    };
  }
});

// node_modules/hono/dist/router/reg-exp-router/router.js
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    `^${path.replace(
      /\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g,
      (match2, metaChar) => metaChar ? `\\${metaChar}` : match2 === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match2 === "*" ? ONLY_WILDCARD_REG_EXP_STR : `/:${LABEL_REG_EXP_STR}`
    )}$`
  );
}
function findMiddleware(middleware, path) {
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
var wildcardRegExpCache, RegExpRouter;
var init_router2 = __esm({
  "node_modules/hono/dist/router/reg-exp-router/router.js"() {
    init_router();
    init_url();
    init_utils();
    init_matcher();
    init_node();
    init_trie();
    wildcardRegExpCache = createNullObject();
    RegExpRouter = class {
      name = "RegExpRouter";
      #middleware;
      #routes;
      #tries;
      constructor() {
        this.#middleware = { [METHOD_NAME_ALL]: createNullObject() };
        this.#routes = { [METHOD_NAME_ALL]: createNullObject() };
        this.#tries = { [METHOD_NAME_ALL]: new Trie() };
      }
      #insertPath(method, path) {
        try {
          this.#tries[method].insert(path, !/\*|\/:/.test(path));
        } catch (e) {
          throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
        }
      }
      add(method, path, handler) {
        const middleware = this.#middleware;
        const routes = this.#routes;
        if (!middleware) {
          throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
        }
        if (!middleware[method]) {
          this.#tries[method] = new Trie();
          for (const handlerMap of [middleware, routes]) {
            handlerMap[method] = createNullObject();
            for (const p in handlerMap[METHOD_NAME_ALL]) {
              handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
              this.#insertPath(method, p);
            }
          }
        }
        if (path === "/*") {
          path = "*";
        }
        const methods = method === METHOD_NAME_ALL ? Object.keys(middleware) : [method];
        if (/\*$/.test(path)) {
          const re = buildWildcardRegExp(path);
          for (const m of methods) {
            if (!middleware[m][path]) {
              this.#insertPath(m, path);
              middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
            }
          }
          for (const handlerMap of [middleware, routes]) {
            for (const m of methods) {
              for (const p in handlerMap[m]) {
                re.test(p) && handlerMap[m][p].push([handler, path]);
              }
            }
          }
          return;
        }
        const paths = checkOptionalParameter(path) || [path];
        for (const path2 of paths) {
          for (const m of methods) {
            if (!routes[m][path2]) {
              this.#insertPath(m, path2);
              routes[m][path2] = findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || [];
            }
            routes[m][path2].push([handler, path2]);
          }
        }
      }
      match = match;
      buildAllMatchers() {
        const matchers = createNullObject();
        for (const method of Object.keys(this.#routes)) {
          matchers[method] = this.#buildMatcher(method);
        }
        this.#middleware = this.#routes = this.#tries = void 0;
        wildcardRegExpCache = createNullObject();
        return matchers;
      }
      #buildMatcher(method) {
        const middleware = this.#middleware[method];
        const routes = this.#routes[method];
        const trie = this.#tries[method];
        const staticMap = createNullObject();
        const handlerData = [];
        const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
        for (const r of [middleware, routes]) {
          for (const path in r) {
            const handlers = r[path];
            const pathData = trie.paths[path];
            if (!pathData) {
              staticMap[path] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
              continue;
            }
            handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [
              h,
              trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
                map[key] = paramReplacementMap[pathData[1][i][1]];
                return map;
              }, createNullObject())
            ]);
          }
        }
        return [regexp, indexReplacementMap.map((i) => handlerData[i]), staticMap];
      }
    };
  }
});

// node_modules/hono/dist/router/reg-exp-router/prepared-router.js
var init_prepared_router = __esm({
  "node_modules/hono/dist/router/reg-exp-router/prepared-router.js"() {
    init_router();
    init_matcher();
    init_router2();
  }
});

// node_modules/hono/dist/router/reg-exp-router/index.js
var init_reg_exp_router = __esm({
  "node_modules/hono/dist/router/reg-exp-router/index.js"() {
    init_router2();
    init_prepared_router();
  }
});

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter;
var init_router3 = __esm({
  "node_modules/hono/dist/router/smart-router/router.js"() {
    init_router();
    SmartRouter = class {
      name = "SmartRouter";
      #routers = [];
      #routes = [];
      constructor(init) {
        this.#routers = init.routers;
      }
      add(method, path, handler) {
        if (!this.#routes) {
          throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
        }
        this.#routes.push([method, path, handler]);
      }
      match(method, path) {
        if (!this.#routes) {
          throw new Error("Fatal error");
        }
        const routers = this.#routers;
        const routes = this.#routes;
        const len = routers.length;
        let i = 0;
        let res;
        for (; i < len; i++) {
          const router = routers[i];
          try {
            for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
              router.add(...routes[i2]);
            }
            res = router.match(method, path);
          } catch (e) {
            if (e instanceof UnsupportedPathError) {
              continue;
            }
            throw e;
          }
          this.match = router.match.bind(router);
          this.#routers = [router];
          this.#routes = void 0;
          break;
        }
        if (i === len) {
          throw new Error("Fatal error");
        }
        this.name = `SmartRouter + ${this.activeRouter.name}`;
        return res;
      }
      get activeRouter() {
        if (this.#routes || this.#routers.length !== 1) {
          throw new Error("No active router has been determined yet.");
        }
        return this.#routers[0];
      }
    };
  }
});

// node_modules/hono/dist/router/smart-router/index.js
var init_smart_router = __esm({
  "node_modules/hono/dist/router/smart-router/index.js"() {
    init_router3();
  }
});

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams, order, Node2;
var init_node2 = __esm({
  "node_modules/hono/dist/router/trie-router/node.js"() {
    init_router();
    init_url();
    init_utils();
    emptyParams = createNullObject();
    order = 0;
    Node2 = class _Node2 {
      #methods = [];
      #children = createNullObject();
      #patterns = [];
      #pattern;
      #params = emptyParams;
      insert(method, path, handler) {
        let curNode = this;
        const parts = splitRoutingPath(path);
        const possibleKeys = /* @__PURE__ */ new Set();
        let i = 0;
        for (const p of parts) {
          const nextP = parts[++i];
          const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
          const isParam = Array.isArray(pattern);
          const key = isParam ? pattern[0] : pattern || p;
          const child = curNode.#children[key] ||= new _Node2();
          if (pattern && !child.#pattern) {
            child.#pattern = pattern;
            curNode.#patterns.push(child);
          }
          curNode = child;
          if (isParam) {
            possibleKeys.add(pattern[1]);
          }
        }
        curNode.#methods.push({
          [method]: {
            handler,
            possibleKeys: [...possibleKeys],
            score: ++order
          }
        });
      }
      #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
        for (let i = 0, len = node.#methods.length; i < len; i++) {
          const m = node.#methods[i];
          const handlerSet = m[method] || m[METHOD_NAME_ALL];
          if (handlerSet) {
            handlerSet.params = createNullObject();
            handlerSets.push(handlerSet);
            for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
              const key = handlerSet.possibleKeys[i2];
              handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
            }
          }
        }
      }
      search(method, path) {
        const handlerSets = [];
        this.#params = emptyParams;
        const curNode = this;
        let curNodes = [curNode];
        const parts = splitPath(path);
        const curNodesQueue = [];
        const len = parts.length;
        let partOffsets = null;
        for (let i = 0; i < len; i++) {
          const part = parts[i];
          const isLast = i === len - 1;
          const tempNodes = [];
          for (let j = 0, len2 = curNodes.length; j < len2; j++) {
            const node = curNodes[j];
            const nextNode = node.#children[part];
            if (nextNode) {
              nextNode.#params = node.#params;
              if (isLast) {
                if (nextNode.#children["*"]) {
                  this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
                }
                this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
              } else {
                tempNodes.push(nextNode);
              }
            }
            for (const child of node.#patterns) {
              const pattern = child.#pattern;
              const params = node.#params === emptyParams ? {} : { ...node.#params };
              if (typeof pattern === "string") {
                if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
                  this.#pushHandlerSets(handlerSets, child, method, node.#params);
                  if (pattern === "*") {
                    child.#params = params;
                    tempNodes.push(child);
                  }
                }
                continue;
              }
              const [, name, matcher] = pattern;
              if (!part && matcher === true) {
                continue;
              }
              if (matcher !== true) {
                if (!partOffsets) {
                  partOffsets = [];
                  let offset = path[0] === "/" ? 1 : 0;
                  for (let p = 0; p < len; p++) {
                    partOffsets[p] = offset;
                    offset += parts[p].length + 1;
                  }
                }
                const restPathString = path.slice(partOffsets[i]);
                const m = matcher.exec(restPathString);
                if (m) {
                  params[name] = m[0];
                  this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
                  if (m[0].length === restPathString.length && child.#children["*"]) {
                    this.#pushHandlerSets(
                      handlerSets,
                      child.#children["*"],
                      method,
                      node.#params,
                      params
                    );
                  }
                  for (const _ in child.#children) {
                    child.#params = params;
                    const componentCount = m[0].match(/\//g)?.length ?? 0;
                    const targetCurNodes = curNodesQueue[componentCount] ||= [];
                    targetCurNodes.push(child);
                    break;
                  }
                  continue;
                }
              }
              if (matcher === true || matcher.test(part)) {
                params[name] = part;
                if (isLast) {
                  this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
                  if (child.#children["*"]) {
                    this.#pushHandlerSets(
                      handlerSets,
                      child.#children["*"],
                      method,
                      params,
                      node.#params
                    );
                  }
                } else {
                  child.#params = params;
                  tempNodes.push(child);
                }
              }
            }
          }
          const shifted = curNodesQueue.shift();
          curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
        }
        if (handlerSets[1]) {
          handlerSets.sort((a, b) => {
            return a.score - b.score;
          });
        }
        return [handlerSets.map(({ handler, params }) => [handler, params])];
      }
    };
  }
});

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter;
var init_router4 = __esm({
  "node_modules/hono/dist/router/trie-router/router.js"() {
    init_url();
    init_node2();
    TrieRouter = class {
      name = "TrieRouter";
      #node = new Node2();
      add(method, path, handler) {
        for (const result of checkOptionalParameter(path) || [path]) {
          this.#node.insert(method, result, handler);
        }
      }
      match(method, path) {
        return this.#node.search(method, path);
      }
    };
  }
});

// node_modules/hono/dist/router/trie-router/index.js
var init_trie_router = __esm({
  "node_modules/hono/dist/router/trie-router/index.js"() {
    init_router4();
  }
});

// node_modules/hono/dist/hono.js
var Hono2;
var init_hono = __esm({
  "node_modules/hono/dist/hono.js"() {
    init_hono_base();
    init_reg_exp_router();
    init_smart_router();
    init_trie_router();
    Hono2 = class extends Hono {
      /**
       * Creates an instance of the Hono class.
       *
       * @param options - Optional configuration options for the Hono instance.
       */
      constructor(options = {}) {
        super(options);
        this.router = options.router ?? new SmartRouter({
          routers: [new RegExpRouter(), new TrieRouter()]
        });
      }
    };
  }
});

// node_modules/hono/dist/index.js
var init_dist2 = __esm({
  "node_modules/hono/dist/index.js"() {
    init_hono();
    init_context();
  }
});

// node_modules/hono/dist/utils/color.js
function getColorEnabled() {
  const { process: process2, Deno } = globalThis;
  const isNoColor = typeof Deno?.noColor === "boolean" ? Deno.noColor : process2 !== void 0 ? (
    // eslint-disable-next-line no-unsafe-optional-chaining
    "NO_COLOR" in process2?.env
  ) : false;
  return !isNoColor;
}
async function getColorEnabledAsync() {
  const { navigator } = globalThis;
  const cfWorkers = "cloudflare:workers";
  const isNoColor = navigator !== void 0 && navigator.userAgent === "Cloudflare-Workers" ? await (async () => {
    try {
      return "NO_COLOR" in ((await import(cfWorkers)).env ?? {});
    } catch {
      return false;
    }
  })() : !getColorEnabled();
  return !isNoColor;
}
var init_color = __esm({
  "node_modules/hono/dist/utils/color.js"() {
  }
});

// node_modules/hono/dist/middleware/logger/index.js
async function log(fn, prefix, method, path, status = 0, elapsed) {
  const out = prefix === "<--" ? `${prefix} ${method} ${path}` : `${prefix} ${method} ${path} ${await colorStatus(status)} ${elapsed}`;
  fn(out);
}
var humanize, time, colorStatus, logger;
var init_logger = __esm({
  "node_modules/hono/dist/middleware/logger/index.js"() {
    init_color();
    humanize = (times) => {
      const [delimiter, separator] = [",", "."];
      const orderTimes = times.map((v) => v.replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1" + delimiter));
      return orderTimes.join(separator);
    };
    time = (start) => {
      const delta = Date.now() - start;
      return humanize([delta < 1e3 ? delta + "ms" : Math.round(delta / 1e3) + "s"]);
    };
    colorStatus = async (status) => {
      const colorEnabled = await getColorEnabledAsync();
      if (colorEnabled) {
        switch (status / 100 | 0) {
          case 5:
            return `\x1B[31m${status}\x1B[0m`;
          case 4:
            return `\x1B[33m${status}\x1B[0m`;
          case 3:
            return `\x1B[36m${status}\x1B[0m`;
          case 2:
            return `\x1B[32m${status}\x1B[0m`;
        }
      }
      return `${status}`;
    };
    logger = (fn = console.log) => {
      return async function logger2(c, next) {
        const { method, url } = c.req;
        const path = url.slice(url.indexOf("/", 8));
        await log(fn, "<--", method, path);
        const start = Date.now();
        await next();
        await log(fn, "-->", method, path, c.res.status, time(start));
      };
    };
  }
});

// server/dbindex.ts
import pg from "pg";
var db;
var init_dbindex = __esm({
  "server/dbindex.ts"() {
    pg.types.setTypeParser(1082, (v) => v);
    pg.types.setTypeParser(1114, (v) => v);
    pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());
    db = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 3e4
    });
  }
});

// server/middleware.ts
import { createHash } from "node:crypto";
function deny(code, message, status = 403) {
  throw Object.assign(new Error(message), { status, code });
}
function bearer(c) {
  const h = c.req.header("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}
async function sessionFrom(c) {
  const token = bearer(c);
  if (!token) return null;
  const r = await db.query("SELECT * FROM sessions WHERE token=$1 AND expires_at > now()", [token]);
  const s = r.rows[0];
  if (!s) return null;
  const g = (await db.query("SELECT * FROM grants WHERE email=$1", [s.email])).rows[0];
  if (!g) return null;
  if (g.ends_on < (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) return null;
  return { email: g.email, name: g.name, role: g.role, sites: g.sites, ends_on: g.ends_on };
}
async function requireSession(c) {
  const s = await sessionFrom(c);
  if (!s) deny("session_required", "A session is required.", 401);
  return s;
}
async function requireRole(c, roles) {
  const s = await requireSession(c);
  if (!roles.includes(s.role)) deny("role_not_permitted", `This act requires one of: ${roles.join(", ")}.`, 403);
  return s;
}
async function requireSite(c, site) {
  const s = await requireSession(c);
  if (!s.sites.includes(site)) deny("site_out_of_scope", `Your grant does not cover ${site}.`, 403);
  return s;
}
function noPaginationShared(c) {
  for (const p of ["page", "limit", "offset", "cursor"]) {
    if (c.req.query(p) !== void 0) deny("pagination_refused", `This route returns a complete set; ${p} is not accepted.`, 400);
  }
}
function hashBody(body) {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}
async function idempotent(c, next) {
  const key = c.req.header("idempotency-key");
  const method = c.req.method;
  const route = c.req.path;
  const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(method);
  if (!isWrite) return next();
  if (!key) {
    return c.json({ error: "idempotency_key_required", message: "Every write carries a client-supplied Idempotency-Key header." }, 400);
  }
  const raw2 = await c.req.raw.clone().text();
  const bodyHash = hashBody(raw2);
  const existing = await db.query("SELECT * FROM idempotency_keys WHERE key=$1 AND route=$2", [key, route]);
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (row.body_hash !== bodyHash) {
      return c.json({ error: "idempotency_key_reuse", message: "This key was sent to this route with a different body." }, 409);
    }
    return c.json(row.response, row.status);
  }
  await next();
  const res = c.res;
  if (res) {
    const status = res.status;
    let body = null;
    try {
      const text = await res.clone().text();
      body = text ? JSON.parse(text) : null;
    } catch {
      return;
    }
    await db.query(
      `INSERT INTO idempotency_keys (key,route,body_hash,status,response) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key,route) DO NOTHING`,
      [key, route, bodyHash, status, JSON.stringify(body)]
    );
  }
}
async function rememberIdempotent(c, status, body) {
  const key = c.get("idemKey");
  if (!key) return;
  await db.query(
    `INSERT INTO idempotency_keys (key,route,body_hash,status,response) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (key,route) DO NOTHING`,
    [key, c.req.path, c.get("idemBodyHash"), status, JSON.stringify(body)]
  );
}
async function rateLimit(c, bucket, limit, windowSeconds) {
  const now = /* @__PURE__ */ new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1e3)) * windowSeconds * 1e3);
  const r = await db.query(
    `INSERT INTO rate_limits (bucket, window_start, count) VALUES ($1,$2,1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1 RETURNING count`,
    [bucket, windowStart.toISOString()]
  );
  return Number(r.rows[0].count) <= limit;
}
async function readJson(c) {
  try {
    return await c.req.json();
  } catch {
    deny("invalid_json", "The body is not valid JSON.", 400);
  }
}
function requireFields(body, fields) {
  const missing = fields.filter((f) => body?.[f] === void 0 || body?.[f] === null || body?.[f] === "");
  if (missing.length) deny("missing_fields", `Required: ${missing.join(", ")}.`, 400);
}
var init_middleware = __esm({
  "server/middleware.ts"() {
    init_dbindex();
  }
});

// server/mail.ts
import nodemailer from "nodemailer";
function getTransport() {
  if (!transport) transport = nodemailer.createTransport({ host, port, pool: false });
  return transport;
}
async function sendMail(opts) {
  try {
    const info = await getTransport().sendMail({
      from: "Ravel <certificates@ravel.example.com>",
      to: opts.to,
      subject: opts.subject,
      text: opts.text
    });
    return { delivered: true, messageId: info.messageId };
  } catch (e) {
    console.error("mail_failed", e.message);
    return { delivered: false };
  }
}
var host, port, transport;
var init_mail = __esm({
  "server/mail.ts"() {
    host = process.env.SMTP_HOST || "";
    port = Number(process.env.SMTP_PORT || 1025);
    transport = null;
  }
});

// server/engine/record.ts
import { createHash as createHash2 } from "node:crypto";
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value === void 0 ? null : value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
}
function canonicalTimestamp(v) {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return v;
  }
  return JSON.stringify(v ?? null);
}
function digestOf(entry) {
  const h = createHash2("sha256");
  h.update(
    canonicalJson([
      canonicalTimestamp(entry.recorded_at) || null,
      entry.person || null,
      entry.site || null,
      entry.object_kind || null,
      entry.object_reference || null,
      entry.act,
      entry.detail === void 0 ? null : JSON.parse(canonicalJson(entry.detail))
    ])
  );
  h.update(entry.prev_digest);
  return h.digest("hex");
}
async function record(db2, entry) {
  const client = await db2.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(918273645)");
    const last = (await client.query("SELECT seq, digest FROM record_entries ORDER BY seq DESC LIMIT 1")).rows[0];
    const prev = last ? last.digest : GENESIS;
    const recorded_at = (/* @__PURE__ */ new Date()).toISOString();
    const digest = digestOf({ ...entry, recorded_at, prev_digest: prev });
    const inserted = await client.query(
      `INSERT INTO record_entries (recorded_at,event_at,effective_on,person,site,object_kind,object_reference,act,detail,digest,prev_digest,kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING seq,digest,prev_digest`,
      [
        recorded_at,
        entry.event_at || recorded_at,
        entry.effective_on || null,
        entry.person || null,
        entry.site || null,
        entry.object_kind || null,
        entry.object_reference || null,
        entry.act,
        JSON.stringify(entry.detail),
        digest,
        prev,
        entry.kind || "act"
      ]
    );
    await client.query("COMMIT");
    return inserted.rows[0];
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw e;
  } finally {
    client.release();
  }
}
async function checkChain(db2) {
  const rows = (await db2.query("SELECT seq,recorded_at,person,site,object_kind,object_reference,act,detail,digest,prev_digest FROM record_entries ORDER BY seq")).rows;
  let prev = GENESIS;
  let holds = true;
  let first_failure = null;
  let expected_seq = 1;
  for (const r of rows) {
    const seq = Number(r.seq);
    if (seq !== expected_seq) {
      holds = false;
      first_failure = first_failure ?? seq;
    }
    if (r.prev_digest !== prev) {
      holds = false;
      first_failure = first_failure ?? seq;
    }
    const recomputed = digestOf({
      recorded_at: r.recorded_at,
      person: r.person,
      site: r.site,
      object_kind: r.object_kind,
      object_reference: r.object_reference,
      act: r.act,
      detail: r.detail,
      prev_digest: r.prev_digest
    });
    if (recomputed !== r.digest) {
      holds = false;
      first_failure = first_failure ?? seq;
    }
    expected_seq = seq + 1;
    prev = r.digest;
  }
  return { holds, first_failure, entries: rows.length };
}
var GENESIS;
var init_record = __esm({
  "server/engine/record.ts"() {
    GENESIS = "0".repeat(64);
  }
});

// server/routes/public.ts
async function requireSessionSafe(c) {
  const h = c.req.header("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const r = await db.query("SELECT * FROM sessions WHERE token=$1 AND expires_at > now()", [m[1]]);
  if (!r.rows[0]) return null;
  const g = (await db.query("SELECT * FROM grants WHERE email=$1", [r.rows[0].email])).rows[0];
  return g || null;
}
var publicSite, ENQUIRY_TYPES;
var init_public = __esm({
  "server/routes/public.ts"() {
    init_dist2();
    init_dbindex();
    init_middleware();
    init_mail();
    init_record();
    publicSite = new Hono2();
    publicSite.get("/statistics", async (c) => {
      const rows = (await db.query("SELECT * FROM statistics ORDER BY key")).rows;
      return c.json(rows.map((r) => ({ key: r.key, value: r.value, source: r.source, year: Number(r.year), geography: r.geography })));
    });
    publicSite.get("/positions", async (c) => {
      const rows = (await db.query("SELECT * FROM positions ORDER BY id")).rows;
      return c.json(rows.map((r) => ({ id: r.id, title: r.title, location: r.location, department: r.department, contract_type: r.contract_type, closes_on: r.closes_on })));
    });
    publicSite.get("/news", async (c) => {
      const rows = (await db.query("SELECT * FROM news_items ORDER BY published_on DESC")).rows;
      return c.json(rows.map((r) => ({ id: r.id, title: r.title, tag: r.tag, outlet: r.outlet, published_on: r.published_on, link: r.link, language: r.language })));
    });
    publicSite.get("/claim-register", async (c) => {
      const s = await requireSessionSafe(c);
      if (!s) deny("session_required", "The claim register is an internal surface.", 401);
      const rows = (await db.query("SELECT * FROM claim_substantiations ORDER BY key")).rows;
      return c.json(rows.map((r) => ({
        key: r.key,
        claim: r.claim,
        route: r.route,
        first_published_on: r.first_published_on,
        evidence: r.evidence,
        method_version: r.method_version,
        approver: r.approver,
        review_on: r.review_on
      })));
    });
    ENQUIRY_TYPES = {
      waste_supply: { destination: "feedstock@example.com", days: 3 },
      polymer_purchase: { destination: "sales@example.com", days: 2 },
      partnership: { destination: "partners@example.com", days: 5 },
      press: { destination: "press@example.com", days: 1 }
    };
    publicSite.post("/enquiries", async (c) => {
      const body = await readJson(c);
      requireFields(body, ["type", "email"]);
      const t = ENQUIRY_TYPES[body.type];
      if (!t) deny("invalid_type", "type must be one of waste_supply, polymer_purchase, partnership, press.", 400);
      const count = (await db.query("SELECT COALESCE(MAX(id),0)::int + 1 AS n FROM enquiries")).rows[0].n;
      const reference = "ENQ-" + String(count).padStart(4, "0");
      const deadline = body.type === "press" ? new Date(Date.now() + t.days * 864e5).toISOString().slice(0, 10) : null;
      let opened_record = null;
      if (body.type === "waste_supply") {
        opened_record = "collector enquiry record opened for " + (body.name || body.email);
      } else if (body.type === "polymer_purchase") {
        opened_record = "conformance record opened for " + (body.name || body.email);
      }
      await db.query(
        `INSERT INTO enquiries (reference,type,destination,response_days,name,email,message,deadline,opened_record)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [reference, body.type, t.destination, t.days, body.name || null, body.email, body.message || null, deadline, opened_record]
      );
      await sendMail({
        to: body.email,
        subject: `Enquiry ${reference} received`,
        text: [
          `Reference: ${reference}`,
          `Destination: ${t.destination}`,
          `Stated response time: ${t.days} working days`,
          "",
          "We have received your enquiry. The named destination will reply within the stated response time.",
          "The data you sent is used to answer this enquiry, is kept for the retention stated in our privacy policy, and can be removed on request at privacy@example.com."
        ].join("\n")
      });
      await record(db, { person: body.email || "anonymous", act: "enquiry_received", object_kind: "enquiry", object_reference: reference, detail: { type: body.type, destination: t.destination, response_days: t.days } });
      return c.json({ reference, destination: t.destination, response_days: t.days, deadline, opened_record }, 201);
    });
    publicSite.get("/verify/:number", async (c) => {
      const ip = c.req.header("x-forwarded-for") || "anon";
      const ok = await rateLimit(c, "verify:" + ip, 120, 60);
      if (!ok) return c.json({ error: "rate_limited", message: "Too many verification requests." }, 429);
      const number = c.req.param("number");
      const cert = (await db.query("SELECT * FROM certificates WHERE number=$1", [number])).rows[0];
      if (!cert) return c.json({ found: false, number });
      let recipientName = cert.recipient;
      try {
        const g = await db.query("SELECT name FROM grants WHERE email=$1", [cert.recipient]);
        if (!g.rows[0]) {
          const party = await db.query(
            "SELECT name FROM party_versions WHERE party=$1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1",
            [cert.recipient, String(cert.signed_at).slice(0, 10)]
          );
          if (party.rows[0]) recipientName = party.rows[0].name;
        }
      } catch {
      }
      return c.json({
        found: true,
        number: cert.number,
        state: cert.state,
        issued_on: String(cert.signed_at).slice(0, 10),
        withdrawn_on: cert.withdrawn_on || null,
        withdrawal_reason: cert.withdrawal_reason || null,
        site: cert.site,
        grade: cert.grade,
        claim_type: cert.claim_type,
        recipient_name: recipientName
      });
    });
  }
});

// server/routes/auth.ts
import { randomBytes } from "node:crypto";
async function tokenFromKeycloak(email, password) {
  const endpoint = ISSUER.replace(/\/$/, "") + "/protocol/openid-connect/token";
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: email,
    password
  });
  const res = await fetch(endpoint, { method: "POST", body });
  if (!res.ok) return null;
  return res.json();
}
async function verifyPasswordAgain(email, password) {
  const kc = await tokenFromKeycloak(email, password);
  return !!kc;
}
var authRoutes, ISSUER, CLIENT_ID, CLIENT_SECRET;
var init_auth = __esm({
  "server/routes/auth.ts"() {
    init_dist2();
    init_dbindex();
    init_middleware();
    authRoutes = new Hono2();
    ISSUER = process.env.AUTH_ISSUER_URL || "";
    CLIENT_ID = process.env.AUTH_CLIENT_ID || "";
    CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET || "";
    authRoutes.post("/auth/login", async (c) => {
      const ok = await rateLimit(c, "login:" + c.req.header("x-forwarded-for"), 30, 300);
      if (!ok) return c.json({ error: "rate_limited", message: "Too many sign-in attempts." }, 429);
      const body = await readJson(c);
      requireFields(body, ["email", "password"]);
      const kc = await tokenFromKeycloak(body.email, body.password);
      if (!kc) return c.json({ error: "invalid_credentials", message: "The email and password were not accepted." }, 401);
      const grant = (await db.query("SELECT * FROM grants WHERE email=$1", [body.email])).rows[0];
      if (!grant) return c.json({ error: "no_grant", message: "No grant stands for this account." }, 403);
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 12 * 3600 * 1e3);
      await db.query("INSERT INTO sessions (token,email,expires_at) VALUES ($1,$2,$3)", [token, body.email, expires.toISOString()]);
      return c.json({ access_token: token, token_type: "Bearer", expires_at: expires.toISOString() });
    });
    authRoutes.post("/auth/logout", async (c) => {
      const s = await requireSession(c);
      const token = (c.req.header("authorization") || "").replace(/^Bearer\s+/i, "");
      await db.query("DELETE FROM sessions WHERE token=$1", [token]);
      return c.json({ ok: true });
    });
    authRoutes.get("/auth/me", async (c) => {
      const s = await requireSession(c);
      return c.json({ email: s.email, name: s.name, roles: [s.role], sites: s.sites, grant_ends_on: s.ends_on });
    });
  }
});

// server/engine/arithmetic.ts
function floorDiv(a, b) {
  if (b === 0) throw new Error("division_by_zero");
  return Math.floor(a / b);
}
function contentBp(creditAttachedG, lotMassG) {
  return floorDiv(creditAttachedG * 1e4, lotMassG);
}
function shareBp(partG, totalG) {
  return floorDiv(partG * 1e4, totalG);
}
function factorBp(outG, inG) {
  return floorDiv(outG * 1e4, inG);
}
function requiredRemainingBp(committedKg, deliveredKg, runningBp, floorBp) {
  const remainingKg = committedKg - deliveredKg;
  if (remainingKg <= 0) return 0;
  const need = committedKg * floorBp - deliveredKg * runningBp;
  return need <= 0 ? 0 : floorDiv(need, remainingKg);
}
function sum(list) {
  return list.reduce((a, b) => a + b, 0);
}
function twelveMonthsBefore(date) {
  const d = /* @__PURE__ */ new Date(date + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}
var init_arithmetic = __esm({
  "server/engine/arithmetic.ts"() {
  }
});

// server/engine/feedstock.ts
function dryMass(netG, moistureBp) {
  return Math.floor(netG * (1e4 - moistureBp) / 1e4);
}
async function approvalInForce(db2, collector, on) {
  const r = await db2.query(
    `SELECT * FROM approval_periods WHERE collector=$1 AND valid_from <= $2 AND valid_to >= $2
     ORDER BY valid_from DESC LIMIT 1`,
    [collector, on]
  );
  return r.rows[0] || null;
}
async function collectorNamesAsAt(db2, collector, on) {
  const r = await db2.query(
    `SELECT name FROM party_versions WHERE party=$1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1`,
    [collector, on]
  );
  return r.rows[0]?.name || collector;
}
async function currentPartyName(db2, party) {
  const r = await db2.query(
    `SELECT name FROM party_versions WHERE party=$1 ORDER BY effective_from DESC LIMIT 1`,
    [party]
  );
  return r.rows[0]?.name || party;
}
async function resolveBatch(db2, batch) {
  const approval = await approvalInForce(db2, batch.collector, batch.received_on);
  const kinds = new Set(batch.custody.map((c) => c.kind));
  const missing = CUSTODY_KINDS.find((k) => !kinds.has(k)) || null;
  const custodyComplete = missing === null;
  let claimable = true;
  let reason = null;
  if (!approval || !["approved", "conditional"].includes(approval.state)) {
    claimable = false;
    reason = approval ? "collector_approval_" + approval.state : "collector_approval_lapsed";
    if (approval && approval.state === "suspended") reason = "collector_approval_suspended";
    if (!approval) reason = "collector_approval_lapsed";
  } else if (!custodyComplete) {
    claimable = false;
    reason = "custody_link_missing:" + missing;
  }
  const device = (await db2.query("SELECT * FROM devices WHERE reference=$1", [batch.device])).rows[0];
  const flags = [];
  if (device && device.calibrated_on < twelveMonthsBefore(batch.received_on)) flags.push("lapsed_calibration");
  return {
    dry_mass_g: dryMass(batch.net_g, batch.moisture_bp),
    claimable,
    claimable_reason: reason,
    claimable_from: batch.claimable_from || null,
    flags,
    custody_complete: custodyComplete,
    missing_custody_kind: missing,
    collector_name: await currentPartyName(db2, batch.collector),
    collector_name_as_at: await collectorNamesAsAt(db2, batch.collector, batch.received_on)
  };
}
var CUSTODY_KINDS;
var init_feedstock = __esm({
  "server/engine/feedstock.ts"() {
    init_arithmetic();
    CUSTODY_KINDS = ["collection_site", "collector", "transport", "arrival", "weighing", "acceptance"];
  }
});

// server/engine/genealogy.ts
var genealogy_exports = {};
__export(genealogy_exports, {
  batchImpact: () => batchImpact,
  partyNames: () => partyNames,
  upstreamGraph: () => upstreamGraph
});
async function upstreamGraph(db2, lotRef) {
  const nodes = /* @__PURE__ */ new Map();
  const edges = /* @__PURE__ */ new Map();
  const addNode = (n) => {
    const existing = nodes.get(n.reference);
    if (existing) {
      existing.mass_g += n.mass_g;
      for (const f of n.flags) if (!existing.flags.includes(f)) existing.flags.push(f);
      for (const k of Object.keys(n.category_split)) {
        existing.category_split[k] = (existing.category_split[k] || 0) + n.category_split[k];
      }
    } else nodes.set(n.reference, n);
  };
  const addEdge = (from, to, mass) => {
    const key = from + ">" + to;
    const e = edges.get(key);
    if (e) e.mass_g += mass;
    else edges.set(key, { from, to, mass_g: mass });
  };
  const lot = (await db2.query("SELECT * FROM lots WHERE reference=$1", [lotRef])).rows[0];
  if (!lot) throw Object.assign(new Error("lot_not_found"), { status: 404 });
  const flagCache = /* @__PURE__ */ new Map();
  const flagsForBatch = async (ref) => {
    if (flagCache.has(ref)) return flagCache.get(ref);
    const b = (await db2.query("SELECT * FROM batches WHERE reference=$1", [ref])).rows[0];
    const flags = [];
    if (b) {
      const dev = (await db2.query("SELECT calibrated_on, received_on FROM devices d JOIN batches b2 ON b2.device=d.reference WHERE b2.reference=$1", [ref])).rows[0];
      if (dev && dev.calibrated_on) {
        const expiry = new Date(dev.calibrated_on);
        expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
        if (expiry.toISOString().slice(0, 10) < dev.received_on) flags.push("lapsed_calibration");
      }
      const kinds = new Set(b.custody.map((c) => c.kind));
      const required = ["collection_site", "collector", "transport", "arrival", "weighing", "acceptance"];
      const missing = required.find((k) => !kinds.has(k));
      if (missing) flags.push("custody_link_missing:" + missing);
      const approval = (await db2.query(
        `SELECT 1 FROM approval_periods ap WHERE ap.collector=$1 AND ap.state IN ('approved','conditional')
           AND $2 BETWEEN ap.valid_from AND ap.valid_to LIMIT 1`,
        [b.collector, b.received_on]
      )).rows;
      if (missing || approval.length === 0) flags.push("non_claimable");
    }
    flagCache.set(ref, flags);
    return flags;
  };
  const walkOutput = async (outputRef, massRemaining, visited) => {
    const out = (await db2.query("SELECT * FROM outputs WHERE reference=$1", [outputRef])).rows[0];
    if (!out) return;
    addNode({ kind: out.kind === "lot" ? "lot" : out.kind, reference: out.reference, mass_g: massRemaining, category_split: {}, flags: [] });
    await walkRun(out.run, massRemaining, visited);
  };
  const walkRun = async (runRef, massRemaining, visited) => {
    const run = (await db2.query("SELECT * FROM runs WHERE reference=$1", [runRef])).rows[0];
    if (!run) return;
    const seen = visited.get(runRef) || 0;
    if (seen > 4) return;
    visited.set(runRef, seen + 1);
    const rows = (await db2.query("SELECT * FROM consumptions WHERE run=$1 ORDER BY id", [runRef])).rows;
    const totalIn = rows.reduce((a, r) => a + Number(r.mass_g), 0);
    if (totalIn === 0) return;
    for (const r of rows) {
      const share = Math.floor(Number(r.mass_g) * massRemaining / totalIn);
      if (share <= 0 && r.input_kind !== "batch") continue;
      const nodeMass = r.input_kind === "batch" ? Number(r.mass_g) : share;
      addEdge(r.input_reference, "RUN:" + runRef, Number(r.mass_g));
      if (r.input_kind === "batch") {
        const b = (await db2.query("SELECT * FROM batches WHERE reference=$1", [r.input_reference])).rows[0];
        const flags = await flagsForBatch(r.input_reference);
        addNode({ kind: "batch", reference: r.input_reference, mass_g: nodeMass, category_split: { [b?.category || "unknown"]: nodeMass }, flags });
      } else {
        await walkOutput(r.input_reference, share, visited);
      }
    }
    addNode({ kind: "run", reference: runRef, mass_g: massRemaining, category_split: {}, flags: [] });
  };
  const lotOutputs = (await db2.query("SELECT * FROM outputs WHERE lot=$1", [lotRef])).rows;
  if (lotOutputs.length === 0) {
    if (lot.blended_from) {
      for (const parent of lot.blended_from) await walkOutput(parent.reference, Number(parent.mass_g), /* @__PURE__ */ new Map());
    } else {
      addNode({ kind: "lot", reference: lot.reference, mass_g: Number(lot.mass_g), category_split: {}, flags: [] });
    }
  } else {
    addNode({ kind: "lot", reference: lot.reference, mass_g: Number(lot.mass_g), category_split: {}, flags: [] });
    for (const o of lotOutputs) await walkRun(o.run, Number(o.mass_g), /* @__PURE__ */ new Map());
  }
  const nodeList = [...nodes.values()];
  const text = buildTextEquivalent(nodeList, [...edges.values()], lotRef);
  return { lot: lotRef, nodes: nodeList, edges: [...edges.values()], flagged: nodeList.some((n) => n.flags.length > 0), text_equivalent: text };
}
function buildTextEquivalent(nodes, edges, lotRef) {
  const byRef = new Map(nodes.map((n) => [n.reference, n]));
  const childrenOf = /* @__PURE__ */ new Map();
  for (const e of edges) {
    const list = childrenOf.get(e.to) || [];
    if (!list.includes(e.from)) list.push(e.from);
    childrenOf.set(e.to, list);
  }
  const seen = /* @__PURE__ */ new Set();
  const render = (ref, depth) => {
    const n = byRef.get(ref);
    const kids = (childrenOf.get(ref) || []).map((c) => byRef.get(c)).filter(Boolean);
    const childEntries = [];
    for (const k of kids) {
      const key = ref + ">" + k.reference;
      if (seen.has(key)) continue;
      seen.add(key);
      const e = edges.find((x) => x.from === k.reference && x.to === ref);
      childEntries.push({ ...render(k.reference, depth + 1), edge_mass_g: e ? e.mass_g : k.mass_g });
    }
    return {
      kind: n?.kind,
      reference: ref,
      mass_g: n?.mass_g ?? 0,
      category_split: n?.category_split ?? {},
      flags: n?.flags ?? [],
      feeds: childEntries
    };
  };
  return render(lotRef, 0);
}
async function batchImpact(db2, batchRef) {
  const lots = /* @__PURE__ */ new Map();
  const downstreamOfRun = async (runRef, mass, depth) => {
    if (depth > 6) return;
    const outs = (await db2.query("SELECT * FROM outputs WHERE run=$1", [runRef])).rows;
    const outsMass = outs.reduce((a, o) => a + Number(o.mass_g), 0);
    if (outsMass === 0) return;
    for (const o of outs) {
      const share = Math.floor(Number(o.mass_g) * mass / outsMass);
      if (share <= 0) continue;
      if (o.kind === "lot" && o.lot) {
        const site = (await db2.query("SELECT site FROM lots WHERE reference=$1", [o.lot])).rows[0]?.site || "";
        const existing = lots.get(o.lot);
        if (existing) existing.mass_g += share;
        else lots.set(o.lot, { reference: o.lot, mass_g: share, site });
      } else if (o.kind === "intermediate") {
        const cons2 = (await db2.query("SELECT * FROM consumptions WHERE input_reference=$1", [o.reference])).rows;
        for (const c of cons2) await downstreamOfRun(c.run, share, depth + 1);
      }
    }
  };
  const cons = (await db2.query("SELECT * FROM consumptions WHERE batch=$1", [batchRef])).rows;
  for (const c of cons) await downstreamOfRun(c.run, Number(c.mass_g), 0);
  const lotRefs = [...lots.keys()];
  const certs = lotRefs.length ? (await db2.query("SELECT * FROM certificates ORDER BY number")).rows.filter(
    (c) => c.lots.some((l) => lotRefs.includes(l.reference))
  ) : [];
  const recipients = [...new Set(certs.map((c) => c.recipient))];
  const names = await partyNames(db2, recipients);
  return {
    batch: batchRef,
    lots: [...lots.values()],
    certificates: certs.map((c) => ({ number: c.number, version: c.version, state: c.state, site: c.site, recipient: c.recipient, claim_type: c.claim_type, content_bp: Number(c.content_bp) })),
    recipients: recipients.map((r) => ({ reference: r, name: names[r] || r }))
  };
}
async function partyNames(db2, refs, on) {
  const out = {};
  for (const ref of refs) {
    const r = await db2.query(
      "SELECT name FROM party_versions WHERE party=$1 AND effective_from <= COALESCE($2::date, CURRENT_DATE) ORDER BY effective_from DESC LIMIT 1",
      [ref, on || null]
    );
    if (r.rows[0]) out[ref] = r.rows[0].name;
  }
  return out;
}
var init_genealogy = __esm({
  "server/engine/genealogy.ts"() {
  }
});

// server/routes/reference.ts
function batchView(b, r) {
  return {
    reference: b.reference,
    collector: b.collector,
    collector_name: r.collector_name_as_at,
    site: b.site,
    grade: b.grade,
    category: b.category,
    gross_g: Number(b.gross_g),
    tare_g: Number(b.tare_g),
    net_g: Number(b.net_g),
    moisture_bp: b.moisture_bp,
    moisture_method: b.moisture_method,
    device: b.device,
    received_on: b.received_on,
    dry_mass_g: r.dry_mass_g,
    claimable: r.claimable,
    claimable_reason: r.claimable_reason,
    claimable_from: r.claimable_from,
    flags: r.flags,
    custody_complete: r.custody_complete,
    missing_custody_kind: r.missing_custody_kind,
    custody: b.custody,
    composition: b.composition,
    contamination: b.contamination,
    accepted_g: Number(b.accepted_g),
    rejected_g: Number(b.rejected_g),
    rejected_destination: b.rejected_destination,
    rejection_reason: b.reject_reason,
    derivation: { dry_mass: "net_g * (10000 - moisture_bp) / 10000, floored", claimability: "approval in force on received_on plus custody completeness" }
  };
}
function recipeFor(version) {
  const recipes = {
    "RCP-DISS-2": { set_points: { temperature: { min: 160, max: 170 }, pressure: { min: 2, max: 4 }, residence_minutes: { min: 90, max: 110 } }, reagents: [{ name: "methanol", ratio_bp: 1800 }, { name: "sodium hydroxide", ratio_bp: 300 }], residence_time_minutes: 100, released_by: "quality@example.com", published_threshold: { temperature: 175, pressure: 5 } },
    "RCP-DEPO-4": { set_points: { temperature: { min: 260, max: 285 }, pressure: { min: 8, max: 14 } }, reagents: [{ name: "methanol", ratio_bp: 2200 }], residence_time_minutes: 180, released_by: "quality@example.com", published_threshold: { temperature: 290, pressure: 15 } },
    "RCP-PURI-1": { set_points: { temperature: { min: 80, max: 95 }, pressure: { min: 1, max: 2 } }, reagents: [{ name: "activated carbon", ratio_bp: 150 }], residence_time_minutes: 240, released_by: "quality@example.com", published_threshold: { temperature: 100, pressure: 3 } },
    "RCP-REPO-3": { set_points: { temperature: { min: 250, max: 265 }, pressure: { min: 8, max: 12 } }, reagents: [{ name: "caprolactam", ratio_bp: 9800 }], residence_time_minutes: 300, released_by: "quality@example.com", published_threshold: { temperature: 270, pressure: 14 } }
  };
  return recipes[version] || null;
}
async function openRestatement(db2, periodId, reason, by) {
  const n = (await db2.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM restatements")).rows[0].n;
  const ref = "RST-" + String(n).padStart(4, "0");
  const certs = (await db2.query("SELECT number FROM certificates WHERE period=$1 ORDER BY number", [periodId])).rows.map((r) => r.number);
  await db2.query(
    `INSERT INTO restatements (reference,period,reason,opened_by,opened_on,certificates,state) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,'open')`,
    [ref, periodId, reason, by, JSON.stringify(certs)]
  );
  await record(db2, { person: by, act: "restatement_opened", object_kind: "restatement", object_reference: ref, detail: { period: periodId, reason, certificates: certs } });
  return ref;
}
function body_setpoints(b) {
  return b && b.actual_setpoints ? b.actual_setpoints : null;
}
var referenceRoutes;
var init_reference = __esm({
  "server/routes/reference.ts"() {
    init_dist2();
    init_dbindex();
    init_middleware();
    init_feedstock();
    init_genealogy();
    init_record();
    init_feedstock();
    referenceRoutes = new Hono2();
    referenceRoutes.get("/sites", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM sites ORDER BY reference")).rows;
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const out = [];
      for (const s of rows) {
        const suspension = (await db.query(
          `SELECT * FROM site_events WHERE site=$1 AND kind='certification_suspended' AND effective_from <= $2 AND (effective_to IS NULL OR effective_to >= $2) ORDER BY effective_from DESC LIMIT 1`,
          [s.reference, today]
        )).rows[0];
        out.push({
          reference: s.reference,
          name: s.name,
          confidence: s.confidence,
          certification_state: suspension ? "suspended" : s.certification_state,
          suspension: suspension ? { from: suspension.effective_from, to: suspension.effective_to, reason: suspension.detail?.reason || null } : null
        });
      }
      return c.json(out);
    });
    referenceRoutes.get("/sites/:reference/capacity", async (c) => {
      await requireSession(c);
      const s = (await db.query("SELECT * FROM sites WHERE reference=$1", [c.req.param("reference")])).rows[0];
      if (!s) deny("site_not_found", "No such site.", 404);
      return c.json({
        reference: s.reference,
        name: s.name,
        nameplate_kg: Number(s.nameplate_kg),
        basis: s.capacity_basis,
        contracted_kg: Number(s.contracted_kg),
        uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg),
        confidence: s.confidence,
        last_revised: s.last_revised
      });
    });
    referenceRoutes.post("/sites/:reference/certification", async (c) => {
      const s = await requireRole(c, ["quality_manager"]);
      const body = await readJson(c);
      requireFields(body, ["state", "effective_from"]);
      const ref = c.req.param("reference");
      const site = (await db.query("SELECT * FROM sites WHERE reference=$1", [ref])).rows[0];
      if (!site) deny("site_not_found", "No such site.", 404);
      const effectiveTo = body.effective_to || (body.lift ? body.effective_from : null);
      await db.query(
        `INSERT INTO site_events (site,effective_from,effective_to,kind,detail) VALUES ($1,$2,$3,$4,$5)`,
        [ref, body.effective_from, effectiveTo, body.state === "suspended" ? "certification_suspended" : "certification_lifted", JSON.stringify({ reason: body.reason || null, recorded_by: s.email })]
      );
      if (body.state === "suspended") {
        await db.query("UPDATE sites SET certification_state='suspended' WHERE reference=$1", [ref]);
      } else {
        await db.query("UPDATE sites SET certification_state='certified' WHERE reference=$1", [ref]);
      }
      const certs = (await db.query("SELECT * FROM certificates WHERE site=$1 ORDER BY number", [ref])).rows.filter((x) => {
        const d = String(x.signed_at).slice(0, 10);
        return d >= body.effective_from && (!effectiveTo || d <= effectiveTo);
      });
      const resolutions = certs.map((x) => ({
        certificate: x.number,
        state: x.state,
        suggested_outcome: x.state === "withdrawn" ? "unaffected" : "reissued"
      }));
      await record(db, {
        person: s.email,
        site: ref,
        act: "site_certification_recorded",
        object_kind: "site",
        object_reference: ref,
        detail: { state: body.state, effective_from: body.effective_from, effective_to: effectiveTo }
      });
      return c.json({
        site: ref,
        state: body.state,
        effective_from: body.effective_from,
        effective_to: effectiveTo,
        certificates_in_window: resolutions
      }, 201);
    });
    referenceRoutes.get("/collectors", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM collectors ORDER BY reference")).rows;
      const out = [];
      for (const col of rows) {
        const periods = (await db.query("SELECT * FROM approval_periods WHERE collector=$1 ORDER BY valid_from", [col.reference])).rows;
        const findings = (await db.query("SELECT * FROM findings WHERE collector=$1 ORDER BY opened_on DESC", [col.reference])).rows;
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const expiring = periods.find((p) => p.state !== "lapsed" && (Date.parse(p.valid_to) - Date.parse(today)) / 864e5 <= 14 && p.valid_to >= today);
        out.push({
          reference: col.reference,
          name: (await db.query("SELECT name FROM party_versions WHERE party=$1 ORDER BY effective_from DESC LIMIT 1", [col.reference])).rows[0].name,
          country: col.country,
          registration: col.registration,
          registration_expiry: col.registration_expiry,
          collection_site_types: col.collection_site_types,
          declared_streams: col.declared_streams,
          scheme_status: col.scheme_status,
          findings: findings.map((f) => ({ reference: f.reference, description: f.description, departure_bp: f.departure_bp, state: f.state, opened_on: f.opened_on })),
          approval_periods: periods.map((p) => ({
            state: p.state,
            valid_from: p.valid_from,
            valid_to: p.valid_to,
            condition: p.condition || null,
            condition_closes_on: p.condition_closes_on || null,
            expiring: !!expiring && expiring.id === p.id
          }))
        });
      }
      return c.json(out);
    });
    referenceRoutes.get("/collectors/:reference", async (c) => {
      await requireSession(c);
      const col = (await db.query("SELECT * FROM collectors WHERE reference=$1", [c.req.param("reference")])).rows[0];
      if (!col) deny("collector_not_found", "No such collector.", 404);
      const periods = (await db.query("SELECT * FROM approval_periods WHERE collector=$1 ORDER BY valid_from", [col.reference])).rows;
      const findings = (await db.query("SELECT * FROM findings WHERE collector=$1 ORDER BY opened_on DESC", [col.reference])).rows;
      return c.json({
        reference: col.reference,
        name: (await db.query("SELECT name FROM party_versions WHERE party=$1 ORDER BY effective_from DESC LIMIT 1", [col.reference])).rows[0].name,
        country: col.country,
        registration: col.registration,
        registration_expiry: col.registration_expiry,
        collection_site_types: col.collection_site_types,
        declared_streams: col.declared_streams,
        scheme_status: col.scheme_status,
        findings: findings.map((f) => ({ reference: f.reference, description: f.description, departure_bp: f.departure_bp, state: f.state, opened_on: f.opened_on })),
        approval_periods: periods.map((p) => ({ state: p.state, valid_from: p.valid_from, valid_to: p.valid_to, condition: p.condition || null, condition_closes_on: p.condition_closes_on || null }))
      });
    });
    referenceRoutes.post("/collectors/:reference/approvals", async (c) => {
      const s = await requireRole(c, ["quality_manager"]);
      const body = await readJson(c);
      requireFields(body, ["state", "valid_from", "valid_to"]);
      const ref = c.req.param("reference");
      const col = (await db.query("SELECT * FROM collectors WHERE reference=$1", [ref])).rows[0];
      if (!col) deny("collector_not_found", "No such collector.", 404);
      if (body.state === "conditional") requireFields(body, ["condition", "condition_closes_on"]);
      const r = await db.query(
        `INSERT INTO approval_periods (collector,state,valid_from,valid_to,condition,condition_closes_on)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ref, body.state, body.valid_from, body.valid_to, body.condition || null, body.condition_closes_on || null]
      );
      await record(db, { person: s.email, site: null, act: "collector_approval_added", object_kind: "collector", object_reference: ref, detail: { state: body.state, valid_from: body.valid_from, valid_to: body.valid_to } });
      return c.json({ id: r.rows[0].id, collector: ref, state: body.state, valid_from: body.valid_from, valid_to: body.valid_to }, 201);
    });
    referenceRoutes.get("/parties/:reference/versions", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM party_versions WHERE party=$1 ORDER BY effective_from", [c.req.param("reference")])).rows;
      return c.json(rows.map((r) => ({ reference: r.party, name: r.name, effective_from: r.effective_from })));
    });
    referenceRoutes.post("/parties/:reference/versions", async (c) => {
      const s = await requireRole(c, ["quality_manager", "claims_manager"]);
      const body = await readJson(c);
      requireFields(body, ["name", "effective_from"]);
      const ref = c.req.param("reference");
      const prev = (await db.query("SELECT MAX(effective_from) AS d FROM party_versions WHERE party=$1 AND effective_from < $2", [ref, body.effective_from])).rows[0];
      await db.query("INSERT INTO party_versions (party,name,effective_from) VALUES ($1,$2,$3)", [ref, body.name, body.effective_from]);
      await record(db, { person: s.email, act: "party_version_recorded", object_kind: "party", object_reference: ref, detail: { name: body.name, effective_from: body.effective_from, supersedes: prev.d || null } });
      return c.json({ reference: ref, name: body.name, effective_from: body.effective_from, supersedes_effective_from: prev.d || null }, 201);
    });
    referenceRoutes.get("/batches", async (c) => {
      const s = await requireSession(c);
      noPaginationShared(c);
      const rows = (await db.query("SELECT * FROM batches ORDER BY received_on, reference")).rows;
      const out = [];
      for (const b of rows) {
        if (s.role !== "plant_operator" && s.role !== "auditor" && s.role !== "quality_manager" && s.role !== "claims_manager" && s.role !== "lab_analyst" && s.role !== "certificate_signer") continue;
        const r = await resolveBatch(db, b);
        out.push(batchView(b, r));
      }
      return c.json(out);
    });
    referenceRoutes.get("/batches/:reference", async (c) => {
      await requireSession(c);
      const b = (await db.query("SELECT * FROM batches WHERE reference=$1", [c.req.param("reference")])).rows[0];
      if (!b) deny("batch_not_found", "No such batch.", 404);
      const r = await resolveBatch(db, b);
      const view = batchView(b, r);
      const deviating = b.composition.filter((x) => x.measured_fraction_bp !== void 0 && Math.abs(x.measured_fraction_bp - x.fraction_bp) > 500);
      view.composition_departure = deviating.map((x) => ({ polymer: x.polymer, declared_fraction_bp: x.fraction_bp, measured_fraction_bp: x.measured_fraction_bp, departure_bp: Math.abs(x.measured_fraction_bp - x.fraction_bp) }));
      return c.json(view);
    });
    referenceRoutes.post("/batches", async (c) => {
      const s = await requireRole(c, ["plant_operator"]);
      const body = await readJson(c);
      requireFields(body, ["collector", "site", "category", "gross_g", "tare_g", "net_g", "moisture_bp", "moisture_method", "device", "received_on", "composition", "contamination", "custody"]);
      if (!["post_consumer", "pre_consumer"].includes(body.category)) deny("invalid_category", "category is required and is one of post_consumer, pre_consumer.", 400);
      await requireSite(c, body.site);
      for (const f of ["gross_g", "tare_g", "net_g", "moisture_bp"]) requireInteger(body, f);
      if (body.net_g !== body.gross_g - body.tare_g) deny("mass_does_not_reconcile", "net_g must equal gross_g minus tare_g.", 400);
      const col = (await db.query("SELECT * FROM collectors WHERE reference=$1", [body.collector])).rows[0];
      if (!col) deny("collector_not_found", "No such collector.", 404);
      const device = (await db.query("SELECT * FROM devices WHERE reference=$1", [body.device])).rows[0];
      if (!device) deny("device_not_found", "No such weighing device.", 404);
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM batches")).rows[0].n;
      const reference = "BATCH-" + String(n).padStart(4, "0");
      await db.query(
        `INSERT INTO batches (reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,received_on,composition,contamination,custody,accepted_g,rejected_g)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0)`,
        [
          reference,
          body.collector,
          body.site,
          body.grade || "N6",
          body.category,
          body.gross_g,
          body.tare_g,
          body.net_g,
          body.moisture_bp,
          body.moisture_method,
          body.device,
          body.received_on,
          JSON.stringify(body.composition),
          JSON.stringify(body.contamination),
          JSON.stringify(body.custody),
          body.net_g
        ]
      );
      for (const comp of body.composition) {
        if (comp.measured_fraction_bp !== void 0 && Math.abs(comp.measured_fraction_bp - comp.fraction_bp) > 500) {
          const fcount = (await db.query("SELECT COALESCE(MAX(id),0)::int + 1 AS n FROM findings")).rows[0].n;
          const fref = "FND-" + String(fcount).padStart(4, "0");
          await db.query(
            `INSERT INTO findings (reference,collector,batch,description,departure_bp,state,opened_on) VALUES ($1,$2,$3,$4,$5,'open',CURRENT_DATE)`,
            [fref, body.collector, reference, `Measured composition departs from the declaration by ${Math.abs(comp.measured_fraction_bp - comp.fraction_bp)} basis points.`, Math.abs(comp.measured_fraction_bp - comp.fraction_bp)]
          );
        }
      }
      const b = (await db.query("SELECT * FROM batches WHERE reference=$1", [reference])).rows[0];
      const r = await resolveBatch(db, b);
      const view = batchView(b, r);
      await record(db, {
        person: s.email,
        site: body.site,
        act: "batch_booked_in",
        object_kind: "batch",
        object_reference: reference,
        event_at: body.received_on,
        effective_on: body.received_on,
        detail: { collector: body.collector, category: body.category, net_g: body.net_g, dry_mass_g: r.dry_mass_g, device: body.device, calibration_valid: !r.flags.includes("lapsed_calibration") }
      });
      await rememberIdempotent(c, 201, { reference });
      return c.json({ reference, ...view }, 201);
    });
    referenceRoutes.patch("/batches/:reference", async (c) => {
      const s = await requireRole(c, ["plant_operator", "quality_manager"]);
      const body = await readJson(c);
      const ref = c.req.param("reference");
      const b = (await db.query("SELECT * FROM batches WHERE reference=$1", [ref])).rows[0];
      if (!b) deny("batch_not_found", "No such batch.", 404);
      if (body.category !== void 0 && body.category !== b.category) {
        await record(db, { person: s.email, site: b.site, act: "refused_batch_category_change", object_kind: "batch", object_reference: ref, detail: { attempted_category: body.category } });
        return c.json({ error: "category_immutable", message: "A batch category cannot be changed after acceptance, by any role, through any route." }, 409);
      }
      const allowed = ["gross_g", "tare_g", "net_g", "moisture_bp", "moisture_method", "contamination"];
      for (const k of Object.keys(body)) if (!allowed.includes(k)) deny("field_not_writable", `${k} is not writable on a batch after acceptance.`, 409);
      return c.json({ reference: ref, ok: true });
    });
    referenceRoutes.post("/batches/:reference/custody", async (c) => {
      const s = await requireRole(c, ["plant_operator"]);
      const body = await readJson(c);
      requireFields(body, ["kind", "arrived_on", "party"]);
      const ref = c.req.param("reference");
      const b = (await db.query("SELECT * FROM batches WHERE reference=$1", [ref])).rows[0];
      if (!b) deny("batch_not_found", "No such batch.", 404);
      const custody = [...b.custody, { kind: body.kind, on: body.arrived_on, party: body.party, late_document: true }];
      await db.query("UPDATE batches SET custody=$1, claimable_from=$2 WHERE reference=$3", [JSON.stringify(custody), body.arrived_on, ref]);
      await record(db, { person: s.email, site: b.site, act: "custody_late_document_attached", object_kind: "batch", object_reference: ref, effective_on: body.arrived_on, detail: { kind: body.kind, arrived_on: body.arrived_on } });
      const updated = (await db.query("SELECT * FROM batches WHERE reference=$1", [ref])).rows[0];
      const r = await resolveBatch(db, updated);
      return c.json({ reference: ref, claimable_from: body.arrived_on, custody_complete: r.custody_complete }, 201);
    });
    referenceRoutes.post("/batches/:reference/reject", async (c) => {
      const s = await requireRole(c, ["plant_operator"]);
      const body = await readJson(c);
      requireFields(body, ["rejected_g", "reason", "destination"]);
      const ref = c.req.param("reference");
      const b = (await db.query("SELECT * FROM batches WHERE reference=$1", [ref])).rows[0];
      if (!b) deny("batch_not_found", "No such batch.", 404);
      if (Number(b.accepted_g) + Number(body.rejected_g) !== Number(b.net_g)) {
        deny("rejection_does_not_sum", `accepted_g plus rejected_g must equal delivered net_g (${b.net_g}).`, 409);
      }
      await db.query(
        "UPDATE batches SET accepted_g=$1, rejected_g=$2, rejected_destination=$3, reject_reason=$4 WHERE reference=$5",
        [Number(b.net_g) - Number(body.rejected_g), body.rejected_g, body.destination, body.reason, ref]
      );
      await record(db, { person: s.email, site: b.site, act: "batch_rejected", object_kind: "batch", object_reference: ref, detail: { rejected_g: body.rejected_g, reason: body.reason, destination: body.destination } });
      return c.json({ reference: ref, accepted_g: Number(b.net_g) - Number(body.rejected_g), rejected_g: body.rejected_g, rejected_destination: body.destination }, 201);
    });
    referenceRoutes.get("/batches/:reference/impact", async (c) => {
      await requireSession(c);
      noPaginationShared(c);
      const started = Date.now();
      const result = await batchImpact(db, c.req.param("reference"));
      if (Date.now() - started > 5e3) deny("traversal_timeout", "The traversal took longer than five seconds.", 504);
      return c.json(result);
    });
    referenceRoutes.get("/runs", async (c) => {
      const s = await requireSession(c);
      noPaginationShared(c);
      const rows = (await db.query("SELECT * FROM runs ORDER BY started_at")).rows;
      const out = [];
      for (const r of rows) {
        const cons = (await db.query("SELECT * FROM consumptions WHERE run=$1 ORDER BY id", [r.reference])).rows;
        const outs = (await db.query("SELECT * FROM outputs WHERE run=$1 ORDER BY reference", [r.reference])).rows;
        const massIn = cons.reduce((a, x) => a + Number(x.mass_g), 0);
        const massOut = outs.reduce((a, x) => a + Number(x.mass_g), 0);
        out.push({
          reference: r.reference,
          run_type: r.run_type,
          site: r.site,
          equipment: r.equipment,
          recipe_version: r.recipe_version,
          operator: r.operator,
          started_at: r.started_at,
          closed_at: r.closed_at,
          losses_g: r.losses_g === null ? null : Number(r.losses_g),
          mass_in_g: massIn,
          mass_out_g: massOut,
          consumptions: cons.map((x) => ({ input: x.input_reference, kind: x.input_kind, mass_g: Number(x.mass_g) })),
          outputs: outs.map((x) => ({ reference: x.reference, kind: x.kind, mass_g: Number(x.mass_g), lot: x.lot, disposition: x.disposition })),
          actual_setpoints: r.actual_setpoints,
          within_tolerance: r.within_tolerance,
          open: r.closed_at === null,
          derivation: { losses_g: "mass in minus mass out, computed at close" }
        });
      }
      return c.json(out);
    });
    referenceRoutes.get("/runs/:reference", async (c) => {
      await requireSession(c);
      const r = (await db.query("SELECT * FROM runs WHERE reference=$1", [c.req.param("reference")])).rows[0];
      if (!r) deny("run_not_found", "No such run.", 404);
      const cons = (await db.query("SELECT * FROM consumptions WHERE run=$1 ORDER BY id", [r.reference])).rows;
      const outs = (await db.query("SELECT * FROM outputs WHERE run=$1 ORDER BY reference", [r.reference])).rows;
      return c.json({
        reference: r.reference,
        run_type: r.run_type,
        site: r.site,
        equipment: r.equipment,
        recipe_version: r.recipe_version,
        recipe: recipeFor(r.recipe_version),
        operator: r.operator,
        started_at: r.started_at,
        closed_at: r.closed_at,
        actual_setpoints: r.actual_setpoints,
        within_tolerance: r.within_tolerance,
        mass_in_g: cons.reduce((a, x) => a + Number(x.mass_g), 0),
        mass_out_g: outs.reduce((a, x) => a + Number(x.mass_g), 0),
        losses_g: r.losses_g === null ? null : Number(r.losses_g),
        consumptions: cons,
        outputs: outs
      });
    });
    referenceRoutes.post("/runs", async (c) => {
      const s = await requireRole(c, ["plant_operator"]);
      const body = await readJson(c);
      requireFields(body, ["run_type", "site", "equipment", "recipe_version", "operator", "started_at"]);
      if (!["dissolution", "depolymerisation", "purification", "repolymerisation"].includes(body.run_type)) deny("invalid_run_type", "run_type must be one of the four stages.", 400);
      await requireSite(c, body.site);
      if (body.recipe_version && recipeFor(body.recipe_version) === null && !/^RCP-/.test(body.recipe_version)) deny("invalid_recipe_version", "Unknown recipe version.", 400);
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM runs")).rows[0].n;
      const letter = { dissolution: "D", depolymerisation: "Y", purification: "U", repolymerisation: "R" }[body.run_type];
      const reference = `RUN-${letter}-${String(n).padStart(4, "0")}`;
      await db.query(
        `INSERT INTO runs (reference,run_type,site,equipment,recipe_version,operator,started_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [reference, body.run_type, body.site, body.equipment, body.recipe_version, body.operator || s.email, body.started_at]
      );
      await record(db, { person: s.email, site: body.site, act: "run_started", object_kind: "run", object_reference: reference, event_at: body.started_at, detail: { run_type: body.run_type, recipe_version: body.recipe_version, equipment: body.equipment } });
      await rememberIdempotent(c, 201, { reference });
      return c.json({ reference }, 201);
    });
    referenceRoutes.post("/runs/:reference/consumptions", async (c) => {
      const s = await requireRole(c, ["plant_operator"]);
      const body = await readJson(c);
      requireFields(body, ["input", "mass_g"]);
      requireInteger(body, "mass_g");
      const ref = c.req.param("reference");
      const run = (await db.query("SELECT * FROM runs WHERE reference=$1", [ref])).rows[0];
      if (!run) deny("run_not_found", "No such run.", 404);
      if (run.closed_at) deny("run_closed", "A closed run refuses every write.", 409);
      const input = body.input;
      let kind = "batch", batch = input;
      if (input.startsWith("OUT-")) kind = "intermediate";
      if (input.startsWith("LOT-")) kind = "lot";
      if (kind === "batch") {
        const b = (await db.query("SELECT * FROM batches WHERE reference=$1", [input])).rows[0];
        if (!b) deny("batch_not_found", "No such batch.", 404);
      }
      const effectiveOn = body.effective_on || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const period = (await db.query(
        `SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 AND $3 BETWEEN period_from AND period_to`,
        [run.site, "N6", effectiveOn]
      )).rows[0];
      if (kind === "batch") {
        const b = (await db.query("SELECT * FROM batches WHERE reference=$1", [input])).rows[0];
        const approval = await approvalInForce(db, b.collector, b.received_on);
        const kinds = new Set(b.custody.map((x) => x.kind));
        const required = ["collection_site", "collector", "transport", "arrival", "weighing", "acceptance"];
        const custodyComplete = required.every((k) => kinds.has(k));
        const claimable = !!approval && ["approved", "conditional"].includes(approval.state) && custodyComplete;
        if (period && period.state === "closed") {
          const rref = await openRestatement(db, period.id, `Consumption of ${input} effective ${effectiveOn} falls in a closed period.`, s.email);
          await record(db, { person: s.email, site: run.site, act: "consumption_refused_period_closed", object_kind: "run", object_reference: ref, detail: { input, effective_on: effectiveOn, restatement: rref } });
          return c.json({ error: "period_closed", message: "This effective date falls in a closed period; a restatement has been opened.", restatement: rref }, 409);
        }
        if (period) {
          const dm = dryMass(b.net_g, b.moisture_bp);
          const factor = (await db.query("SELECT * FROM conversion_factors WHERE site=$1 AND superseded_by IS NULL ORDER BY published_on DESC LIMIT 1", [run.site])).rows[0];
          if (claimable && factor) {
            const dryConsumed = Math.floor(dm * Number(body.mass_g) / Number(b.net_g));
            const credit = Math.floor(dryConsumed * factor.factor_bp / 1e4);
            if (credit > 0) {
              const mref = "CRM-" + String((await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM credit_movements")).rows[0].n).padStart(4, "0");
              await db.query(
                `INSERT INTO credit_movements (reference,period,category,direction,mass_g,reason,effective_on) VALUES ($1,$2,$3,'in',$4,$5,$6)`,
                [mref, period.id, b.category, credit, `Credit granted at consumption of ${input} by ${ref} (dry mass ${dryConsumed} g at ${factor.factor_bp} bp).`, effectiveOn]
              );
            }
          }
        }
      }
      const id = await db.query(
        `INSERT INTO consumptions (run,batch,input_reference,input_kind,mass_g,effective_on) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ref, kind === "batch" ? input : null, input, kind, body.mass_g, effectiveOn]
      );
      await record(db, { person: s.email, site: run.site, act: "consumption_recorded", object_kind: "run", object_reference: ref, detail: { input, mass_g: body.mass_g, effective_on: effectiveOn } });
      return c.json({ reference: "CNS-" + String(id.rows[0].id).padStart(4, "0"), run: ref, input, mass_g: body.mass_g, effective_on: effectiveOn }, 201);
    });
    referenceRoutes.post("/runs/:reference/outputs", async (c) => {
      const s = await requireRole(c, ["plant_operator"]);
      const body = await readJson(c);
      requireFields(body, ["mass_g", "kind"]);
      requireInteger(body, "mass_g");
      const ref = c.req.param("reference");
      const run = (await db.query("SELECT * FROM runs WHERE reference=$1", [ref])).rows[0];
      if (!run) deny("run_not_found", "No such run.", 404);
      if (run.closed_at) deny("run_closed", "A closed run refuses every write.", 409);
      if (!["intermediate", "lot", "byproduct"].includes(body.kind)) deny("invalid_kind", "kind is one of intermediate, lot, byproduct.", 400);
      if (body.kind === "byproduct" && !["sold", "disposed"].includes(body.disposition)) {
        deny("byproduct_disposition_required", "A byproduct carries disposition in sold, disposed.", 400);
      }
      const prefix = run.run_type === "dissolution" ? "OUT-D" : run.run_type === "depolymerisation" ? "OUT-Y" : run.run_type === "purification" ? "OUT-U" : "OUT-R";
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM outputs")).rows[0].n;
      const oref = `${prefix}-${String(n).padStart(4, "0")}`;
      let lotRef = null;
      if (body.kind === "lot") {
        const ln = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM lots")).rows[0].n;
        lotRef = body.lot_reference || `LOT-${body.grade || "N6"}-${String(ln).padStart(4, "0")}`;
        await db.query(
          `INSERT INTO lots (reference,grade,site,run,mass_g,disposition,claim_type) VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
          [lotRef, body.grade || "N6", run.site, ref, body.mass_g, body.claim_type || "mass_balance"]
        );
      }
      await db.query(
        `INSERT INTO outputs (reference,run,kind,mass_g,disposition,lot) VALUES ($1,$2,$3,$4,$5,$6)`,
        [oref, ref, body.kind, body.mass_g, body.disposition || null, lotRef]
      );
      await record(db, { person: s.email, site: run.site, act: "output_recorded", object_kind: "run", object_reference: ref, detail: { output: oref, kind: body.kind, mass_g: body.mass_g, lot: lotRef } });
      await rememberIdempotent(c, 201, { reference: oref, lot: lotRef });
      return c.json({ reference: oref, kind: body.kind, mass_g: body.mass_g, lot: lotRef }, 201);
    });
    referenceRoutes.post("/runs/:reference/close", async (c) => {
      const s = await requireRole(c, ["plant_operator"]);
      const ref = c.req.param("reference");
      const run = (await db.query("SELECT * FROM runs WHERE reference=$1", [ref])).rows[0];
      if (!run) deny("run_not_found", "No such run.", 404);
      if (run.closed_at) {
        await record(db, { person: s.email, site: run.site, act: "run_second_close_attempted", object_kind: "run", object_reference: ref, detail: { closed_at: run.closed_at } });
        return c.json({ error: "already_closed", message: "This run is closed; a second close is refused and recorded as an attempt." }, 409);
      }
      const cons = (await db.query("SELECT * FROM consumptions WHERE run=$1", [ref])).rows;
      const outs = (await db.query("SELECT * FROM outputs WHERE run=$1", [ref])).rows;
      const massIn = cons.reduce((a, x) => a + Number(x.mass_g), 0);
      const massOut = outs.reduce((a, x) => a + Number(x.mass_g), 0);
      const losses = massIn - massOut;
      const recipe = recipeFor(run.recipe_version);
      const actual = run.actual_setpoints || body_setpoints(await readJson(c).catch(() => ({})));
      let within = null;
      if (recipe && actual && Object.keys(recipe.set_points).length) {
        within = Object.keys(recipe.set_points).every((k) => {
          const sp = recipe.set_points[k], a = actual[k];
          return a === void 0 || a >= sp.min && a <= sp.max;
        });
      }
      await db.query(
        "UPDATE runs SET closed_at=now(), losses_g=$1, actual_setpoints=$2, within_tolerance=$3 WHERE reference=$4",
        [losses, actual ? JSON.stringify(actual) : null, within, ref]
      );
      if (within === false) {
        const dn = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM deviations")).rows[0].n;
        const dref = "DEV-" + String(dn).padStart(4, "0");
        await db.query(`INSERT INTO deviations (reference,state,raised_by,reason) VALUES ($1,'open',$2,$3)`, [dref, s.email, `Run ${ref} recorded set points outside the tolerance of ${run.recipe_version}.`]);
        await db.query(`INSERT INTO deviation_subjects (deviation,subject_kind,subject) VALUES ($1,'run',$2)`, [dref, ref]);
      }
      await record(db, { person: s.email, site: run.site, act: "run_closed", object_kind: "run", object_reference: ref, detail: { mass_in_g: massIn, mass_out_g: massOut, losses_g: losses, within_tolerance: within } });
      await rememberIdempotent(c, 200, { reference: ref, losses_g: losses });
      return c.json({ reference: ref, mass_in_g: massIn, mass_out_g: massOut, losses_g: losses, within_tolerance: within });
    });
    referenceRoutes.post("/runs/:reference/annotate", async (c) => {
      const s = await requireRole(c, ["plant_operator"]);
      const body = await readJson(c);
      requireFields(body, ["annotation"]);
      const ref = c.req.param("reference");
      const run = (await db.query("SELECT * FROM runs WHERE reference=$1", [ref])).rows[0];
      if (!run) deny("run_not_found", "No such run.", 404);
      await db.query("UPDATE runs SET annotation=$1, annotated_by=$2 WHERE reference=$3", [body.annotation, s.email, ref]);
      await record(db, { person: s.email, site: run.site, act: "run_annotated", object_kind: "run", object_reference: ref, detail: { annotation: body.annotation } });
      return c.json({ reference: ref, annotation: body.annotation, annotated_by: s.email }, 201);
    });
    referenceRoutes.get("/lots", async (c) => {
      await requireSession(c);
      noPaginationShared(c);
      const rows = (await db.query("SELECT * FROM lots ORDER BY reference")).rows;
      const out = [];
      for (const l of rows) {
        const attached = (await db.query(
          `SELECT category, COALESCE(SUM(mass_g),0) AS g FROM credit_movements WHERE lot=$1 AND direction='out' GROUP BY category`,
          [l.reference]
        )).rows;
        const attachedByCat = {};
        for (const a of attached) attachedByCat[a.category] = Number(a.g);
        const totalAttached = Object.values(attachedByCat).reduce((a, b) => a + b, 0);
        out.push({
          reference: l.reference,
          grade: l.grade,
          site: l.site,
          run: l.run,
          mass_g: Number(l.mass_g),
          disposition: l.disposition,
          claim_type: l.claim_type,
          credit_attached_g: attachedByCat,
          content_bp: Math.floor(totalAttached * 1e4 / Number(l.mass_g)),
          blended_from: l.blended_from,
          derivation: { content_bp: "credit_attached_g * 10000 / lot_mass_g, floored" }
        });
      }
      return c.json(out);
    });
    referenceRoutes.get("/lots/:reference", async (c) => {
      await requireSession(c);
      const l = (await db.query("SELECT * FROM lots WHERE reference=$1", [c.req.param("reference")])).rows[0];
      if (!l) deny("lot_not_found", "No such lot.", 404);
      const attached = (await db.query(
        `SELECT category, COALESCE(SUM(mass_g),0) AS g FROM credit_movements WHERE lot=$1 AND direction='out' GROUP BY category`,
        [l.reference]
      )).rows;
      const attachedByCat = {};
      for (const a of attached) attachedByCat[a.category] = Number(a.g);
      const totalAttached = Object.values(attachedByCat).reduce((a, b) => a + b, 0);
      const tests = (await db.query("SELECT * FROM test_results WHERE subject=$1 ORDER BY recorded_at", [l.reference])).rows;
      const devs = (await db.query(
        `SELECT d.* FROM deviations d JOIN deviation_subjects ds ON ds.deviation=d.reference WHERE ds.subject=$1 AND ds.subject_kind='lot'`,
        [l.reference]
      )).rows;
      const ovr = (await db.query("SELECT * FROM overrides WHERE lot=$1 ORDER BY authorised_on", [l.reference])).rows;
      const flags = [];
      if (devs.some((d) => d.state === "open")) flags.push("open_deviation");
      if (ovr.some((o) => !o.reviewed)) flags.push("unreviewed_override");
      return c.json({
        reference: l.reference,
        grade: l.grade,
        site: l.site,
        run: l.run,
        mass_g: Number(l.mass_g),
        disposition: l.disposition,
        claim_type: l.claim_type,
        credit_attached_g: attachedByCat,
        content_bp: Math.floor(totalAttached * 1e4 / Number(l.mass_g)),
        claim_type_and_content_bp: { claim_type: l.claim_type, content_bp: Math.floor(totalAttached * 1e4 / Number(l.mass_g)) },
        test_results: tests,
        deviations: devs,
        overrides: ovr,
        flags,
        blended_from: l.blended_from
      });
    });
    referenceRoutes.get("/lots/:reference/genealogy", async (c) => {
      await requireSession(c);
      noPaginationShared(c);
      const g = await upstreamGraph(db, c.req.param("reference"));
      return c.json(g);
    });
    referenceRoutes.get("/lots/:reference/yield", async (c) => {
      const s = await requireSession(c);
      if (!["plant_operator", "lab_analyst", "quality_manager", "claims_manager"].includes(s.role)) {
        deny("yield_not_for_this_role", "A yield figure answers for plant operations, quality and the claims manager.", 403);
      }
      const l = (await db.query("SELECT * FROM lots WHERE reference=$1", [c.req.param("reference")])).rows[0];
      if (!l) deny("lot_not_found", "No such lot.", 404);
      const cons = (await db.query("SELECT * FROM consumptions WHERE run=$1", [l.run])).rows;
      const massIn = cons.reduce((a, x) => a + Number(x.mass_g), 0);
      const outs = (await db.query("SELECT * FROM outputs WHERE run=$1", [l.run])).rows;
      const massOut = outs.reduce((a, x) => a + Number(x.mass_g), 0);
      const lotsMass = outs.filter((o) => o.kind === "lot").reduce((a, x) => a + Number(x.mass_g), 0);
      return c.json({
        lot: l.reference,
        run: l.run,
        mass_in_g: massIn,
        mass_out_g: massOut,
        lot_mass_of_run_g: lotsMass,
        yield_bp: massIn === 0 ? 0 : Math.floor(Number(l.mass_g) * 1e4 / massIn),
        derivation: "lot mass * 10000 / run mass in, floored",
        note: "A yield figure appears on no certificate and in no verification answer."
      });
    });
    referenceRoutes.post("/lots/:reference/blend", async (c) => {
      const s = await requireRole(c, ["plant_operator"]);
      const body = await readJson(c);
      requireFields(body, ["lot_b"]);
      const lotARef = c.req.param("reference");
      const a = (await db.query("SELECT * FROM lots WHERE reference=$1", [lotARef])).rows[0];
      const b = (await db.query("SELECT * FROM lots WHERE reference=$1", [body.lot_b])).rows[0];
      if (!a || !b) deny("lot_not_found", "No such lot.", 404);
      const content = async (l) => {
        const rows = (await db.query(`SELECT COALESCE(SUM(mass_g),0) AS g FROM credit_movements WHERE lot=$1 AND direction='out'`, [l.reference])).rows;
        return Math.floor(Number(rows[0].g) * 1e4 / Number(l.mass_g));
      };
      const contentA = await content(a);
      const contentB = await content(b);
      const massA = Number(a.mass_g), massB = Number(b.mass_g);
      const blended = Math.floor((massA * contentA + massB * contentB) / (massA + massB));
      const weakerClaim = [a.claim_type, b.claim_type].sort().indexOf("mass_balance") >= 0 ? "mass_balance" : a.claim_type === b.claim_type ? a.claim_type : "controlled_blending";
      const sites = a.site === b.site ? [a.site] : [a.site, b.site];
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM lots")).rows[0].n;
      const ref = `LOT-${a.grade}-${String(n).padStart(4, "0")}`;
      const sitesFlag = sites.length > 1;
      await db.query(
        `INSERT INTO lots (reference,grade,site,run,mass_g,disposition,claim_type,blended_from)
     VALUES ($1,$2,$3,NULL,$4,'pending',$5,$6)`,
        [ref, a.grade, sites[0], massA + massB, weakerClaim, JSON.stringify([{ reference: a.reference, mass_g: massA }, { reference: b.reference, mass_g: massB }])]
      );
      await record(db, { person: s.email, site: sites[0], act: "lot_blended", object_kind: "lot", object_reference: ref, detail: { from: [a.reference, b.reference], mass_g: massA + massB, content_bp: blended, sites } });
      return c.json({
        reference: ref,
        mass_g: massA + massB,
        claim_type: weakerClaim,
        content_bp: blended,
        derivation: { content_bp: `(${massA} * ${contentA} + ${massB} * ${contentB}) / (${massA} + ${massB}), floored` },
        sites,
        both_sites_named: sitesFlag,
        weaker_claim_type: weakerClaim
      }, 201);
    });
    referenceRoutes.post("/test-results", async (c) => {
      const s = await requireRole(c, ["lab_analyst"]);
      const body = await readJson(c);
      requireFields(body, ["subject", "property", "method", "instrument", "value", "unit", "uncertainty_bp"]);
      requireInteger(body, "uncertainty_bp");
      const spec = (await db.query(
        `SELECT * FROM specifications WHERE grade=(SELECT grade FROM lots WHERE reference=$1) ORDER BY version DESC LIMIT 1`,
        [body.subject]
      )).rows[0];
      const namedMethod = spec ? spec.rows.find((r) => r.property === body.property)?.method : null;
      const mismatch = namedMethod ? namedMethod !== body.method : false;
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM test_results")).rows[0].n;
      const ref = "TR-" + String(n).padStart(4, "0");
      await db.query(
        `INSERT INTO test_results (reference,subject_kind,subject,property,method,instrument,analyst,value,unit,uncertainty_bp,method_mismatch,usable_for_release)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [ref, body.subject.startsWith("BATCH-") ? "batch" : "lot", body.subject, body.property, body.method, body.instrument, s.email, String(body.value), body.unit, body.uncertainty_bp, mismatch, !mismatch]
      );
      await record(db, { person: s.email, act: "test_result_recorded", object_kind: "test_result", object_reference: ref, detail: { subject: body.subject, property: body.property, method: body.method, method_mismatch: mismatch } });
      await rememberIdempotent(c, 201, { reference: ref });
      return c.json({ reference: ref, method_mismatch: mismatch, usable_for_release: !mismatch }, 201);
    });
    referenceRoutes.post("/lots/:reference/disposition", async (c) => {
      const s = await requireRole(c, ["quality_manager"]);
      const body = await readJson(c);
      requireFields(body, ["disposition"]);
      if (!["pending", "released", "quarantined", "rejected"].includes(body.disposition)) deny("invalid_disposition", "disposition is one of pending, released, quarantined, rejected.", 400);
      const ref = c.req.param("reference");
      const l = (await db.query("SELECT * FROM lots WHERE reference=$1", [ref])).rows[0];
      if (!l) deny("lot_not_found", "No such lot.", 404);
      const entered = (await db.query("SELECT 1 FROM test_results WHERE analyst=$1 AND subject=$2", [s.email, ref])).rows[0];
      if (entered) {
        await record(db, { person: s.email, site: l.site, act: "refused_disposition_separation", object_kind: "lot", object_reference: ref, detail: { separation: "analyst_not_dispositioner" } });
        deny("separation_refused", "Whoever entered a test result on this lot does not disposition it.", 403);
      }
      const openDev = (await db.query(
        `SELECT d.reference FROM deviations d JOIN deviation_subjects ds ON ds.deviation=d.reference
     WHERE d.state='open' AND ((ds.subject_kind='lot' AND ds.subject=$1) OR (ds.subject_kind='run' AND ds.subject=$2)) LIMIT 1`,
        [ref, l.run]
      )).rows[0];
      if (openDev) {
        await record(db, { person: s.email, site: l.site, act: "refused_disposition_open_deviation", object_kind: "lot", object_reference: ref, detail: { deviation: openDev.reference } });
        deny("open_deviation", `Deviation ${openDev.reference} touching this lot is open.`, 409);
      }
      await db.query("UPDATE lots SET disposition=$1 WHERE reference=$2", [body.disposition, ref]);
      await record(db, { person: s.email, site: l.site, act: "disposition_set", object_kind: "lot", object_reference: ref, detail: { disposition: body.disposition } });
      await rememberIdempotent(c, 200, { reference: ref, disposition: body.disposition });
      return c.json({ reference: ref, disposition: body.disposition });
    });
    referenceRoutes.post("/deviations", async (c) => {
      const s = await requireRole(c, ["quality_manager"]);
      const body = await readJson(c);
      requireFields(body, ["reason", "subjects"]);
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM deviations")).rows[0].n;
      const ref = "DEV-" + String(n).padStart(4, "0");
      await db.query(`INSERT INTO deviations (reference,state,raised_by,reason) VALUES ($1,'open',$2,$3)`, [ref, s.email, body.reason]);
      for (const sub of body.subjects) {
        await db.query(
          `INSERT INTO deviation_subjects (deviation,subject_kind,subject) VALUES ($1,$2,$3)`,
          [ref, sub.startsWith("RUN-") ? "run" : "lot", sub]
        );
      }
      await record(db, { person: s.email, act: "deviation_raised", object_kind: "deviation", object_reference: ref, detail: { reason: body.reason, subjects: body.subjects } });
      await rememberIdempotent(c, 201, { reference: ref });
      return c.json({ reference: ref, state: "open", subjects: body.subjects }, 201);
    });
    referenceRoutes.post("/deviations/:reference/close", async (c) => {
      const s = await requireRole(c, ["quality_manager"]);
      const body = await readJson(c);
      requireFields(body, ["outcome"]);
      if (!["root_cause_found", "cause_not_established"].includes(body.outcome)) deny("invalid_outcome", "outcome is root_cause_found or cause_not_established.", 400);
      const ref = c.req.param("reference");
      const d = (await db.query("SELECT * FROM deviations WHERE reference=$1", [ref])).rows[0];
      if (!d) deny("deviation_not_found", "No such deviation.", 404);
      if (d.state === "closed") deny("already_closed", "This deviation is closed.", 409);
      await db.query("UPDATE deviations SET state=$1, outcome=$2, closed_at=now() WHERE reference=$3", ["closed", body.outcome, ref]);
      await record(db, { person: s.email, act: "deviation_closed", object_kind: "deviation", object_reference: ref, detail: { outcome: body.outcome } });
      return c.json({ reference: ref, state: "closed", outcome: body.outcome });
    });
    referenceRoutes.post("/overrides", async (c) => {
      const s = await requireRole(c, ["quality_manager", "claims_manager"]);
      const body = await readJson(c);
      requireFields(body, ["separation", "reason", "lot", "authorised_by"]);
      if (!body.separation || !["analyst_not_dispositioner", "method_publisher_not_closer", "signer_not_data_enterer", "booker_not_approver"].includes(body.separation)) {
        deny("invalid_separation", "separation names the separation broken.", 400);
      }
      if (typeof body.reason !== "string" || body.reason.trim().length < 40) deny("reason_too_short", "A reason of at least forty characters is required.", 400);
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM overrides")).rows[0].n;
      const ref = "OVR-" + String(n).padStart(4, "0");
      await db.query(
        `INSERT INTO overrides (reference,separation,reason,lot,authorised_by,authorised_on) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)`,
        [ref, body.separation, body.reason, body.lot, body.authorised_by]
      );
      await record(db, { person: s.email, act: "override_recorded", object_kind: "override", object_reference: ref, detail: { separation: body.separation, lot: body.lot, authorised_by: body.authorised_by } });
      await rememberIdempotent(c, 201, { reference: ref });
      return c.json({ reference: ref, separation: body.separation, lot: body.lot, reviewed: false, blocking_signing: true }, 201);
    });
    referenceRoutes.post("/overrides/:reference/review", async (c) => {
      const s = await requireRole(c, ["quality_manager", "claims_manager"]);
      const ref = c.req.param("reference");
      const o = (await db.query("SELECT * FROM overrides WHERE reference=$1", [ref])).rows[0];
      if (!o) deny("override_not_found", "No such override.", 404);
      if (o.authorised_by === s.email) deny("authoriser_may_not_review", "A review is refused for the authoriser.", 403);
      await db.query("UPDATE overrides SET reviewed=true, reviewed_by=$1, reviewed_on=CURRENT_DATE WHERE reference=$2", [s.email, ref]);
      await record(db, { person: s.email, act: "override_reviewed", object_kind: "override", object_reference: ref, detail: { reviewed_by: s.email } });
      return c.json({ reference: ref, reviewed: true, reviewed_by: s.email, reviewed_on: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) });
    });
    referenceRoutes.get("/deviations", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM deviations ORDER BY opened_at")).rows;
      const out = [];
      for (const d of rows) {
        const subs = (await db.query("SELECT * FROM deviation_subjects WHERE deviation=$1", [d.reference])).rows;
        out.push({ reference: d.reference, state: d.state, raised_by: d.raised_by, reason: d.reason, outcome: d.outcome, opened_at: d.opened_at, closed_at: d.closed_at, subjects: subs.map((x) => ({ kind: x.subject_kind, reference: x.subject })) });
      }
      return c.json(out);
    });
    referenceRoutes.get("/overrides", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM overrides ORDER BY authorised_on")).rows;
      return c.json(rows.map((o) => ({ reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot, authorised_by: o.authorised_by, authorised_on: o.authorised_on, reviewed: o.reviewed, reviewed_by: o.reviewed_by, reviewed_on: o.reviewed_on })));
    });
  }
});

// server/routes/intake.ts
var intakeRoutes;
var init_intake = __esm({
  "server/routes/intake.ts"() {
    init_dist2();
    intakeRoutes = new Hono2();
    intakeRoutes.use("*", async (c, next) => {
      return next();
    });
  }
});

// server/engine/ledger.ts
async function periodBalance(db2, periodId) {
  const p = (await db2.query("SELECT * FROM balance_periods WHERE id=$1", [periodId])).rows[0];
  if (!p) return null;
  const movements = (await db2.query("SELECT * FROM credit_movements WHERE period=$1 ORDER BY recorded_at, reference", [periodId])).rows;
  const cat = (category) => {
    const rows = movements.filter((m) => m.category === category && !m.movement);
    const ins = rows.filter((m) => m.direction === "in");
    const outs = rows.filter((m) => m.direction === "out");
    return {
      credits_in_g: sum(ins.map((m) => Number(m.mass_g))),
      credits_out_g: sum(outs.map((m) => Number(m.mass_g))),
      credits_available_g: sum(ins.map((m) => Number(m.mass_g))) - sum(outs.map((m) => Number(m.mass_g))),
      derivation: { movements: rows.map((m) => m.reference) }
    };
  };
  const nonClaimable = await db2.query(
    `SELECT COALESCE(SUM(c.mass_g),0) AS g FROM consumptions c
     JOIN batches b ON b.reference=c.batch
     WHERE c.effective_on BETWEEN $1 AND $2
       AND NOT EXISTS (
         SELECT 1 FROM approval_periods ap
         WHERE ap.collector=b.collector AND ap.state IN ('approved','conditional')
           AND b.received_on BETWEEN ap.valid_from AND ap.valid_to)`,
    [p.period_from, p.period_to]
  );
  const overrides = await db2.query(
    `SELECT COUNT(*)::int AS n FROM overrides o JOIN lots l ON l.reference=o.lot
     WHERE l.site=$1 AND o.authorised_on BETWEEN $2 AND $3`,
    [p.site, p.period_from, p.period_to]
  );
  const restatements = await db2.query(
    `SELECT COUNT(*)::int AS n FROM restatements WHERE period=$1 AND state='open'`,
    [periodId]
  );
  const findings = await db2.query(
    `SELECT COUNT(*)::int AS n FROM findings WHERE state='open' AND opened_on BETWEEN $1 AND $2`,
    [p.period_from, p.period_to]
  );
  const factors = await db2.query(
    `SELECT * FROM conversion_factors WHERE site=$1 AND superseded_by IS NULL ORDER BY published_on DESC`,
    [p.site]
  );
  const view = {
    id: p.id,
    site: p.site,
    grade: p.grade,
    period: { from: p.period_from, to: p.period_to },
    state: p.state,
    allocation_basis: p.allocation_basis,
    post_consumer: cat("post_consumer"),
    pre_consumer: cat("pre_consumer"),
    non_claimable_input_g: { value: Number(nonClaimable.rows[0].g), derivation: ["consumptions of batches with no approval in force on receipt"] },
    inbound_credits: movements.filter((m) => m.movement && m.direction === "in").map((m) => ({
      reference: m.reference,
      mass_g: Number(m.mass_g),
      origin_site: m.origin_site,
      movement: m.movement,
      category: m.category,
      fresh_credit: false
    })),
    transfers_out: movements.filter((m) => m.movement && m.direction === "out").map((m) => ({
      reference: m.reference,
      mass_g: Number(m.mass_g),
      movement: m.movement,
      category: m.category
    })),
    conversion_factors: factors.rows.map((f) => ({
      reference: f.reference,
      factor_bp: f.factor_bp,
      derived_from: f.derived_from,
      derived_to: f.derived_to,
      derived_in_g: Number(f.derived_in_g),
      derived_out_g: Number(f.derived_out_g),
      provisional: f.provisional,
      derivation_window: f.derived_from ? { from: f.derived_from, to: f.derived_to } : null
    })),
    carry_over_limit_bp: p.carry_over_limit_bp,
    override_count: { value: overrides.rows[0].n, derivation: ["overrides authorised inside the period on lots of this site"] },
    open_restatement_count: { value: restatements.rows[0].n, derivation: ["restatements open against this period"] },
    open_finding_count: { value: findings.rows[0].n, derivation: ["collector findings opened inside the period"] },
    closed_on: p.closed_on,
    cut_off: p.cut_off,
    read_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (p.state === "closed") {
    const limit = p.carry_over_limit_bp;
    const carry = (c) => ({
      carried_forward_g: Math.min(c.credits_available_g, Math.floor(c.credits_in_g * limit / 1e4)),
      expired_g: Math.max(0, c.credits_available_g - Math.floor(c.credits_in_g * limit / 1e4))
    });
    view.carry_over = {
      post_consumer: carry(view.post_consumer),
      pre_consumer: carry(view.pre_consumer)
    };
  }
  return view;
}
async function tryTransferOut(db2, fromPeriod, toPeriod, category, massG, who) {
  const client = await db2.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["alloc:" + fromPeriod + ":" + category]);
    const p = (await client.query("SELECT * FROM balance_periods WHERE id=$1 FOR UPDATE", [fromPeriod])).rows[0];
    if (!p) throw Object.assign(new Error("period_not_found"), { status: 404 });
    if (p.state === "closed") throw Object.assign(new Error("period_closed"), { status: 409, code: "period_closed" });
    const movements = (await client.query("SELECT * FROM credit_movements WHERE period=$1 AND category=$2 AND movement IS NULL", [fromPeriod, category])).rows;
    const avail = movements.reduce((a, m) => a + (m.direction === "in" ? Number(m.mass_g) : -Number(m.mass_g)), 0);
    if (massG > avail) {
      await client.query("COMMIT");
      return { ok: false, available_g: avail, requested_g: massG };
    }
    const tref = "TRF-" + String(Number((await client.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),'')::bigint,0)+1 AS n FROM transfers")).rows[0].n)).padStart(4, "0");
    await client.query(
      `INSERT INTO transfers (reference,from_period,to_period,mass_g,category,moved_on) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)`,
      [tref, fromPeriod, toPeriod, massG, category]
    );
    const mref = "CRM-" + String(Number((await client.query(`SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),'')::bigint),0)+1 AS n FROM credit_movements`)).rows[0].n)).padStart(4, "0");
    await client.query(
      `INSERT INTO credit_movements (reference,period,category,direction,mass_g,reason,movement,effective_on)
       VALUES ($1,$2,$3,'out',$4,$5,$6,CURRENT_DATE)`,
      [mref, fromPeriod, category, massG, `Credit moved to ${toPeriod} by inter-site transfer ${tref}.`, tref]
    );
    await client.query("COMMIT");
    return { ok: true, transfer: tref };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw e;
  } finally {
    client.release();
  }
}
async function tryAllocate(db2, periodId, lot, category, massG, who) {
  const client = await db2.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["alloc:" + periodId + ":" + category]);
    const p = (await client.query("SELECT * FROM balance_periods WHERE id=$1 FOR UPDATE", [periodId])).rows[0];
    if (!p) throw Object.assign(new Error("period_not_found"), { status: 404 });
    if (p.state === "closed") throw Object.assign(new Error("period_closed"), { status: 409, code: "period_closed" });
    const lotRow = (await client.query("SELECT * FROM lots WHERE reference=$1", [lot])).rows[0];
    if (!lotRow) throw Object.assign(new Error("lot_not_found"), { status: 404 });
    if (lotRow.site !== p.site) throw Object.assign(new Error("lot_site_mismatch"), { status: 409, code: "lot_site_mismatch" });
    const movements = (await client.query("SELECT * FROM credit_movements WHERE period=$1 AND category=$2 AND movement IS NULL", [periodId, category])).rows;
    const avail = sum(movements.filter((m) => m.direction === "in").map((m) => Number(m.mass_g))) - sum(movements.filter((m) => m.direction === "out").map((m) => Number(m.mass_g)));
    if (massG > avail) {
      await client.query("COMMIT");
      return { ok: false, available_g: avail, requested_g: massG };
    }
    const ref = "CRM-" + String(Number((await client.query(`SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),'')::bigint),0)+1 AS n FROM credit_movements`)).rows[0].n)).padStart(4, "0");
    await client.query(
      `INSERT INTO credit_movements (reference,period,category,direction,mass_g,reason,lot,effective_on)
       VALUES ($1,$2,$3,'out',$4,$5,$6,$7)`,
      [ref, periodId, category, massG, "Claim attached to lot " + lot + " by " + who, lot, (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)]
    );
    const attachedRows = (await client.query(
      `SELECT COALESCE(SUM(mass_g),0) AS g FROM credit_movements WHERE lot=$1 AND category=$2 AND direction='out'`,
      [lot, category]
    )).rows;
    const attached = Number(attachedRows[0].g);
    await client.query("COMMIT");
    return { ok: true, movement: ref, content_bp: contentBp(attached, Number(lotRow.mass_g)) };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw e;
  } finally {
    client.release();
  }
}
var init_ledger = __esm({
  "server/engine/ledger.ts"() {
    init_arithmetic();
  }
});

// server/routes/balance.ts
async function currentFactorBp(db2, site) {
  const r = await db2.query("SELECT factor_bp FROM conversion_factors WHERE site=$1 AND superseded_by IS NULL ORDER BY published_on DESC LIMIT 1", [site]);
  return r.rows[0] ? Number(r.rows[0].factor_bp) : 1e4;
}
var balanceRoutes;
var init_balance = __esm({
  "server/routes/balance.ts"() {
    init_dist2();
    init_dbindex();
    init_middleware();
    init_ledger();
    init_record();
    init_arithmetic();
    balanceRoutes = new Hono2();
    balanceRoutes.get("/balance-periods", async (c) => {
      await requireSession(c);
      noPaginationShared(c);
      const rows = (await db.query("SELECT id FROM balance_periods ORDER BY period_from, site")).rows;
      const out = [];
      for (const r of rows) out.push(await periodBalance(db, r.id));
      return c.json(out);
    });
    balanceRoutes.get("/balance-periods/:id", async (c) => {
      await requireSession(c);
      noPaginationShared(c);
      const view = await periodBalance(db, c.req.param("id"));
      if (!view) deny("period_not_found", "No such balance period.", 404);
      return c.json(view);
    });
    balanceRoutes.post("/balance-periods/:id/allocations", async (c) => {
      const s = await requireRole(c, ["claims_manager"]);
      const body = await readJson(c);
      requireFields(body, ["lot", "category", "mass_g"]);
      if (!["post_consumer", "pre_consumer"].includes(body.category)) deny("invalid_category", "category is post_consumer or pre_consumer; the two are never netted.", 400);
      if (!Number.isInteger(body.mass_g)) deny("no_decimals", "mass_g must be an integer number of grams.", 400);
      const id = c.req.param("id");
      const result = await tryAllocate(db, id, body.lot, body.category, body.mass_g, s.email);
      if (!result.ok) {
        await record(db, {
          person: s.email,
          act: "allocation_refused",
          object_kind: "balance_period",
          object_reference: id,
          detail: { lot: body.lot, category: body.category, requested_g: result.requested_g, available_g: result.available_g }
        });
        return c.json({ error: "insufficient_credits", message: `This allocation is refused. Available: ${result.available_g} g. Requested: ${result.requested_g} g.`, available_g: result.available_g, requested_g: result.requested_g }, 409);
      }
      await record(db, {
        person: s.email,
        act: "allocation_made",
        object_kind: "balance_period",
        object_reference: id,
        detail: { lot: body.lot, category: body.category, mass_g: body.mass_g, movement: result.movement, content_bp: result.content_bp }
      });
      await rememberIdempotent(c, 201, { reference: result.movement, content_bp: result.content_bp });
      return c.json({ reference: result.movement, lot: body.lot, category: body.category, mass_g: body.mass_g, content_bp: result.content_bp }, 201);
    });
    balanceRoutes.post("/balance-periods/:id/transfers", async (c) => {
      const s = await requireRole(c, ["claims_manager"]);
      const body = await readJson(c);
      requireFields(body, ["to_period", "mass_g", "category"]);
      if (!Number.isInteger(body.mass_g)) deny("no_decimals", "mass_g must be an integer.", 400);
      const fromId = c.req.param("id");
      const from = (await db.query("SELECT * FROM balance_periods WHERE id=$1", [fromId])).rows[0];
      const to = (await db.query("SELECT * FROM balance_periods WHERE id=$1", [body.to_period])).rows[0];
      if (!from || !to) deny("period_not_found", "No such balance period.", 404);
      if (from.state === "closed" || to.state === "closed") deny("period_closed", "A closed period refuses every further write.", 409);
      const outResult = await tryTransferOut(db, fromId, to.id, body.category, body.mass_g, s.email);
      if (!outResult.ok) {
        return c.json({ error: "insufficient_credits", message: `This transfer is refused. Available: ${outResult.available_g} g. Requested: ${outResult.requested_g} g.`, available_g: outResult.available_g, requested_g: outResult.requested_g }, 409);
      }
      const tref = outResult.transfer;
      const mref = "CRM-" + String(Number((await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),'')::bigint,0)+1 AS n FROM credit_movements")).rows[0].n)).padStart(4, "0");
      await db.query(
        `INSERT INTO credit_movements (reference,period,category,direction,mass_g,reason,origin_site,movement,effective_on)
     VALUES ($1,$2,$3,'in',$4,$5,$6,$7,CURRENT_DATE)`,
        [mref, to.id, body.category, body.mass_g, `Inbound credit from inter-site transfer ${tref}.`, from.site, tref]
      );
      await record(db, { person: s.email, act: "transfer_made", object_kind: "transfer", object_reference: tref, detail: { from: fromId, to: to.id, mass_g: body.mass_g, category: body.category } });
      await rememberIdempotent(c, 201, { reference: tref });
      return c.json({
        reference: tref,
        mass_g: body.mass_g,
        category: body.category,
        origin_site: from.site,
        receiving_period: to.id,
        inbound_credits: [{ reference: mref, mass_g: body.mass_g, origin_site: from.site, movement: tref, fresh_credit: false }]
      }, 201);
    });
    balanceRoutes.get("/balance-periods/:id/transfers", async (c) => {
      await requireSession(c);
      const id = c.req.param("id");
      const rows = (await db.query("SELECT * FROM credit_movements WHERE period=$1 AND origin_site IS NOT NULL AND direction='in' ORDER BY recorded_at", [id])).rows;
      return c.json(rows.map((r) => ({
        reference: r.reference,
        mass_g: Number(r.mass_g),
        origin_site: r.origin_site,
        movement: r.movement,
        fresh_credit: false,
        category: r.category
      })));
    });
    balanceRoutes.post("/balance-periods/:id/close", async (c) => {
      const s = await requireRole(c, ["claims_manager"]);
      const id = c.req.param("id");
      const p = (await db.query("SELECT * FROM balance_periods WHERE id=$1", [id])).rows[0];
      if (!p) deny("period_not_found", "No such balance period.", 404);
      if (p.state === "closed") deny("period_closed", "A closed period refuses every further write and refuses to reopen.", 409);
      const method = (await db.query(
        `SELECT * FROM carbon_methods WHERE id LIKE 'CM-%' AND published_by=$1 ORDER BY version DESC LIMIT 1`,
        [s.email]
      )).rows[0];
      const appliedMethod = (await db.query("SELECT * FROM carbon_methods ORDER BY version DESC LIMIT 1")).rows[0];
      if (method && appliedMethod && method.id === appliedMethod.id && method.version === appliedMethod.version) {
        await record(db, { person: s.email, act: "refused_period_close_separation", object_kind: "balance_period", object_reference: id, detail: { separation: "method_publisher_not_closer" } });
        deny("separation_refused", "Whoever published the carbon method version this period applies does not close it.", 403);
      }
      const lotsInPeriod = (await db.query(
        `SELECT DISTINCT l.reference, l.disposition FROM lots l
     JOIN credit_movements m ON m.lot=l.reference WHERE m.period=$1`,
        [id]
      )).rows;
      const missingDisposition = lotsInPeriod.filter((l) => l.disposition === "pending");
      if (missingDisposition.length) {
        await record(db, { person: s.email, act: "refused_period_close", object_kind: "balance_period", object_reference: id, detail: { reason: "lot_without_disposition", lots: missingDisposition.map((l) => l.reference) } });
        return c.json({ error: "lot_without_disposition", message: `Lots without disposition: ${missingDisposition.map((l) => l.reference).join(", ")}.`, lots: missingDisposition.map((l) => l.reference) }, 409);
      }
      const openDevs = [];
      for (const l of lotsInPeriod) {
        const d = (await db.query(
          `SELECT d.reference FROM deviations d JOIN deviation_subjects ds ON ds.deviation=d.reference
       WHERE d.state='open' AND ds.subject_kind='lot' AND ds.subject=$1 LIMIT 1`,
          [l.reference]
        )).rows[0];
        if (d) openDevs.push(d.reference);
      }
      if (openDevs.length) {
        await record(db, { person: s.email, act: "refused_period_close", object_kind: "balance_period", object_reference: id, detail: { reason: "open_deviation", deviations: [...new Set(openDevs)] } });
        return c.json({ error: "open_deviation", message: `Open deviations touching lots in the period: ${[...new Set(openDevs)].join(", ")}.`, deviations: [...new Set(openDevs)] }, 409);
      }
      const view = await periodBalance(db, id);
      const movementsSum = view.post_consumer.credits_available_g + view.pre_consumer.credits_available_g;
      const movementCount = (await db.query("SELECT COUNT(*)::int AS n FROM credit_movements WHERE period=$1", [id])).rows[0].n;
      if (movementCount > 0 && movementsSum < 0) {
        await record(db, { person: s.email, act: "refused_period_close", object_kind: "balance_period", object_reference: id, detail: { reason: "balance_does_not_reconcile" } });
        return c.json({ error: "balance_does_not_reconcile", message: "The balance does not reconcile.", balance: view }, 409);
      }
      const closedOn = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const cutOff = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
      await db.query("UPDATE balance_periods SET state=$1, closed_on=$2, cut_off=$3, closed_by=$4 WHERE id=$5", ["closed", closedOn, cutOff, s.email, id]);
      await record(db, { person: s.email, site: p.site, act: "period_closed", object_kind: "balance_period", object_reference: id, detail: { closed_on: closedOn, cut_off: cutOff } });
      const after = await periodBalance(db, id);
      await rememberIdempotent(c, 200, { id, state: "closed" });
      return c.json({ id, state: "closed", closed_on: closedOn, cut_off: cutOff, carry_over: after.carry_over });
    });
    balanceRoutes.post("/balance-periods/:id/restatements", async (c) => {
      const s = await requireRole(c, ["claims_manager"]);
      const body = await readJson(c);
      requireFields(body, ["reason"]);
      const id = c.req.param("id");
      const p = (await db.query("SELECT * FROM balance_periods WHERE id=$1", [id])).rows[0];
      if (!p) deny("period_not_found", "No such balance period.", 404);
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM restatements")).rows[0].n;
      const ref = "RST-" + String(n).padStart(4, "0");
      const certs = (await db.query("SELECT * FROM certificates WHERE period=$1 ORDER BY number", [id])).rows;
      const contentMovements = [];
      if (body.conversion_factor) {
        const cf = (await db.query("SELECT * FROM conversion_factors WHERE reference=$1", [body.conversion_factor])).rows[0];
        if (!cf) deny("factor_not_found", "No such conversion factor.", 404);
        for (const cert of certs) {
          const corrected = Math.floor(cert.content_bp * cf.factor_bp / await currentFactorBp(db, p.site));
          contentMovements.push({ certificate: cert.number, content_bp: cert.content_bp, corrected_content_bp: corrected });
        }
      }
      await db.query(
        `INSERT INTO restatements (reference,period,reason,opened_by,opened_on,certificates,content_movements,conversion_factor,state)
     VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,'open')`,
        [ref, id, body.reason, s.email, JSON.stringify(certs.map((x) => x.number)), JSON.stringify(contentMovements), body.conversion_factor || null]
      );
      await record(db, { person: s.email, act: "restatement_opened", object_kind: "restatement", object_reference: ref, detail: { period: id, reason: body.reason, certificates: certs.map((x) => x.number) } });
      await rememberIdempotent(c, 201, { reference: ref });
      return c.json({ reference: ref, period: id, certificates: certs.map((x) => x.number), content_movements: contentMovements }, 201);
    });
    balanceRoutes.get("/restatements", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM restatements ORDER BY opened_at")).rows;
      const out = [];
      for (const r of rows) {
        const resolutions = (await db.query("SELECT * FROM resolutions WHERE restatement=$1 ORDER BY id", [r.reference])).rows;
        out.push({
          reference: r.reference,
          period: r.period,
          reason: r.reason,
          opened_by: r.opened_by,
          opened_on: r.opened_on,
          certificates: r.certificates,
          content_movements: r.content_movements,
          state: r.state,
          resolutions: resolutions.map((x) => ({ certificate: x.certificate, outcome: x.outcome, reason: x.reason, resolved_by: x.resolved_by }))
        });
      }
      return c.json(out);
    });
    balanceRoutes.post("/restatements/:reference/resolutions", async (c) => {
      const s = await requireRole(c, ["claims_manager"]);
      const body = await readJson(c);
      requireFields(body, ["certificate", "outcome", "reason"]);
      if (!["reissued", "withdrawn", "unaffected"].includes(body.outcome)) deny("invalid_outcome", "outcome is reissued, withdrawn or unaffected.", 400);
      const ref = c.req.param("reference");
      const rst = (await db.query("SELECT * FROM restatements WHERE reference=$1", [ref])).rows[0];
      if (!rst) deny("restatement_not_found", "No such restatement.", 404);
      const affected = rst.certificates || [];
      if (!affected.includes(body.certificate)) deny("certificate_not_affected", "That certificate is not in this restatement.", 409);
      const dup = (await db.query("SELECT 1 FROM resolutions WHERE restatement=$1 AND certificate=$2", [ref, body.certificate])).rows[0];
      if (dup) deny("already_resolved", "Each affected certificate takes exactly one resolution in this restatement.", 409);
      await db.query(
        `INSERT INTO resolutions (restatement,certificate,outcome,reason,resolved_by) VALUES ($1,$2,$3,$4,$5)`,
        [ref, body.certificate, body.outcome, body.reason, s.email]
      );
      if (body.outcome === "withdrawn") {
        await db.query(
          `UPDATE certificates SET state='withdrawn', withdrawn_by=$1, withdrawn_on=CURRENT_DATE, withdrawal_reason=$2 WHERE number=$3 AND state<>'withdrawn'`,
          [s.email, "Resolved as withdrawn under restatement " + ref, body.certificate]
        );
      }
      await record(db, { person: s.email, act: "restatement_resolved", object_kind: "restatement", object_reference: ref, detail: { certificate: body.certificate, outcome: body.outcome, reason: body.reason } });
      return c.json({ reference: ref, certificate: body.certificate, outcome: body.outcome }, 201);
    });
    balanceRoutes.get("/conversion-factors", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM conversion_factors ORDER BY site, published_on")).rows;
      return c.json(rows.map((f) => ({
        reference: f.reference,
        site: f.site,
        factor_bp: f.factor_bp,
        derived_from: f.derived_from,
        derived_to: f.derived_to,
        derived_in_g: Number(f.derived_in_g),
        derived_out_g: Number(f.derived_out_g),
        provisional: f.provisional,
        published_on: f.published_on,
        superseded_by: f.superseded_by
      })));
    });
    balanceRoutes.post("/conversion-factors", async (c) => {
      const s = await requireRole(c, ["claims_manager"]);
      const body = await readJson(c);
      requireFields(body, ["site", "factor_bp", "derived_in_g", "derived_out_g"]);
      for (const f of ["factor_bp", "derived_in_g", "derived_out_g"]) if (!Number.isInteger(body[f])) deny("no_decimals", `${f} must be an integer.`, 400);
      const site = (await db.query("SELECT * FROM sites WHERE reference=$1", [body.site])).rows[0];
      if (!site) deny("site_not_found", "No such site.", 404);
      const provisional = Number(body.derived_in_g) === 0;
      if (!provisional) {
        const expected = factorBp(Number(body.derived_out_g), Number(body.derived_in_g));
        if (Number(body.factor_bp) !== expected) {
          return c.json({
            error: "factor_not_derived",
            message: `factor_bp must equal derived_out_g * 10000 / derived_in_g floored, which is ${expected}.`,
            factor_bp: body.factor_bp,
            expected_factor_bp: expected
          }, 409);
        }
      }
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM conversion_factors")).rows[0].n;
      const ref = "CF-" + (body.site === "SITE-PILOT" ? "PILOT" : body.site === "SITE-DEMO" ? "DEMO" : "COMM") + "-" + n;
      await db.query(
        `INSERT INTO conversion_factors (reference,site,factor_bp,derived_from,derived_to,derived_in_g,derived_out_g,provisional,published_on,published_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,$9)`,
        [ref, body.site, body.factor_bp, body.derived_from || null, body.derived_to || null, body.derived_in_g, body.derived_out_g, provisional, s.email]
      );
      await record(db, { person: s.email, site: body.site, act: "conversion_factor_published", object_kind: "conversion_factor", object_reference: ref, detail: { factor_bp: body.factor_bp, derived_in_g: body.derived_in_g, derived_out_g: body.derived_out_g, provisional } });
      await rememberIdempotent(c, 201, { reference: ref });
      return c.json({ reference: ref, factor_bp: body.factor_bp, provisional }, 201);
    });
  }
});

// server/routes/carbon.ts
function methodView(m) {
  return {
    id: m.id,
    version: m.version,
    standard: m.standard,
    functional_unit: m.functional_unit,
    boundary: m.boundary,
    allocation_basis: m.allocation_basis,
    reviewer: m.reviewer,
    published_on: m.published_on,
    published_by: m.published_by,
    data_quality_rules: m.data_quality_rules,
    emission_factors: m.emission_factors,
    superseded_by: m.superseded_by || null
  };
}
async function currentFactor(db2, site) {
  return (await db2.query("SELECT * FROM conversion_factors WHERE site=$1 AND superseded_by IS NULL ORDER BY published_on DESC LIMIT 1", [site])).rows[0] || null;
}
var carbonRoutes;
var init_carbon = __esm({
  "server/routes/carbon.ts"() {
    init_dist2();
    init_dbindex();
    init_middleware();
    init_record();
    carbonRoutes = new Hono2();
    carbonRoutes.get("/carbon-methods", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM carbon_methods ORDER BY id, version")).rows;
      return c.json(rows.map(methodView));
    });
    carbonRoutes.get("/carbon-methods/:id/versions/:version", async (c) => {
      await requireSession(c);
      const m = (await db.query("SELECT * FROM carbon_methods WHERE id=$1 AND version=$2", [c.req.param("id"), Number(c.req.param("version"))])).rows[0];
      if (!m) deny("method_not_found", "No such method version.", 404);
      return c.json(methodView(m));
    });
    carbonRoutes.post("/carbon-methods", async (c) => {
      const s = await requireRole(c, ["quality_manager"]);
      const body = await readJson(c);
      requireFields(body, ["id", "standard", "functional_unit", "boundary", "allocation_basis", "reviewer", "data_quality_rules", "emission_factors"]);
      const existing = (await db.query("SELECT MAX(version)::int AS v FROM carbon_methods WHERE id=$1", [body.id])).rows[0];
      const version = (existing.v || 0) + 1;
      const inUse = (existing.v || 0) > 0;
      if (inUse) await db.query("UPDATE carbon_methods SET superseded_by=$1 WHERE id=$2 AND version=$3", [version, body.id, existing.v]);
      await db.query(
        `INSERT INTO carbon_methods (id,version,standard,functional_unit,boundary,allocation_basis,reviewer,published_on,published_by,data_quality_rules,emission_factors)
     VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,$8,$9,$10)`,
        [body.id, version, body.standard, body.functional_unit, body.boundary, body.allocation_basis, body.reviewer, s.email, JSON.stringify(body.data_quality_rules), JSON.stringify(body.emission_factors)]
      );
      await record(db, { person: s.email, act: "carbon_method_published", object_kind: "carbon_method", object_reference: `${body.id} v${version}`, detail: { boundary: body.boundary, allocation_basis: body.allocation_basis, superseded: existing.v || null } });
      await rememberIdempotent(c, 201, { reference: `${body.id} v${version}`, version });
      return c.json({ reference: `${body.id} v${version}`, id: body.id, version, superseded: existing.v || null }, 201);
    });
    carbonRoutes.get("/lots/:reference/carbon", async (c) => {
      await requireSession(c);
      const lotRef = c.req.param("reference");
      const lot = (await db.query("SELECT * FROM lots WHERE reference=$1", [lotRef])).rows[0];
      if (!lot) deny("lot_not_found", "No such lot.", 404);
      const f = (await db.query("SELECT * FROM carbon_figures WHERE lot=$1 ORDER BY computed_at DESC LIMIT 1", [lotRef])).rows[0];
      if (!f) deny("carbon_figure_not_found", "No carbon figure stands for this lot.", 404);
      const period = (await db.query(
        `SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 ORDER BY period_from DESC LIMIT 1`,
        [lot.site, lot.grade]
      )).rows[0];
      if (period) {
        const method = (await db.query("SELECT * FROM carbon_methods WHERE id=$1 AND version=$2", [f.method_id, f.method_version])).rows[0];
        if (method && method.allocation_basis !== period.allocation_basis) {
          return c.json({ error: "allocation_basis_mismatch", message: `The lot's carbon method allocates on ${method.allocation_basis} while the period allocates on ${period.allocation_basis}.` }, 409);
        }
      }
      const threshold = (await db.query("SELECT data_quality_rules->>'primary_share_threshold_bp' AS t FROM carbon_methods WHERE id=$1 AND version=$2", [f.method_id, f.method_version])).rows[0];
      const energy = f.energy || {};
      const factor = await currentFactor(db, lot.site);
      return c.json({
        lot: lotRef,
        value_mg_per_kg: Number(f.value_mg_per_kg),
        boundary: (await db.query("SELECT boundary FROM carbon_methods WHERE id=$1 AND version=$2", [f.method_id, f.method_version])).rows[0].boundary,
        method_version: `${f.method_id} v${f.method_version}`,
        uncertainty_bp: f.uncertainty_bp,
        comparator: f.comparator,
        primary_share_bp: f.primary_share_bp,
        default_led: Number(f.primary_share_bp) < Number(threshold?.t || 5e3),
        breakdown: f.breakdown,
        energy_location_mg_per_kg: energy.energy_location_mg_per_kg,
        energy_market_mg_per_kg: energy.energy_market_mg_per_kg,
        metered_kwh: energy.metered_kwh,
        retired_kwh: energy.retired_kwh,
        unmatched_kwh: energy.unmatched_kwh,
        cache_valid: f.cache_valid,
        cache_derivation: f.computed_against,
        derivation: { value: "sum of breakdown lines", versions: f.computed_against, conversion_factor: factor?.reference || null }
      });
    });
    carbonRoutes.get("/energy-instruments", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM energy_instruments ORDER BY reference")).rows;
      return c.json(rows.map((r) => ({ reference: r.reference, quantity_kwh: Number(r.quantity_kwh), vintage: Number(r.vintage), region: r.region, state: r.state })));
    });
    carbonRoutes.post("/energy-instruments/:reference/retire", async (c) => {
      const s = await requireRole(c, ["claims_manager", "quality_manager"]);
      const body = await readJson(c);
      requireFields(body, ["period"]);
      const inst = (await db.query("SELECT * FROM energy_instruments WHERE reference=$1", [c.req.param("reference")])).rows[0];
      if (!inst) deny("instrument_not_found", "No such instrument.", 404);
      const period = (await db.query("SELECT * FROM balance_periods WHERE id=$1", [body.period])).rows[0];
      if (!period) deny("period_not_found", "No such balance period.", 404);
      const year = Number(period.period_from.slice(0, 4));
      if (inst.state !== "retired") return c.json({ error: "instrument_not_retired", message: "The instrument is not retired." }, 409);
      if (Number(inst.vintage) !== year) return c.json({ error: "vintage_mismatch", message: `The instrument's vintage ${inst.vintage} does not match the consumption year ${year}.` }, 409);
      if (inst.region !== "EU-27") return c.json({ error: "region_mismatch", message: `The instrument's region ${inst.region} does not match the consumption region EU-27.` }, 409);
      const metered = (await db.query(
        `SELECT COALESCE(SUM((payload->>'metered_kwh')::bigint),0) AS kwh FROM carbon_figures WHERE lot IN (SELECT reference FROM lots WHERE site=$1)`,
        [period.site]
      )).rows[0];
      const meteredKwh = Number(metered.kwh) || 3e5;
      const already = (await db.query("SELECT COALESCE(SUM(quantity_kwh),0) AS q FROM energy_retirements WHERE period=$1", [period.id])).rows[0];
      if (Number(already.q) + Number(inst.quantity_kwh) > meteredKwh) {
        return c.json({
          error: "retirement_exceeds_metered",
          message: "The retired quantity would exceed the metered consumption.",
          metered_kwh: meteredKwh,
          already_retired_kwh: Number(already.q),
          instrument_kwh: Number(inst.quantity_kwh)
        }, 409);
      }
      await db.query(`INSERT INTO energy_retirements (instrument,period,quantity_kwh,retired_on) VALUES ($1,$2,$3,CURRENT_DATE)`, [inst.reference, period.id, inst.quantity_kwh]);
      await record(db, { person: s.email, site: period.site, act: "energy_instrument_retired", object_kind: "energy_instrument", object_reference: inst.reference, detail: { period: period.id, quantity_kwh: Number(inst.quantity_kwh) } });
      return c.json({ reference: inst.reference, period: period.id, retired_kwh: Number(inst.quantity_kwh), metered_kwh: meteredKwh, unmatched_kwh: meteredKwh - Number(already.q) - Number(inst.quantity_kwh) }, 201);
    });
    carbonRoutes.post("/carbon-figures/:id/recompute", async (c) => {
      const s = await requireRole(c, ["quality_manager", "claims_manager"]);
      const body = await readJson(c);
      requireFields(body, ["reason"]);
      const f = (await db.query("SELECT * FROM carbon_figures WHERE id=$1", [c.req.param("id")])).rows[0];
      if (!f) deny("figure_not_found", "No such carbon figure.", 404);
      const period = (await db.query(
        `SELECT bp.* FROM balance_periods bp JOIN lots l ON l.site=bp.site AND l.grade=bp.grade WHERE l.reference=$1 ORDER BY bp.period_from DESC LIMIT 1`,
        [f.lot]
      )).rows[0];
      if (period && period.state === "closed") {
        const rst = (await db.query(`SELECT 1 FROM restatements WHERE period=$1 AND state='open'`, [period.id])).rows[0];
        if (!rst) return c.json({ error: "period_closed", message: "A recomputation against a closed period is refused unless a restatement is open." }, 409);
      }
      const newVersion = f.id + "-v2";
      await db.query(
        `INSERT INTO carbon_figures (id,lot,method_id,method_version,value_mg_per_kg,uncertainty_bp,primary_share_bp,breakdown,comparator,energy,computed_against,computed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
        [newVersion, f.lot, f.method_id, f.method_version, f.value_mg_per_kg, f.uncertainty_bp, f.primary_share_bp, JSON.stringify(f.breakdown), JSON.stringify(f.comparator), JSON.stringify(f.energy), JSON.stringify({ ...f.computed_against, recomputed_by: s.email, recomputed_on: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), reason: body.reason, supersedes: f.id })]
      );
      await db.query("UPDATE carbon_figures SET cache_valid=false WHERE id=$1", [f.id]);
      const certs = (await db.query("SELECT number FROM certificates WHERE carbon_figure=$1 ORDER BY number", [f.id])).rows.map((r) => r.number);
      await record(db, { person: s.email, act: "carbon_figure_recomputed", object_kind: "carbon_figure", object_reference: newVersion, detail: { supersedes: f.id, reason: body.reason, certificates_carrying_superseded: certs } });
      return c.json({ reference: newVersion, supersedes: f.id, reason: body.reason, recomputed_on: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), certificates_carrying_superseded: certs }, 201);
    });
  }
});

// server/engine/certificates.ts
async function evaluateConditions(db2, lot, signer, dateOfSigning) {
  const lotRow = (await db2.query("SELECT * FROM lots WHERE reference=$1", [lot])).rows[0];
  if (!lotRow) throw Object.assign(new Error("lot_not_found"), { status: 404 });
  const openDev = (await db2.query(
    `SELECT d.reference FROM deviations d JOIN deviation_subjects ds ON ds.deviation=d.reference
     WHERE d.state='open' AND ((ds.subject_kind='lot' AND ds.subject=$1) OR (ds.subject_kind='run' AND ds.subject=$2))`,
    [lot, lotRow.run]
  )).rows[0];
  const unreviewed = (await db2.query(
    `SELECT reference FROM overrides WHERE lot=$1 AND reviewed=false ORDER BY reference LIMIT 1`,
    [lot]
  )).rows[0];
  const period = (await db2.query(
    `SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 AND $3 BETWEEN period_from AND period_to`,
    [lotRow.site, lotRow.grade, dateOfSigning]
  )).rows[0] || (await db2.query(
    `SELECT * FROM balance_periods WHERE site=$1 AND grade=$2 ORDER BY period_from DESC LIMIT 1`,
    [lotRow.site, lotRow.grade]
  )).rows[0];
  const invariantHolds = period ? (await db2.query(
    `SELECT COALESCE(SUM(CASE WHEN direction='in' THEN mass_g ELSE -mass_g END),0) AS a
         FROM credit_movements WHERE period=$1 AND lot=$2`,
    [period.id, lot]
  )).rows[0] : null;
  const attached = Number(invariantHolds ? invariantHolds.a : 0);
  const availableNow = period ? Number((await db2.query(
    `SELECT COALESCE(SUM(CASE WHEN direction='in' THEN mass_g ELSE -mass_g END),0) AS a
         FROM credit_movements WHERE period=$1`,
    [period.id]
  )).rows[0].a) : 0;
  const figure = (await db2.query("SELECT * FROM carbon_figures WHERE lot=$1 ORDER BY computed_at DESC LIMIT 1", [lot])).rows[0];
  const grant = (await db2.query("SELECT * FROM grants WHERE email=$1", [signer])).rows[0];
  const inScope = !!grant && grant.sites.includes(lotRow.site) && grant.role === "certificate_signer" && grant.ends_on >= dateOfSigning;
  const enteredData = (await db2.query(
    `SELECT 1 FROM test_results WHERE analyst=$1 AND subject=$2 LIMIT 1`,
    [signer, lot]
  )).rows[0] || (await db2.query(
    `SELECT 1 FROM consumptions c JOIN lots l ON l.run IS NOT NULL WHERE c.run IN (SELECT run FROM outputs WHERE lot=$1) LIMIT 1`,
    [lot]
  )).rows[0];
  const enteredBySigner = !!(await db2.query(
    `SELECT 1 FROM test_results WHERE analyst=$1 AND subject=$2`,
    [signer, lot]
  )).rows[0] || !!(await db2.query(
    `SELECT 1 FROM runs WHERE reference=$1 AND operator=$2`,
    [lotRow.run, signer]
  )).rows[0];
  const conditions = [
    { condition: "lot_released", satisfied: lotRow.disposition === "released", blocking_reference: lotRow.disposition === "released" ? null : lot },
    { condition: "no_open_deviation", satisfied: !openDev, blocking_reference: openDev ? openDev.reference : null },
    { condition: "no_unreviewed_override", satisfied: !unreviewed, blocking_reference: unreviewed ? unreviewed.reference : null },
    {
      condition: "period_closed",
      satisfied: !!period && period.state === "closed",
      blocking_reference: period ? period.state === "closed" ? null : period.id : lotRow.site + "/" + lotRow.grade
    },
    {
      condition: "balance_invariant_holds",
      satisfied: attached <= availableNow,
      blocking_reference: attached > availableNow ? period?.id || null : null
    },
    {
      condition: "carbon_figure_complete",
      satisfied: !!figure && figure.value_mg_per_kg != null && figure.uncertainty_bp != null && !!figure.method_version && !!figure.comparator,
      blocking_reference: figure ? null : lot
    },
    { condition: "signer_scope", satisfied: inScope, blocking_reference: inScope ? null : lotRow.site },
    { condition: "signer_not_data_enterer", satisfied: !enteredBySigner, blocking_reference: enteredBySigner ? signer : null }
  ];
  return { conditions, period: period ? period.id : null };
}
function statement(claimType, contentBp2, categorySplit, recipientLanguage) {
  const pct = (contentBp2 / 100).toFixed(2).replace(/\.?0+$/, "");
  const pctWord = String(Math.floor(contentBp2 / 100));
  if (claimType === "mass_balance") {
    const permitted2 = recipientLanguage === "fr" ? `Le mat\xE9riau contenant ce produit peut \xEAtre d\xE9crit comme contenant ${pctWord} % de nylon 6 recycl\xE9, selon la m\xE9thode de bilan de masse.` : `Materials containing product manufactured with recycled content may be described as containing ${pctWord}% recycled nylon 6 by mass balance.`;
    const prohibited2 = recipientLanguage === "fr" ? `Vous ne pouvez pas d\xE9clarer que ce mat\xE9riau contient physiquement du contenu recycl\xE9.` : `You may not state that this material physically contains recycled content.`;
    return { permitted: permitted2, prohibited: prohibited2 };
  }
  const permitted = `This material may be described as containing ${pctWord}% recycled nylon 6.`;
  const prohibited = `You may not state a recycled-content percentage higher than ${pctWord}%.`;
  return { permitted, prohibited };
}
var CONDITION_TEXT;
var init_certificates = __esm({
  "server/engine/certificates.ts"() {
    CONDITION_TEXT = {
      lot_released: "The lot is released.",
      no_open_deviation: "No deviation touching the lot is open.",
      no_unreviewed_override: "No override on the lot is unreviewed.",
      period_closed: "The bookkeeping period is closed.",
      balance_invariant_holds: "The balance invariant holds with the allocation applied.",
      carbon_figure_complete: "The carbon figure exists with all four components.",
      signer_scope: "The signer holds signing scope for that site on the date of signing.",
      signer_not_data_enterer: "The signer did not enter the data."
    };
  }
});

// server/routes/certificates.ts
function certSummary(x) {
  return {
    number: x.number,
    version: x.version,
    site: x.site,
    grade: x.grade,
    period: x.period,
    claim_type: x.claim_type,
    content_bp: x.content_bp,
    state: x.state,
    recipient: x.recipient,
    lots: x.lots,
    specification_version: x.specification_version,
    signer: x.signer,
    signed_at: x.signed_at,
    withdrawn_on: x.withdrawn_on,
    withdrawal_reason: x.withdrawal_reason,
    provisional_factor: x.provisional_factor,
    carbon: x.carbon_figure
  };
}
async function fullCertificate(number) {
  const x = (await db.query("SELECT * FROM certificates WHERE number=$1", [number])).rows[0];
  if (!x) deny("certificate_not_found", "No such certificate.", 404);
  const figure = x.carbon_figure ? (await db.query("SELECT * FROM carbon_figures WHERE id=$1", [x.carbon_figure])).rows[0] : null;
  const method = figure ? (await db.query("SELECT * FROM carbon_methods WHERE id=$1 AND version=$2", [figure.method_id, figure.method_version])).rows[0] : null;
  return {
    number: x.number,
    version: x.version,
    site: x.site,
    lots: x.lots,
    grade: x.grade,
    specification_version: x.specification_version,
    claim_type: x.claim_type,
    content_bp: x.content_bp,
    category_split: x.category_split,
    period: x.period,
    recipient: x.recipient,
    carbon: figure ? {
      value_mg_per_kg: Number(figure.value_mg_per_kg),
      boundary: method?.boundary,
      method_version: `${figure.method_id} v${figure.method_version}`,
      uncertainty_bp: figure.uncertainty_bp,
      primary_share_bp: figure.primary_share_bp
    } : null,
    primary_share_bp: figure ? figure.primary_share_bp : null,
    scheme: x.scheme,
    registration: x.registration,
    test_results: x.test_results,
    permitted_statement: x.permitted_statement,
    prohibited_statement: x.prohibited_statement,
    signer: x.signer,
    signed_at: x.signed_at,
    verification_url: VERIFICATION_BASE + x.number,
    state: x.state,
    provisional_factor: x.provisional_factor,
    conditions: x.conditions,
    withdrawn_by: x.withdrawn_by,
    withdrawn_on: x.withdrawn_on,
    withdrawal_reason: x.withdrawal_reason,
    notified_recipients: x.notified_recipients,
    void_statements: x.void_statements,
    derived_certificates: x.derived_certificates,
    batch_traversal: x.batch_traversal,
    derived_from: x.derived_from
  };
}
var certificateRoutes, VERIFICATION_BASE;
var init_certificates2 = __esm({
  "server/routes/certificates.ts"() {
    init_dist2();
    init_dbindex();
    init_middleware();
    init_certificates();
    init_genealogy();
    init_record();
    init_mail();
    init_auth();
    certificateRoutes = new Hono2();
    VERIFICATION_BASE = "https://ravel.example.com/verify/";
    certificateRoutes.get("/certificates", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM certificates ORDER BY number")).rows;
      return c.json(rows.map(certSummary));
    });
    certificateRoutes.get("/certificates/:number", async (c) => {
      await requireSession(c);
      const x = await fullCertificate(c.req.param("number"));
      return c.json(x);
    });
    certificateRoutes.post("/certificates/preview", async (c) => {
      const s = await requireRole(c, ["certificate_signer"]);
      const body = await readJson(c);
      requireFields(body, ["lot", "recipient"]);
      const { conditions, period } = await evaluateConditions(db, body.lot, s.email, (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
      return c.json({
        lot: body.lot,
        recipient: body.recipient,
        period,
        conditions: conditions.map((cond) => ({ condition: cond.condition, satisfied: cond.satisfied, blocking_reference: cond.blocking_reference, statement: CONDITION_TEXT[cond.condition] }))
      });
    });
    certificateRoutes.post("/certificates", async (c) => {
      const s = await requireRole(c, ["certificate_signer"]);
      const body = await readJson(c);
      requireFields(body, ["lot", "recipient", "password"]);
      if (!body.password) deny("reauthentication_required", "Signing carries the password again; a session alone is not a signing credential.", 401);
      const passwordOk = await verifyPasswordAgain(s.email, body.password);
      if (!passwordOk) deny("reauthentication_failed", "The password was not accepted for this signing act.", 401);
      const lotRef = body.lot;
      const lot = (await db.query("SELECT * FROM lots WHERE reference=$1", [lotRef])).rows[0];
      if (!lot) deny("lot_not_found", "No such lot.", 404);
      if (!s.sites.includes(lot.site)) {
        await record(db, { person: s.email, site: lot.site, act: "refused_signing_scope", object_kind: "certificate", object_reference: lotRef, detail: { reason: "site_out_of_scope", grant_sites: s.sites } });
        deny("site_out_of_scope", `Your signing scope does not cover ${lot.site}.`, 403);
      }
      const signingDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const { conditions, period } = await evaluateConditions(db, lotRef, s.email, signingDate);
      const blocking = conditions.filter((x) => !x.satisfied);
      if (blocking.length) {
        await record(db, {
          person: s.email,
          site: lot.site,
          act: "refused_certificate_signing",
          object_kind: "certificate",
          object_reference: lotRef,
          detail: { blocking_conditions: blocking.map((b) => b.condition) }
        });
        return c.json({
          error: "conditions_not_satisfied",
          message: `Signing is refused. The condition that changed or fails: ${blocking.map((b) => CONDITION_TEXT[b.condition]).join(" ")}`,
          conditions: conditions.map((cond) => ({ condition: cond.condition, satisfied: cond.satisfied, blocking_reference: cond.blocking_reference, statement: CONDITION_TEXT[cond.condition] }))
        }, 409);
      }
      const suspension = (await db.query(
        `SELECT * FROM site_events WHERE site=$1 AND kind='certification_suspended' AND effective_from <= $2 AND (effective_to IS NULL OR effective_to >= $2)`,
        [lot.site, signingDate]
      )).rows[0];
      if (suspension) {
        await record(db, { person: s.email, site: lot.site, act: "refused_certificate_signing", object_kind: "certificate", object_reference: lotRef, detail: { reason: "certification_suspended", window: [suspension.effective_from, suspension.effective_to] } });
        return c.json({ error: "certification_suspended", message: `Issuing is stopped for ${lot.site}: the site's certification is suspended from ${suspension.effective_from}.`, window: { from: suspension.effective_from, to: suspension.effective_to } }, 409);
      }
      const seq = await db.connect();
      let number;
      try {
        await seq.query("BEGIN");
        await seq.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["certseq:" + lot.site]);
        const row = (await seq.query("SELECT next_number FROM certificate_sequences WHERE site=$1 FOR UPDATE", [lot.site])).rows[0];
        const prefix = lot.site === "SITE-PILOT" ? "CERT-PILOT" : lot.site === "SITE-DEMO" ? "CERT-DEMO" : "CERT-COMM";
        number = `${prefix}-${String(row.next_number).padStart(6, "0")}`;
        await seq.query("UPDATE certificate_sequences SET next_number=$1 WHERE site=$2", [Number(row.next_number) + 1, lot.site]);
        await seq.query("COMMIT");
      } catch (e) {
        await seq.query("ROLLBACK").catch(() => {
        });
        seq.release();
        throw e;
      }
      seq.release();
      const attachedRows = (await db.query(`SELECT category, mass_g FROM credit_movements WHERE lot=$1 AND direction='out'`, [lotRef])).rows;
      const attached = attachedRows.reduce((a, r) => a + Number(r.mass_g), 0);
      const contentBp2 = Math.floor(attached * 1e4 / Number(lot.mass_g));
      const split = {};
      for (const r of attachedRows) split[r.category] = (split[r.category] || 0) + Number(r.mass_g);
      for (const k of Object.keys(split)) split[k] = Math.floor(split[k] * 100 / attached);
      const recipient = (await db.query("SELECT * FROM customers WHERE reference=$1", [body.recipient])).rows[0];
      const lang = recipient?.industry === "automotive" ? "en" : "en";
      const stmt = statement(lot.claim_type, contentBp2, split, lang);
      const factor = (await db.query("SELECT * FROM conversion_factors WHERE site=$1 AND superseded_by IS NULL ORDER BY published_on DESC LIMIT 1", [lot.site])).rows[0];
      const figure = (await db.query("SELECT * FROM carbon_figures WHERE lot=$1 ORDER BY computed_at DESC LIMIT 1", [lotRef])).rows[0];
      const spec = (await db.query("SELECT * FROM specifications WHERE grade=$1 ORDER BY version DESC LIMIT 1", [lot.grade])).rows[0];
      const tests = (await db.query("SELECT * FROM test_results WHERE subject=$1 AND usable_for_release=true ORDER BY recorded_at", [lotRef])).rows;
      await db.query(
        `INSERT INTO certificates (number,version,site,grade,period,claim_type,content_bp,category_split,lots,specification_version,recipient,carbon_figure,scheme,registration,test_results,permitted_statement,prohibited_statement,provisional_factor,conditions,derived_from,signer,signed_at,state)
     VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now(),'issued')`,
        [
          number,
          lot.site,
          lot.grade,
          period,
          lot.claim_type,
          contentBp2,
          JSON.stringify(split),
          JSON.stringify([{ reference: lotRef, mass_g: Number(lot.mass_g) }]),
          spec ? spec.version : 1,
          body.recipient,
          figure ? figure.id : null,
          "RCS-2026",
          "REG-RAVEL-0042",
          JSON.stringify(tests.map((t) => ({ reference: t.reference, property: t.property, method: t.method, value: t.value, unit: t.unit }))),
          stmt.permitted,
          stmt.prohibited,
          factor ? factor.provisional : false,
          JSON.stringify(conditions.map((x) => ({ condition: x.condition, satisfied: x.satisfied, blocking_reference: x.blocking_reference }))),
          JSON.stringify({ conversion_factor: factor?.reference || null, carbon_method: figure ? { id: figure.method_id, version: figure.method_version } : null, specification: { grade: lot.grade, version: spec?.version || null } }),
          s.email
        ]
      );
      await record(db, {
        person: s.email,
        site: lot.site,
        act: "certificate_signed",
        object_kind: "certificate",
        object_reference: number,
        detail: { lot: lotRef, recipient: body.recipient, claim_type: lot.claim_type, content_bp: contentBp2, period, conditions: conditions.map((x) => ({ condition: x.condition, satisfied: x.satisfied })) }
      });
      const recipientMail = recipient?.contact || body.recipient;
      if (recipientMail.includes("@")) {
        await sendMail({
          to: recipientMail,
          subject: `Certificate ${number} issued`,
          text: [
            `Certificate number: ${number}`,
            `Claim type: ${lot.claim_type}`,
            `Recycled content: ${Math.floor(contentBp2 / 100)} per cent (${contentBp2} basis points)`,
            "",
            "Permitted statement:",
            stmt.permitted,
            "",
            "Prohibited statement:",
            stmt.prohibited,
            "",
            `Verify this certificate at ravel.example.com/verify/${number}`
          ].join("\n")
        });
      }
      await rememberIdempotent(c, 201, { number });
      return c.json(await fullCertificate(number), 201);
    });
    certificateRoutes.post("/certificates/:number/withdraw", async (c) => {
      const s = await requireRole(c, ["certificate_signer"]);
      const body = await readJson(c);
      requireFields(body, ["reason"]);
      const number = c.req.param("number");
      const x = (await db.query("SELECT * FROM certificates WHERE number=$1", [number])).rows[0];
      if (!x) deny("certificate_not_found", "No such certificate.", 404);
      if (!s.sites.includes(x.site)) deny("site_out_of_scope", `Your signing scope does not cover ${x.site}.`, 403);
      if (x.state === "withdrawn") deny("already_withdrawn", "This certificate is withdrawn.", 409);
      const otherCerts = (await db.query("SELECT number, lots FROM certificates WHERE number<>$1 AND state<>$2", [number, "withdrawn"])).rows;
      const derived = otherCerts.filter((o) => o.lots.some((l) => x.lots.some((m) => m.reference === l.reference))).map((o) => o.number);
      const batches = [];
      const lotsTouched = [];
      for (const l of x.lots) {
        const g = await batchImpact(db, l.reference);
        lotsTouched.push(...g.lots.map((m) => m.reference));
      }
      const traversalCerts = [];
      for (const l of x.lots) {
        const g = await batchImpact(db, l.reference);
        for (const cert of g.certificates) {
          if (cert.number !== number && !traversalCerts.includes(cert.number)) traversalCerts.push(cert.number);
        }
      }
      const withdrawnOn = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const voidStatements = [x.permitted_statement, x.prohibited_statement];
      const recipients = [x.recipient];
      await db.query(
        `UPDATE certificates SET state='withdrawn', withdrawn_by=$1, withdrawn_on=$2, withdrawal_reason=$3, notified_recipients=$4, void_statements=$5, derived_certificates=$6, batch_traversal=$7 WHERE number=$8`,
        [s.email, withdrawnOn, body.reason, JSON.stringify(recipients), JSON.stringify(voidStatements), JSON.stringify(derived), JSON.stringify({ batches, lots: [...new Set(lotsTouched)], certificates: traversalCerts, recipients_of_those_certificates: recipients }), number]
      );
      for (const n of derived) {
        const existing = (await db.query("SELECT resolution_reference FROM certificates WHERE number=$1", [n])).rows;
        await db.query(
          `UPDATE certificates SET state='withdrawn', withdrawn_by=$1, withdrawn_on=$2, withdrawal_reason=$3 WHERE number=$4`,
          [s.email, withdrawnOn, `Derived from ${number}, withdrawn under it`, n]
        );
      }
      const customer = (await db.query("SELECT * FROM customers WHERE reference=$1", [x.recipient])).rows[0];
      if (customer?.contact?.includes("@")) {
        await sendMail({
          to: customer.contact,
          subject: `Certificate ${number} withdrawn`,
          text: [
            `Certificate number: ${number}`,
            `Reason: ${body.reason}`,
            "",
            "Statements now void:",
            ...voidStatements.map((v) => `- ${v}`)
          ].join("\n")
        });
      }
      await record(db, {
        person: s.email,
        site: x.site,
        act: "certificate_withdrawn",
        object_kind: "certificate",
        object_reference: number,
        detail: { reason: body.reason, notified_recipients: recipients, void_statements: voidStatements, derived_certificates: derived, batch_traversal: { lots: [...new Set(lotsTouched)], certificates: traversalCerts } }
      });
      return c.json({
        number,
        state: "withdrawn",
        reason: body.reason,
        withdrawn_by: s.email,
        withdrawn_on: withdrawnOn,
        notified_recipients: recipients,
        void_statements: voidStatements,
        derived_certificates: derived,
        batch_traversal: { batches, lots: [...new Set(lotsTouched)], certificates: traversalCerts }
      });
    });
    certificateRoutes.post("/certificates/:number/reissue", async (c) => {
      const s = await requireRole(c, ["certificate_signer"]);
      const body = await readJson(c);
      requireFields(body, ["password"]);
      const passwordOk = await verifyPasswordAgain(s.email, body.password);
      if (!passwordOk) deny("reauthentication_failed", "The password was not accepted for this signing act.", 401);
      const number = c.req.param("number");
      const x = (await db.query("SELECT * FROM certificates WHERE number=$1", [number])).rows[0];
      if (!x) deny("certificate_not_found", "No such certificate.", 404);
      const newVersion = Number(x.version) + 1;
      await db.query(
        `INSERT INTO certificates (number,version,site,grade,period,claim_type,content_bp,category_split,lots,specification_version,recipient,carbon_figure,scheme,registration,test_results,permitted_statement,prohibited_statement,provisional_factor,conditions,derived_from,signer,signed_at,state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now(),'issued')`,
        [
          number,
          newVersion,
          x.site,
          x.grade,
          x.period,
          x.claim_type,
          x.content_bp,
          JSON.stringify(x.category_split),
          JSON.stringify(x.lots),
          x.specification_version,
          x.recipient,
          x.carbon_figure,
          x.scheme,
          x.registration,
          JSON.stringify(x.test_results),
          x.permitted_statement,
          x.prohibited_statement,
          x.provisional_factor,
          JSON.stringify(x.conditions),
          JSON.stringify(x.derived_from),
          s.email
        ]
      );
      await record(db, { person: s.email, site: x.site, act: "certificate_reissued", object_kind: "certificate", object_reference: `${number} v${newVersion}`, detail: { previous_version: x.version } });
      return c.json({ number, version: newVersion, previous_version: x.version, state: "issued" }, 201);
    });
    certificateRoutes.get("/certificates/:number/document", async (c) => {
      await requireSession(c);
      const number = c.req.param("number");
      const rows = (await db.query("SELECT * FROM certificates WHERE number=$1 ORDER BY version DESC", [number])).rows;
      if (!rows.length) deny("certificate_not_found", "No such certificate.", 404);
      const x = rows[0];
      const figure = x.carbon_figure ? (await db.query("SELECT * FROM carbon_figures WHERE id=$1", [x.carbon_figure])).rows[0] : null;
      const method = figure ? (await db.query("SELECT * FROM carbon_methods WHERE id=$1 AND version=$2", [figure.method_id, figure.method_version])).rows[0] : null;
      const lines = [];
      lines.push("RAVEL MATERIALS SAS \u2014 RECYCLED CONTENT CERTIFICATE");
      lines.push("");
      lines.push(`Certificate number: ${x.number}`);
      lines.push(`Version: ${x.version}`);
      lines.push(`State: ${x.state}`);
      if (x.state === "withdrawn") {
        lines.push(`This certificate was withdrawn on ${x.withdrawn_on}. Reason: ${x.withdrawal_reason}.`);
      }
      lines.push("");
      lines.push("CLAIM");
      lines.push(`Claim type: ${x.claim_type}`);
      lines.push(`Recycled content: ${Math.floor(x.content_bp / 100)} per cent (${x.content_bp} basis points)`);
      lines.push("This material is claimed by mass balance. It is not physically segregated.");
      lines.push("");
      lines.push("LOTS");
      for (const l of x.lots) lines.push(`  ${l.reference} \u2014 ${l.mass_g} g`);
      lines.push("");
      lines.push(`Site: ${x.site}`);
      lines.push(`Grade: ${x.grade} \u2014 specification version ${x.specification_version}`);
      lines.push(`Balance period: ${x.period}`);
      lines.push(`Scheme: ${x.scheme}`);
      lines.push(`Producer registration: ${x.registration}`);
      lines.push("");
      lines.push("CARBON");
      if (figure) {
        lines.push(`Carbon value: ${figure.value_mg_per_kg} mg CO2e per kg of pellet`);
        lines.push(`Boundary: ${method?.boundary}`);
        lines.push(`Method version: ${figure.method_id} v${figure.method_version} (${method?.standard})`);
        lines.push(`Uncertainty: ${figure.uncertainty_bp} basis points`);
        lines.push(`Primary data share: ${figure.primary_share_bp} basis points`);
        if (x.provisional_factor) lines.push("Conversion factor: provisional");
      }
      lines.push("");
      lines.push("PERMITTED AND PROHIBITED STATEMENTS");
      lines.push(`Permitted: ${x.permitted_statement}`);
      lines.push(`Prohibited: ${x.prohibited_statement}`);
      lines.push("");
      lines.push("TEST RESULTS");
      for (const t of x.test_results) lines.push(`  ${t.reference} \u2014 ${t.property} by ${t.method}: ${t.value} ${t.unit}`);
      lines.push("");
      lines.push(`Signed by: ${x.signer}`);
      lines.push(`Signed at: ${String(x.signed_at)}`);
      lines.push(`Verify this certificate at ravel.example.com/verify/${x.number}`);
      lines.push("");
      if (x.carbon_figure) lines.push("Carbon breakdown is attached to the filed copy rather than stated inline.");
      const text = lines.join("\n");
      return c.body(text, 200, { "content-type": "text/plain; charset=utf-8" });
    });
    certificateRoutes.get("/certificates/:number/replay", async (c) => {
      await requireSession(c);
      const number = c.req.param("number");
      const x = (await db.query("SELECT * FROM certificates WHERE number=$1 ORDER BY version DESC LIMIT 1", [number])).rows[0];
      if (!x) deny("certificate_not_found", "No such certificate.", 404);
      const inputVersions = x.derived_from;
      const recomputed = {};
      const differing = [];
      const lotsRows = x.lots;
      let attached = 0, lotMass = 0;
      for (const l of lotsRows) {
        const row = (await db.query("SELECT mass_g FROM lots WHERE reference=$1", [l.reference])).rows[0];
        lotMass += Number(row?.mass_g || l.mass_g);
        const mv = (await db.query(`SELECT COALESCE(SUM(mass_g),0) AS g FROM credit_movements WHERE lot=$1 AND direction='out'`, [l.reference])).rows[0];
        attached += Number(mv.g);
      }
      const recomputedContentBp = Math.floor(attached * 1e4 / lotMass);
      recomputed.content_bp = recomputedContentBp;
      if (recomputedContentBp !== Number(x.content_bp)) differing.push({ input: "credit_movements", issued: Number(x.content_bp), recomputed: recomputedContentBp });
      const versions = [];
      let reproducible = true;
      let reason = null;
      if (inputVersions?.carbon_method) {
        const m = (await db.query("SELECT * FROM carbon_methods WHERE id=$1 AND version=$2", [inputVersions.carbon_method.id, inputVersions.carbon_method.version])).rows[0];
        if (!m) {
          reproducible = false;
          reason = "The method version the figure was computed against has been retired.";
        } else versions.push({ kind: "carbon_method", reference: `${m.id} v${m.version}`, state: m.superseded_by ? "superseded" : "current" });
      }
      if (inputVersions?.conversion_factor) {
        const f = (await db.query("SELECT * FROM conversion_factors WHERE reference=$1", [inputVersions.conversion_factor])).rows[0];
        if (!f) {
          reproducible = false;
          reason = "The conversion factor the certificate rests on is gone.";
        } else versions.push({ kind: "conversion_factor", reference: f.reference, state: f.superseded_by ? "superseded" : "current" });
      }
      if (inputVersions?.specification) {
        const sp = (await db.query("SELECT * FROM specifications WHERE grade=$1 AND version=$2", [inputVersions.specification.grade, inputVersions.specification.version])).rows[0];
        if (!sp) {
          reproducible = false;
          reason = "The specification version named on the certificate is gone.";
        } else versions.push({ kind: "specification", reference: `${sp.grade} v${sp.version}`, state: sp.state });
      }
      if (x.carbon_figure) {
        const fig = (await db.query("SELECT * FROM carbon_figures WHERE id=$1", [x.carbon_figure])).rows[0];
        if (!fig) {
          reproducible = false;
          reason = "The emission factor set behind the figure has been lost.";
        } else versions.push({ kind: "carbon_figure", reference: fig.id, state: fig.cache_valid ? "current" : "superseded" });
      }
      if (!reproducible) {
        return c.json({ number, issued: null, recomputed: null, agrees: null, differing_input: null, input_versions: versions, reproducible: false, reason });
      }
      const agrees = differing.length === 0;
      await record(db, { person: (await requireSession(c)).email, act: "certificate_replayed", object_kind: "certificate", object_reference: number, detail: { agrees, differing } });
      return c.json({
        number,
        issued: { content_bp: Number(x.content_bp), claim_type: x.claim_type },
        recomputed: { content_bp: recomputed.content_bp },
        agrees,
        differing_input: differing.length ? differing[0] : null,
        input_versions: versions,
        reproducible: true
      });
    });
  }
});

// server/routes/record.ts
import { createHash as createHash3 } from "node:crypto";
function entryView(e) {
  return {
    seq: Number(e.seq),
    recorded_at: e.recorded_at,
    event_at: e.event_at,
    effective_on: e.effective_on,
    person: e.person,
    site: e.site,
    object_kind: e.object_kind,
    object_reference: e.object_reference,
    act: e.act,
    detail: e.content_deleted_on ? { content_deleted_on: e.content_deleted_on, note: "Content deleted under retention; position and digest survive." } : e.detail,
    digest: e.digest,
    prev_digest: e.prev_digest,
    legal_hold: e.legal_hold,
    content_deleted_on: e.content_deleted_on || null
  };
}
function certSummary2(x) {
  return {
    number: x.number,
    version: x.version,
    site: x.site,
    grade: x.grade,
    period: x.period,
    claim_type: x.claim_type,
    content_bp: Number(x.content_bp),
    state: x.state,
    recipient: x.recipient,
    lots: x.lots,
    signer: x.signer,
    signed_at: x.signed_at
  };
}
function monthsAfter(date, months) {
  const d = /* @__PURE__ */ new Date(date + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
var recordRoutes, QUERIES, SCHEME_MONTHS, STATUTORY_MONTHS, SOURCES;
var init_record2 = __esm({
  "server/routes/record.ts"() {
    init_dist2();
    init_dbindex();
    init_middleware();
    init_record();
    recordRoutes = new Hono2();
    recordRoutes.get("/record", async (c) => {
      await requireSession(c);
      noPaginationShared(c);
      const rows = (await db.query("SELECT * FROM record_entries ORDER BY seq")).rows;
      return c.json(rows.map(entryView));
    });
    recordRoutes.get("/record/check", async (c) => {
      await requireSession(c);
      const result = await checkChain(db);
      return c.json({ holds: result.holds, first_failure: result.first_failure, entries: result.entries });
    });
    recordRoutes.patch("/record/:seq", async (c) => {
      const s = await requireSession(c);
      deny("entry_immutable", "No entry is edited and no entry is removed from the sequence.", 405);
    });
    recordRoutes.delete("/record/:seq", async (c) => {
      await requireSession(c);
      deny("entry_immutable", "No entry is edited and no entry is removed from the sequence.", 405);
    });
    QUERIES = [
      "lots_from_batch",
      "certificates_on_period",
      "certificates_under_method_version",
      "lots_released_under_unreviewed_override",
      "allocations_in_final_fortnight",
      "refused_allocations",
      "collector_declaration_departures",
      "acts_by_person",
      "exports_by_auditor"
    ];
    recordRoutes.get("/record/queries/:name", async (c) => {
      const s = await requireSession(c);
      noPaginationShared(c);
      const name = c.req.param("name");
      if (!QUERIES.includes(name)) deny("unknown_query", `The nine questions are: ${QUERIES.join(", ")}.`, 404);
      let rows = [];
      switch (name) {
        case "lots_from_batch": {
          const batch = c.req.query("batch");
          if (!batch) deny("batch_required", "Pass ?batch=BATCH-1001", 400);
          const g = await Promise.resolve().then(() => (init_genealogy(), genealogy_exports));
          const impact = await g.batchImpact(db, batch);
          rows = impact.lots;
          break;
        }
        case "certificates_on_period": {
          const period = c.req.query("period");
          rows = (await db.query("SELECT * FROM certificates WHERE period=$1 ORDER BY number", [period || null])).rows.map(certSummary2);
          break;
        }
        case "certificates_under_method_version": {
          const v = c.req.query("method_version");
          rows = (await db.query(
            `SELECT c.* FROM certificates c JOIN carbon_figures f ON f.id=c.carbon_figure
         WHERE $1 = (f.method_id || ' v' || f.method_version) ORDER BY c.number`,
            [v || null]
          )).rows.map(certSummary2);
          break;
        }
        case "lots_released_under_unreviewed_override": {
          rows = (await db.query(
            `SELECT l.reference, l.disposition, l.site, o.reference AS override, o.authorised_by, o.authorised_on
         FROM lots l JOIN overrides o ON o.lot=l.reference
         WHERE o.reviewed=false AND l.disposition='released' ORDER BY l.reference`
          )).rows;
          break;
        }
        case "allocations_in_final_fortnight": {
          const period = c.req.query("period");
          const p = (await db.query("SELECT * FROM balance_periods WHERE id=$1", [period || ""])).rows[0];
          if (!p) deny("period_required", "Pass ?period=BP-DEMO-N6-2026H1", 400);
          const to = new Date(p.period_to);
          const from = new Date(p.period_to);
          from.setUTCDate(from.getUTCDate() - 14);
          rows = (await db.query(
            `SELECT reference, lot, category, mass_g, recorded_at FROM credit_movements
         WHERE period=$1 AND direction='out' AND recorded_at::date BETWEEN $2 AND $3 ORDER BY recorded_at`,
            [p.id, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]
          )).rows.map((r) => ({ ...r, mass_g: Number(r.mass_g) }));
          break;
        }
        case "refused_allocations": {
          rows = (await db.query(
            `SELECT seq, recorded_at, person, detail FROM record_entries WHERE act='allocation_refused' ORDER BY seq`
          )).rows.map((r) => ({ seq: Number(r.seq), recorded_at: r.recorded_at, person: r.person, ...r.detail }));
          break;
        }
        case "collector_declaration_departures": {
          rows = (await db.query("SELECT * FROM findings ORDER BY opened_on")).rows.map((f) => ({
            reference: f.reference,
            collector: f.collector,
            batch: f.batch,
            description: f.description,
            departure_bp: f.departure_bp,
            state: f.state,
            opened_on: f.opened_on
          }));
          break;
        }
        case "acts_by_person": {
          const person = c.req.query("person");
          rows = (await db.query("SELECT * FROM record_entries WHERE person=$1 ORDER BY seq", [person || null])).rows.map(entryView);
          break;
        }
        case "exports_by_auditor": {
          const auditor = c.req.query("auditor") || s.email;
          rows = (await db.query("SELECT * FROM exports WHERE performed_by=$1 ORDER BY performed_at", [auditor])).rows.map((e) => ({
            reference: e.reference,
            scope: e.scope,
            performed_by: e.performed_by,
            performed_at: e.performed_at,
            result_count: e.result_count,
            digest: e.digest
          }));
          break;
        }
      }
      return c.json(rows);
    });
    recordRoutes.post("/exports", async (c) => {
      const s = await requireRole(c, ["auditor"]);
      const body = await readJson(c);
      requireFields(body, ["scope"]);
      const scope = body.scope;
      const payload = { scope, generated_at: (/* @__PURE__ */ new Date()).toISOString(), entries: [], derivations: [] };
      if (scope.period) {
        const mv = (await db.query("SELECT * FROM credit_movements WHERE period=$1 ORDER BY recorded_at", [scope.period])).rows;
        payload.ledger = mv.map((m) => ({ reference: m.reference, category: m.category, direction: m.direction, mass_g: Number(m.mass_g), lot: m.lot, effective_on: m.effective_on, digest_anchor: null }));
      }
      if (scope.lots) {
        const nodes = {};
        payload.genealogy = {};
        for (const lot of scope.lots) {
          const g = await Promise.resolve().then(() => (init_genealogy(), genealogy_exports));
          payload.genealogy[lot] = await g.upstreamGraph(db, lot);
        }
      }
      if (scope.certificates) {
        payload.certificates = [];
        for (const n2 of scope.certificates) {
          const cert = (await db.query("SELECT * FROM certificates WHERE number=$1 ORDER BY version DESC LIMIT 1", [n2])).rows[0];
          if (cert) payload.certificates.push(certSummary2(cert));
        }
      }
      if (scope.sites) payload.sites = (await db.query("SELECT * FROM sites WHERE reference = ANY($1)", [scope.sites])).rows;
      const entries = (await db.query("SELECT seq, digest FROM record_entries ORDER BY seq")).rows;
      payload.record_anchor = { entries: entries.length, last_digest: entries.length ? entries[entries.length - 1].digest : null, digests: entries.map((e) => ({ seq: Number(e.seq), digest: e.digest })) };
      payload.digest = createHash3("sha256").update(JSON.stringify(payload)).digest("hex");
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM exports")).rows[0].n;
      const ref = "EXP-" + String(n).padStart(4, "0");
      const resultCount = (payload.ledger?.length || 0) + (payload.certificates?.length || 0) + Object.keys(payload.genealogy || {}).length;
      await db.query(
        `INSERT INTO exports (reference,scope,performed_by,result_count,digest) VALUES ($1,$2,$3,$4,$5)`,
        [ref, JSON.stringify(scope), s.email, resultCount, payload.digest]
      );
      await record(db, { person: s.email, act: "export_performed", object_kind: "export", object_reference: ref, detail: { scope, result_count: resultCount } });
      await rememberIdempotent(c, 201, { reference: ref });
      return c.json({ reference: ref, ...payload }, 201);
    });
    recordRoutes.get("/exports", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM exports ORDER BY performed_at")).rows;
      return c.json(rows.map((e) => ({ reference: e.reference, scope: e.scope, performed_by: e.performed_by, performed_at: e.performed_at, result_count: e.result_count, digest: e.digest })));
    });
    SCHEME_MONTHS = 120;
    STATUTORY_MONTHS = 84;
    recordRoutes.get("/record/:seq/retention", async (c) => {
      await requireSession(c);
      const seq = Number(c.req.param("seq"));
      const e = (await db.query("SELECT * FROM record_entries WHERE seq=$1", [seq])).rows[0];
      if (!e) deny("entry_not_found", "No such entry.", 404);
      const base = String(e.recorded_at).slice(0, 10);
      const schemeUntil = monthsAfter(base, SCHEME_MONTHS);
      const statutoryUntil = monthsAfter(base, STATUTORY_MONTHS);
      let referencedUntil = schemeUntil;
      if (e.object_kind === "carbon_figure" && e.object_reference) {
        const held = (await db.query(
          `SELECT COALESCE(MAX(until), $2::text) AS u FROM (
         SELECT to_char(COALESCE(withdrawn_on, (signed_at AT TIME ZONE 'UTC')::date + INTERVAL '120 months'), 'YYYY-MM-DD') AS until
         FROM certificates WHERE carbon_figure = $1
       ) t`,
          [e.object_reference, schemeUntil]
        )).rows;
        if (held[0]?.u && String(held[0].u) > referencedUntil) referencedUntil = String(held[0].u);
      }
      const hold = (await db.query("SELECT * FROM legal_holds WHERE seq=$1 AND lifted_on IS NULL", [seq])).rows[0];
      const retainUntil = [schemeUntil, statutoryUntil, referencedUntil].sort().pop();
      return c.json({
        seq,
        scheme_months: SCHEME_MONTHS,
        statutory_months: STATUTORY_MONTHS,
        scheme_until: schemeUntil,
        statutory_until: statutoryUntil,
        referenced_until: referencedUntil,
        retain_until: retainUntil,
        legal_hold: !!hold,
        hold_reference: hold?.reference || null,
        derivation: { retain_until: "the longest of the scheme, statutory and referencing periods, computed" }
      });
    });
    recordRoutes.post("/record/:seq/legal-hold", async (c) => {
      const s = await requireRole(c, ["quality_manager", "claims_manager", "auditor"]);
      const seq = Number(c.req.param("seq"));
      const e = (await db.query("SELECT * FROM record_entries WHERE seq=$1", [seq])).rows[0];
      if (!e) deny("entry_not_found", "No such entry.", 404);
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM legal_holds")).rows[0].n;
      const ref = "HLD-" + String(n).padStart(4, "0");
      await db.query(`INSERT INTO legal_holds (reference,seq,placed_by,placed_on) VALUES ($1,$2,$3,CURRENT_DATE)`, [ref, seq, s.email]);
      await db.query("UPDATE record_entries SET legal_hold=true WHERE seq=$1", [seq]);
      await record(db, { person: s.email, act: "legal_hold_placed", object_kind: "record_entry", object_reference: String(seq), detail: { hold: ref } });
      await rememberIdempotent(c, 201, { reference: ref });
      return c.json({ reference: ref, seq, placed_by: s.email, placed_on: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) }, 201);
    });
    recordRoutes.delete("/record/:seq/legal-hold", async (c) => {
      const s = await requireRole(c, ["quality_manager", "claims_manager", "auditor"]);
      const seq = Number(c.req.param("seq"));
      await db.query("UPDATE legal_holds SET lifted_on=CURRENT_DATE WHERE seq=$1 AND lifted_on IS NULL", [seq]);
      await db.query("UPDATE record_entries SET legal_hold=false WHERE seq=$1", [seq]);
      await record(db, { person: s.email, act: "legal_hold_lifted", object_kind: "record_entry", object_reference: String(seq), detail: {} });
      return c.json({ seq, legal_hold: false });
    });
    recordRoutes.post("/record/:seq/expire", async (c) => {
      const s = await requireRole(c, ["quality_manager"]);
      const seq = Number(c.req.param("seq"));
      const e = (await db.query("SELECT * FROM record_entries WHERE seq=$1", [seq])).rows[0];
      if (!e) deny("entry_not_found", "No such entry.", 404);
      const ret = (await db.query("SELECT * FROM legal_holds WHERE seq=$1 AND lifted_on IS NULL", [seq])).rows[0];
      if (ret) deny("legal_hold_stands", "A record under hold refuses deletion.", 409);
      const base = String(e.recorded_at).slice(0, 10);
      const retainUntil = monthsAfter(base, SCHEME_MONTHS);
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      if (today < retainUntil) deny("retention_not_elapsed", `retain_until is ${retainUntil}.`, 409);
      if (e.object_kind === "certificate") deny("certificate_existence_permanent", "The one fact never deleted is that a certificate existed.", 409);
      await db.query("UPDATE record_entries SET content_deleted_on=CURRENT_DATE WHERE seq=$1", [seq]);
      await record(db, { person: s.email, act: "record_content_expired", object_kind: "record_entry", object_reference: String(seq), detail: { deleted_on: today } });
      return c.json({ seq, content_deleted_on: today, digest: e.digest, prev_digest: e.prev_digest, note: "The entry keeps its position and its digest so the chain still verifies." });
    });
    SOURCES = ["weighbridge", "control_system", "laboratory", "customer_reporting"];
    recordRoutes.post("/inbound/:source", async (c) => {
      const s = await requireSession(c);
      if (s.role === "auditor") deny("auditor_is_read_only", "An auditor writes no record.", 403);
      const source = c.req.param("source");
      if (!SOURCES.includes(source)) deny("invalid_source", "source is one of weighbridge, control_system, laboratory, customer_reporting.", 400);
      const body = await readJson(c);
      requireFields(body, ["received_at", "payload"]);
      const verbatim = typeof body.payload === "string" ? body.payload : JSON.stringify(body.payload);
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM inbound_records")).rows[0].n;
      const ref = "INB-" + String(n).padStart(4, "0");
      await db.query(
        `INSERT INTO inbound_records (reference,source,received_at,payload_verbatim,payload) VALUES ($1,$2,$3,$4,$5)`,
        [ref, source, body.received_at, verbatim, typeof body.payload === "string" ? null : JSON.stringify(body.payload)]
      );
      await record(db, { person: s.email, act: "inbound_record_kept_verbatim", object_kind: "inbound_record", object_reference: ref, detail: { source, received_at: body.received_at, bytes: verbatim.length } });
      await rememberIdempotent(c, 201, { reference: ref });
      return c.json({ reference: ref, source, received_at: body.received_at }, 201);
    });
    recordRoutes.get("/inbound", async (c) => {
      await requireSession(c);
      noPaginationShared(c);
      const rows = (await db.query("SELECT * FROM inbound_records ORDER BY received_at")).rows;
      return c.json(rows.map((r) => ({ reference: r.reference, source: r.source, received_at: r.received_at, payload_verbatim: r.payload_verbatim })));
    });
    recordRoutes.get("/reconciliation", async (c) => {
      await requireSession(c);
      const batches = (await db.query("SELECT * FROM batches")).rows;
      const runs = (await db.query("SELECT * FROM runs")).rows;
      const cons = (await db.query("SELECT * FROM consumptions")).rows;
      const outs = (await db.query("SELECT * FROM outputs")).rows;
      let massIn = 0, massOut = 0;
      for (const c2 of cons) massIn += Number(c2.mass_g);
      for (const o of outs) massOut += Number(o.mass_g);
      const residual = massIn - massOut - runs.reduce((a, r) => a + Number(r.losses_g || 0), 0);
      const periods = (await db.query("SELECT * FROM balance_periods WHERE state='open'")).rows;
      let creditMargin = 0;
      for (const p of periods) {
        const mv = (await db.query("SELECT * FROM credit_movements WHERE period=$1", [p.id])).rows;
        creditMargin += mv.reduce((a, m) => a + (m.direction === "in" ? Number(m.mass_g) : -Number(m.mass_g)), 0);
      }
      const openRuns = runs.filter((r) => !r.closed_at).length;
      const brokenCustody = batches.filter((b) => {
        const kinds = new Set(b.custody.map((x) => x.kind));
        return !["collection_site", "collector", "transport", "arrival", "weighing", "acceptance"].every((k) => kinds.has(k));
      }).length;
      const superseded = (await db.query(
        `SELECT COUNT(*)::int AS n FROM certificates c JOIN carbon_figures f ON f.id=c.carbon_figure WHERE c.state='issued' AND f.cache_valid=false`
      )).rows[0].n;
      const sources = ["weighbridge", "control_system", "laboratory", "customer_reporting"];
      const integrationAges = [];
      for (const src of sources) {
        const r = (await db.query("SELECT received_at FROM inbound_records WHERE source=$1 ORDER BY received_at DESC LIMIT 1", [src])).rows[0];
        integrationAges.push({ source: src, age_hours: r ? Math.max(0, Math.round((Date.now() - Date.parse(r.received_at)) / 36e5)) : null, most_recent: r?.received_at || null });
      }
      return c.json({
        mass_balance_residual_g: residual,
        credit_margin_g: creditMargin,
        consumptions_on_open_runs: openRuns,
        batches_with_broken_custody: brokenCustody,
        certificates_with_superseded_figures: superseded,
        integration_ages: integrationAges,
        read_at: (/* @__PURE__ */ new Date()).toISOString(),
        derivation: {
          mass_balance_residual_g: "mass in minus mass out minus recorded losses, across every run",
          credit_margin_g: "credits in minus credits out across every open period",
          integration_ages: "age of the most recent record from each source; a source that has never sent reads null"
        }
      });
    });
  }
});

// server/routes/commercial.ts
function contractView(ct, site) {
  return {
    id: ct.id,
    customer: ct.customer,
    site: ct.site,
    period: ct.period,
    committed_kg: Number(ct.committed_kg),
    floor_bp: Number(ct.floor_bp),
    delivered_kg: Number(ct.delivered_kg),
    shortfall_consequence: ct.shortfall_consequence,
    planned_site_flag: site?.confidence === "planned",
    flag_dismissible: false,
    site_confidence: site?.confidence || null
  };
}
var commercialRoutes;
var init_commercial = __esm({
  "server/routes/commercial.ts"() {
    init_dist2();
    init_dbindex();
    init_middleware();
    init_record();
    init_mail();
    init_arithmetic();
    commercialRoutes = new Hono2();
    commercialRoutes.get("/specifications", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM specifications ORDER BY grade, version DESC")).rows;
      return c.json(rows.map((s) => ({ grade: s.grade, version: s.version, issued_on: s.issued_on, state: s.state, rows: s.rows, virgin_reference: s.virgin_reference })));
    });
    commercialRoutes.get("/specifications/:grade/versions/:version", async (c) => {
      await requireSession(c);
      const s = (await db.query("SELECT * FROM specifications WHERE grade=$1 AND version=$2", [c.req.param("grade"), Number(c.req.param("version"))])).rows[0];
      if (!s) deny("specification_not_found", "No such specification version.", 404);
      return c.json({
        grade: s.grade,
        version: s.version,
        issued_on: s.issued_on,
        rows: s.rows,
        virgin_reference: s.virgin_reference
      });
    });
    commercialRoutes.post("/specifications/:grade/versions/:version/issue", async (c) => {
      const s = await requireRole(c, ["quality_manager"]);
      const body = await readJson(c);
      requireFields(body, ["customer"]);
      const grade = c.req.param("grade"), version = Number(c.req.param("version"));
      const spec = (await db.query("SELECT * FROM specifications WHERE grade=$1 AND version=$2", [grade, version])).rows[0];
      if (!spec) deny("specification_not_found", "No such specification version.", 404);
      const customer = (await db.query("SELECT * FROM customers WHERE reference=$1", [body.customer])).rows[0];
      if (!customer) deny("customer_not_found", "No such customer.", 404);
      await db.query(`INSERT INTO specification_issues (customer,grade,version,issued_on) VALUES ($1,$2,$3,CURRENT_DATE)`, [body.customer, grade, version]);
      await record(db, { person: s.email, act: "specification_issued", object_kind: "specification", object_reference: `${grade} v${version}`, detail: { customer: body.customer } });
      await rememberIdempotent(c, 201, { reference: `${grade} v${version}`, customer: body.customer });
      return c.json({ reference: `${grade} v${version}`, customer: body.customer, issued_on: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) }, 201);
    });
    commercialRoutes.get("/customers", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM customers ORDER BY reference")).rows;
      const out = [];
      for (const cust of rows) {
        const holds = (await db.query("SELECT grade, version FROM specification_issues WHERE customer=$1 ORDER BY issued_on DESC", [cust.reference])).rows;
        const conf = (await db.query("SELECT * FROM conformances WHERE customer=$1", [cust.reference])).rows;
        out.push({
          reference: cust.reference,
          contact: cust.contact,
          application: cust.application,
          industry: cust.industry,
          holds_specification_version: holds.length ? { grade: holds[0].grade, version: holds[0].version } : null,
          conformance: conf.map((cf) => ({ application: cf.application, specification: `${cf.grade} v${cf.spec_version}`, trials: cf.trials, outcome: cf.outcome }))
        });
      }
      return c.json(out);
    });
    commercialRoutes.get("/customers/:reference", async (c) => {
      await requireSession(c);
      const cust = (await db.query("SELECT * FROM customers WHERE reference=$1", [c.req.param("reference")])).rows[0];
      if (!cust) deny("customer_not_found", "No such customer.", 404);
      const holds = (await db.query("SELECT grade, version FROM specification_issues WHERE customer=$1 ORDER BY issued_on DESC", [cust.reference])).rows;
      const conf = (await db.query("SELECT * FROM conformances WHERE customer=$1", [cust.reference])).rows;
      return c.json({
        reference: cust.reference,
        contact: cust.contact,
        application: cust.application,
        industry: cust.industry,
        holds_specification_version: holds.length ? { grade: holds[0].grade, version: holds[0].version } : null,
        conformance: conf.map((cf) => ({ application: cf.application, specification: `${cf.grade} v${cf.spec_version}`, trials: cf.trials, outcome: cf.outcome }))
      });
    });
    commercialRoutes.post("/change-notices", async (c) => {
      const s = await requireRole(c, ["quality_manager"]);
      const body = await readJson(c);
      requireFields(body, ["title", "detail", "parameter", "notice_period_days"]);
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM change_notices")).rows[0].n;
      const ref = "CHG-" + String(n).padStart(4, "0");
      const specs = (await db.query("SELECT DISTINCT grade, version FROM specification_issues")).rows;
      const affectedSpecs = specs.filter((sp) => body.parameter === "relative_viscosity" || body.parameter === "all");
      const customersOwed = (await db.query("SELECT DISTINCT customer FROM specification_issues")).rows.map((r) => r.customer);
      const qualifications = (await db.query(
        `SELECT COUNT(*)::int AS n FROM conformances WHERE customer IN (SELECT reference FROM customers WHERE industry='automotive')`
      )).rows[0].n;
      await db.query(
        `INSERT INTO change_notices (reference,title,detail,parameter,notice_period_days,specifications_affected,customers_affected,qualifications_affected,raised_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          ref,
          body.title,
          body.detail,
          body.parameter,
          body.notice_period_days,
          JSON.stringify(affectedSpecs.map((x) => `${x.grade} v${x.version}`)),
          JSON.stringify(customersOwed),
          qualifications,
          s.email
        ]
      );
      await record(db, { person: s.email, act: "change_notice_raised", object_kind: "change_notice", object_reference: ref, detail: { title: body.title, parameter: body.parameter, customers_affected: customersOwed, qualifications_affected: qualifications } });
      await rememberIdempotent(c, 201, { reference: ref });
      return c.json({
        reference: ref,
        specifications_affected: affectedSpecs.map((x) => `${x.grade} v${x.version}`),
        customers_affected: customersOwed,
        qualifications_affected: qualifications,
        notice_period_days: body.notice_period_days,
        automotive_blocks: qualifications > 0
      }, 201);
    });
    commercialRoutes.get("/change-notices", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM change_notices ORDER BY reference")).rows;
      const out = [];
      for (const cn of rows) {
        const acks = (await db.query("SELECT * FROM change_acknowledgements WHERE notice=$1", [cn.reference])).rows;
        out.push({
          reference: cn.reference,
          title: cn.title,
          detail: cn.detail,
          parameter: cn.parameter,
          notice_period_days: cn.notice_period_days,
          specifications_affected: cn.specifications_affected,
          customers_affected: cn.customers_affected,
          qualifications_affected: cn.qualifications_affected,
          state: cn.state,
          raised_by: cn.raised_by,
          acknowledgements: acks.map((a) => ({ customer: a.customer, acknowledged_at: a.acknowledged_at, waived: a.waived }))
        });
      }
      return c.json(out);
    });
    commercialRoutes.post("/change-notices/:reference/notify", async (c) => {
      const s = await requireRole(c, ["quality_manager"]);
      const body = await readJson(c);
      requireFields(body, ["customer"]);
      const ref = c.req.param("reference");
      const cn = (await db.query("SELECT * FROM change_notices WHERE reference=$1", [ref])).rows[0];
      if (!cn) deny("change_notice_not_found", "No such change notice.", 404);
      const cust = (await db.query("SELECT * FROM customers WHERE reference=$1", [body.customer])).rows[0];
      if (!cust) deny("customer_not_found", "No such customer.", 404);
      await db.query(`INSERT INTO change_acknowledgements (notice,customer) VALUES ($1,$2)`, [ref, body.customer]);
      await sendMail({
        to: cust.contact,
        subject: `Change notice ${ref} requires acknowledgement`,
        text: [
          `Change: ${cn.title}`,
          cn.detail,
          "",
          `Specifications affected: ${cn.specifications_affected.join(", ") || "none"}`,
          `Notice period: ${cn.notice_period_days} days`,
          "",
          "Please acknowledge this change notice. A change touching a qualification-relevant parameter blocks release until acknowledgement is recorded."
        ].join("\n")
      });
      await record(db, { person: s.email, act: "change_notice_customer_notified", object_kind: "change_notice", object_reference: ref, detail: { customer: body.customer } });
      return c.json({ reference: ref, customer: body.customer, notified: true }, 201);
    });
    commercialRoutes.post("/change-notices/:reference/release", async (c) => {
      const s = await requireRole(c, ["quality_manager"]);
      const ref = c.req.param("reference");
      const cn = (await db.query("SELECT * FROM change_notices WHERE reference=$1", [ref])).rows[0];
      if (!cn) deny("change_notice_not_found", "No such change notice.", 404);
      const owed = cn.customers_affected || [];
      const acks = (await db.query("SELECT * FROM change_acknowledgements WHERE notice=$1", [ref])).rows;
      const acknowledged = new Set(acks.map((a) => a.customer));
      const waived = new Set(acks.filter((a) => a.waived).map((a) => a.customer));
      const outstanding = owed.filter((x) => !acknowledged.has(x));
      const automotiveOutstanding = outstanding.filter((x) => {
        const cust = (async () => (await db.query("SELECT industry FROM customers WHERE reference=$1", [x])).rows[0])();
        return true;
      });
      if (outstanding.length) {
        return c.json({ error: "notice_outstanding", message: `Customers owed notice: ${outstanding.join(", ")}.`, outstanding }, 409);
      }
      await db.query(`UPDATE change_notices SET state='released', released_at=now() WHERE reference=$1`, [ref]);
      await record(db, { person: s.email, act: "change_notice_released", object_kind: "change_notice", object_reference: ref, detail: {} });
      return c.json({ reference: ref, state: "released" });
    });
    commercialRoutes.post("/change-notices/:reference/waive", async (c) => {
      const s = await requireRole(c, ["quality_manager"]);
      const body = await readJson(c);
      requireFields(body, ["customer"]);
      const ref = c.req.param("reference");
      await db.query(`INSERT INTO change_acknowledgements (notice,customer,waived) VALUES ($1,$2,true)`, [ref, body.customer]);
      await record(db, { person: s.email, act: "change_notice_waived", object_kind: "change_notice", object_reference: ref, detail: { customer: body.customer } });
      return c.json({ reference: ref, customer: body.customer, waived: true }, 201);
    });
    commercialRoutes.get("/contracts", async (c) => {
      await requireSession(c);
      const rows = (await db.query("SELECT * FROM contracts ORDER BY id")).rows;
      const out = [];
      for (const ct of rows) {
        const site = (await db.query("SELECT * FROM sites WHERE reference=$1", [ct.site])).rows[0];
        out.push(contractView(ct, site));
      }
      return c.json(out);
    });
    commercialRoutes.get("/contracts/:id/projection", async (c) => {
      await requireSession(c);
      const ct = (await db.query("SELECT * FROM contracts WHERE id=$1", [c.req.param("id")])).rows[0];
      if (!ct) deny("contract_not_found", "No such contract.", 404);
      const site = (await db.query("SELECT * FROM sites WHERE reference=$1", [ct.site])).rows[0];
      const allocs = (await db.query("SELECT * FROM allocations WHERE contract=$1 ORDER BY allocated_at", [ct.id])).rows;
      let deliveredKg = Number(ct.delivered_kg);
      let weighted = 0;
      const breakdown = [];
      for (const a of allocs) {
        const lot = (await db.query("SELECT * FROM lots WHERE reference=$1", [a.lot])).rows[0];
        if (!lot) continue;
        const mv = (await db.query(`SELECT COALESCE(SUM(mass_g),0) AS g FROM credit_movements WHERE lot=$1 AND direction='out'`, [a.lot])).rows[0];
        const attachedG = Number(mv.g);
        const contentBp2 = Math.floor(attachedG * 1e4 / Number(lot.mass_g));
        breakdown.push({ allocation: a.reference, lot: a.lot, mass_kg: Number(a.mass_kg), content_bp: contentBp2, decided_by: a.decided_by, favoured_over: a.favoured_over });
        deliveredKg += Number(a.mass_kg);
        weighted += Number(a.mass_kg) * 1e3 * contentBp2 / 1e4 / 1e3;
      }
      const committed = Number(ct.committed_kg);
      const running = deliveredKg > 0 ? Math.floor(weighted / deliveredKg) : 0;
      const required = requiredRemainingBp(committed, deliveredKg, running, Number(ct.floor_bp));
      const state = required > 1e4 ? "unreachable" : "on_track";
      if (state === "unreachable" && !ct.unreachable_since) {
        await db.query("UPDATE contracts SET unreachable_since=CURRENT_DATE WHERE id=$1", [ct.id]);
        ct.unreachable_since = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      }
      return c.json({
        ...contractView(ct, site),
        delivered_kg: deliveredKg,
        committed_kg: committed,
        running_content_bp: running,
        floor_bp: Number(ct.floor_bp),
        required_remaining_bp: required,
        state,
        unreachable_since: ct.unreachable_since || null,
        allocation_that_made_it_so: breakdown.length ? breakdown[breakdown.length - 1].allocation : null,
        allocations: breakdown,
        derivation: {
          required_remaining_bp: "(committed * floor - delivered * running) / (committed - delivered), floored",
          running_content_bp: "mass-weighted mean of allocated lots, floored"
        }
      });
    });
    commercialRoutes.post("/contracts/:id/allocations", async (c) => {
      const s = await requireRole(c, ["claims_manager"]);
      const body = await readJson(c);
      requireFields(body, ["lot", "mass_kg"]);
      const id = c.req.param("id");
      const ct = (await db.query("SELECT * FROM contracts WHERE id=$1", [id])).rows[0];
      if (!ct) deny("contract_not_found", "No such contract.", 404);
      const existing = (await db.query("SELECT 1 FROM allocations WHERE lot=$1", [body.lot])).rows[0];
      if (existing) deny("already_allocated", "A claim already allocated to one contract is refused a second attachment.", 409);
      const n = (await db.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(reference,'\\D','','g'),''))::bigint,0)+1 AS n FROM allocations")).rows[0].n;
      const ref = "ALC-" + String(n).padStart(4, "0");
      await db.query(
        `INSERT INTO allocations (reference,contract,lot,mass_kg,decided_by,favoured_over) VALUES ($1,$2,$3,$4,$5,$6)`,
        [ref, id, body.lot, body.mass_kg, body.decided_by || s.email, JSON.stringify(body.favoured_over || [])]
      );
      await record(db, {
        person: s.email,
        act: "lot_allocated_to_contract",
        object_kind: "allocation",
        object_reference: ref,
        detail: { contract: id, lot: body.lot, mass_kg: body.mass_kg, decided_by: body.decided_by || s.email, favoured_over: body.favoured_over || [] }
      });
      await rememberIdempotent(c, 201, { reference: ref });
      return c.json({ reference: ref, contract: id, lot: body.lot, mass_kg: body.mass_kg, decided_by: body.decided_by || s.email, favoured_over: body.favoured_over || [] }, 201);
    });
    commercialRoutes.get("/outputs/:reference/byproduct", async (c) => {
      await requireSession(c);
      const o = (await db.query("SELECT * FROM outputs WHERE reference=$1", [c.req.param("reference")])).rows[0];
      if (!o) deny("output_not_found", "No such output.", 404);
      if (o.kind !== "byproduct" || o.disposition !== "sold") deny("not_a_sold_byproduct", "A share answers for a sold byproduct.", 409);
      const run = (await db.query("SELECT * FROM runs WHERE reference=$1", [o.run])).rows[0];
      const outs = (await db.query("SELECT * FROM outputs WHERE run=$1", [o.run])).rows;
      const totalOut = outs.reduce((a, x) => a + Number(x.mass_g), 0);
      const share = shareBp(Number(o.mass_g), totalOut);
      const figure = (await db.query("SELECT * FROM carbon_figures WHERE lot IN (SELECT lot FROM outputs WHERE run=$1 AND lot IS NOT NULL) LIMIT 1", [o.run])).rows[0];
      const creditAttached = (await db.query(
        `SELECT COALESCE(SUM(mass_g),0) AS g FROM credit_movements m WHERE m.lot IN (SELECT lot FROM outputs WHERE run=$1 AND lot IS NOT NULL) AND direction='out'`,
        [o.run]
      )).rows[0];
      return c.json({
        reference: o.reference,
        run: o.run,
        byproduct_mass_g: Number(o.mass_g),
        total_output_mass_g: totalOut,
        share_bp: share,
        claim_share_g: Math.floor(share * Number(creditAttached.g) / 1e4),
        emissions_share_mg: figure ? Math.floor(share * Number(figure.value_mg_per_kg) / 1e4) : null,
        allocation_basis: "mass",
        derivation: { share_bp: "byproduct_mass_g * 10000 / total_output_mass_g, floored, on the period allocation basis of mass" }
      });
    });
  }
});

// server/app.ts
var app_exports = {};
__export(app_exports, {
  app: () => app
});
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
var app, here, distDir, MIME;
var init_app = __esm({
  "server/app.ts"() {
    init_dist2();
    init_logger();
    init_dbindex();
    init_middleware();
    init_public();
    init_auth();
    init_reference();
    init_intake();
    init_balance();
    init_carbon();
    init_certificates2();
    init_record2();
    init_commercial();
    app = new Hono2();
    app.use("*", logger());
    app.use("/api/*", async (c, next) => {
      c.header("Cache-Control", "no-store", { append: false });
      await next();
    });
    app.use("/api/*", async (c, next) => {
      if (!["POST", "PATCH", "PUT", "DELETE"].includes(c.req.method)) return next();
      if (c.req.path === "/api/auth/login") return next();
      return idempotent(c, next);
    });
    app.get("/api/health", async (c) => {
      try {
        await db.query("SELECT 1");
        return c.json({ status: "ok", ready: true });
      } catch (e) {
        return c.json({ status: "unavailable", ready: false }, 503);
      }
    });
    app.route("/api", publicSite);
    app.route("/api", authRoutes);
    app.route("/api", referenceRoutes);
    app.route("/api", intakeRoutes);
    app.route("/api", balanceRoutes);
    app.route("/api", carbonRoutes);
    app.route("/api", certificateRoutes);
    app.route("/api", recordRoutes);
    app.route("/api", commercialRoutes);
    here = dirname(fileURLToPath(import.meta.url));
    distDir = join(here, "..", "..", "dist");
    MIME = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".txt": "text/plain; charset=utf-8"
    };
    app.get("*", (c) => {
      const url = new URL(c.req.url);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith("/api/")) return c.json({ error: "not_found" }, 404);
      if (pathname === "/favicon.ico") pathname = "/favicon.svg";
      if (pathname.includes("..")) return c.text("not found", 404);
      const candidate = join(distDir, pathname);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        const ext = pathname.slice(pathname.lastIndexOf("."));
        const cache = ext === ".woff2" || ext === ".js" || ext === ".css" ? "public, max-age=31536000, immutable" : "no-cache";
        return c.body(readFileSync(candidate), 200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": cache });
      }
      const index = join(distDir, "index.html");
      if (existsSync(index)) {
        return c.body(readFileSync(index), 200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
      }
      return c.text("not found", 404);
    });
    app.notFound((c) => c.json({ error: "not_found" }, 404));
    app.onError((err, c) => {
      const status = err.status || 500;
      const code = err.code || (status >= 500 ? "internal" : "error");
      if (status >= 500) console.error(err);
      return c.json({ error: code, message: err.message }, status);
    });
  }
});

// server/start.ts
import { execFileSync } from "node:child_process";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { dirname as dirname2, join as join2 } from "node:path";
var here2 = dirname2(fileURLToPath2(import.meta.url));
var attempt = async (fn, tries = 30, waitMs = 2e3) => {
  for (let i = 0; i < tries; i++) {
    try {
      await fn();
      return;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
};
await attempt(async () => {
  execFileSync(process.execPath, [join2(here2, "seed.mjs")], { stdio: "inherit" });
});
var { serve: serve2 } = await Promise.resolve().then(() => (init_dist(), dist_exports));
var { app: app2 } = await Promise.resolve().then(() => (init_app(), app_exports));
var port2 = Number(process.env.PORT || 4173);
serve2({ fetch: app2.fetch, port: port2, hostname: "0.0.0.0" }, (info) => {
  console.log("ravel serving on 0.0.0.0:" + info.port);
});
