const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const host = "singularity-blogs-image-compressor.vercel.app";
function compile(path, overrides = {}) {
  return ts.transpileModule(readFileSync(resolve(__dirname, "..", path), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, ...overrides },
  }).outputText;
}

function analytics({ hostname = host, pathname = "/", mode = "production", disabled, gtag, browser = true } = {}) {
  const window = {
    location: { hostname, pathname, href: `https://${hostname}/?filename=private-photo.jpg#private` },
    gtag,
  };
  const exports = {};
  vm.runInNewContext(compile("lib/analytics.ts"), {
    exports, process: { env: { NODE_ENV: mode, NEXT_PUBLIC_GA_DISABLED: disabled } },
    ...(browser ? { window } : {}),
  });
  const commands = () => Array.from(window.dataLayer || [], (args) => Array.from(args));
  const events = () => commands().filter(([command]) => command === "event");
  return { api: exports, window, commands, events };
}

const usage = { mimeType: "image/png", inputBytes: 4 * 1024 * 1024, resizeMode: "default" };

test("development, previews, SSR and the kill switch do not initialize or record", () => {
  for (const options of [
    { mode: "development" }, { hostname: "localhost" },
    { hostname: "compressor-git-preview.vercel.app" }, { pathname: "/missing-page" },
    { browser: false }, { disabled: "true" },
  ]) {
    const { api, events, window } = analytics(options);
    assert.equal(api.initializeAnalytics(), false);
    api.trackCompressionSuccess(usage, 100);
    api.trackCompressionFailure(usage, 500);
    assert.equal(events().length, 0);
    assert.equal(window.gtag, undefined);
  }
});

test("initialization sends one sanitized page view even after remounts", () => {
  const { api, events, commands } = analytics();
  assert.equal(api.initializeAnalytics(), true);
  assert.equal(api.initializeAnalytics(), true);
  assert.equal(events().length, 1);
  const config = commands().find(([command]) => command === "config")[2];
  assert.equal(config.send_page_view, false);
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  assert.equal(events()[0][1], "page_view");
  assert.equal(events()[0][2].page_location, `https://${host}/`);
  assert.equal(events()[0][2].page_referrer, "");
  assert.ok(!JSON.stringify(commands()).includes("private"));
});

test("usage events contain categorical metadata without arbitrary upload fields", () => {
  const { api, events } = analytics();
  api.initializeAnalytics();
  api.trackCompressionSuccess({ ...usage, name: "private-photo.jpg", contents: "private-pixels" }, 1024 * 1024);
  const [, name, parameters] = events()[1];
  assert.equal(name, "compression_success");
  assert.equal(parameters.input_format, "png");
  assert.equal(parameters.input_size, "1_to_5_mb");
  assert.equal(parameters.size_reduction, "75_to_100_percent");
  assert.equal(parameters.output_format, "webp");
  assert.ok(!JSON.stringify(events()).includes("private"));
  api.trackCompressionSuccess({ ...usage, mimeType: "__proto__" }, usage.inputBytes + 1);
  assert.equal(events()[2][2].input_format, "other");
  assert.equal(events()[2][2].size_reduction, "increased");
});

test("failure categories cover validation, server and network errors", () => {
  const { api, events } = analytics();
  api.initializeAnalytics();
  for (const [status, reason] of [["missing_file", "missing_file"], [400, "invalid_file"],
    [413, "upload_too_large"], [415, "unsupported_type"], [500, "server_error"],
    [502, "server_error"], [null, "request_error"], [200, "request_error"]]) {
    api.trackCompressionFailure(usage, status);
    assert.equal(events().at(-1)[2].failure_reason, reason);
  }
  assert.equal(api.getResizeMode("", ""), "default");
  assert.equal(api.getResizeMode("960", ""), "width");
  assert.equal(api.getResizeMode("", "540"), "height");
  assert.equal(api.getResizeMode("960", "540"), "exact");
  assert.equal(api.getResizeMode("   ", ""), "default");
});

test("a broken Analytics tag cannot throw into compression", () => {
  const { api, window } = analytics();
  api.initializeAnalytics();
  window.gtag = () => { throw new Error("Blocked tag"); };
  assert.doesNotThrow(() => api.trackCompressionSuccess(usage, 100));
  assert.doesNotThrow(() => api.trackCompressionFailure(usage, 500));
  assert.equal(analytics({ gtag: window.gtag }).api.initializeAnalytics(), false);
});

// Exercise the page's actual submit handler with a synthetic file and mocked HTTP responses.
// This catches misplaced/missing event calls and accidental forwarding of filename/error text.
function pageHarness(fetch, { file = new File(["synthetic image"], "private-photo.jpg", { type: "image/png" }) } = {}) {
  const analyticsInstance = analytics();
  analyticsInstance.api.initializeAnalytics();
  const states = [file, "960", "", false, null, null, null];
  let stateIndex = 0;
  let downloads = 0;
  const element = (type, props) => ({ type, props });
  const exports = {};
  vm.runInNewContext(compile("app/page.tsx", { jsx: ts.JsxEmit.ReactJSX }), {
    exports, FormData, fetch,
    URL: { createObjectURL: () => "blob:private-preview", revokeObjectURL: () => {} },
    document: {
      createElement: () => ({ click: () => { downloads++; }, remove: () => {} }),
      body: { appendChild: () => {} },
    },
    require: (name) => {
      if (name === "react") return {
        useState: () => { const index = stateIndex++; return [states[index], (next) => {
          states[index] = typeof next === "function" ? next(states[index]) : next;
        }]; },
        useMemo: (fn) => fn(), useEffect: () => {},
      };
      if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
      if (name === "../lib/analytics") return analyticsInstance.api;
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const tree = exports.default();
  const form = tree.props.children.find((child) => child?.type === "form");
  return { submit: () => form.props.onSubmit({ preventDefault() {} }), events: analyticsInstance.events,
    error: () => states[4], downloads: () => downloads };
}

test("a successful UI submission records one success and still downloads", async () => {
  const page = pageHarness(async () => new Response("synthetic webp", {
    status: 200, headers: { "x-compressed-bytes": "14" },
  }));
  await page.submit();
  assert.equal(page.downloads(), 1);
  assert.equal(page.error(), null);
  assert.deepEqual(page.events().map((event) => event[1]), ["page_view", "compression_success"]);
  assert.equal(page.events()[1][2].resize_mode, "width");
  assert.ok(!JSON.stringify(page.events()).includes("private"));
});

test("HTTP and network failures record categories without error messages or downloads", async () => {
  for (const [fetch, reason] of [
    [async () => new Response("private-photo.jpg is invalid", { status: 415 }), "unsupported_type"],
    [async () => new Response("private server detail", { status: 500 }), "server_error"],
    [async () => { throw new Error("private network detail"); }, "request_error"],
  ]) {
    const page = pageHarness(fetch);
    await page.submit();
    assert.equal(page.downloads(), 0);
    assert.ok(page.error());
    assert.deepEqual(page.events().map((event) => event[1]), ["page_view", "compression_failure"]);
    assert.equal(page.events()[1][2].failure_reason, reason);
    assert.ok(!JSON.stringify(page.events()).includes("private"));
  }
});

test("missing-file validation records a failure without issuing an upload", async () => {
  const page = pageHarness(() => { throw new Error("Should not fetch"); }, { file: null });
  await page.submit();
  assert.equal(page.error(), "Please choose an image file.");
  assert.equal(page.events()[1][2].failure_reason, "missing_file");
});
