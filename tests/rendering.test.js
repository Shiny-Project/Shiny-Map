const assert = require("node:assert/strict");
const fs = require("node:fs");
const { before, after, test } = require("node:test");
const { setTimeout: sleep } = require("node:timers/promises");
const Renderer = require("../backend/service/MapRenderer");
const fixtures = require("./map-baseline/fixtures.json");
const fixture = fixtures.find((item) => item.id === "shindo-early-report");

let server;
let startupError;

before(async () => {
    process.env.SENTRY_DSN = "";
    server = require("../backend");
    server.on("error", (error) => { startupError = error; });
    const deadline = Date.now() + 30000;
    while (!global.isBrowserLoaded) {
        if (startupError || global.browserInitializationError) {
            throw startupError || global.browserInitializationError;
        }
        if (Date.now() > deadline) throw new Error("Test browser did not initialize.");
        await sleep(25);
    }
});

after(async () => {
    if (global.browser) await global.browser.close();
    if (server) {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
});

async function callApi() {
    const response = await fetch("http://localhost:3000" + fixture.endpoint, {
        method: fixture.method,
        body: new URLSearchParams({ shindo: JSON.stringify(fixture.params.shindo) }),
        signal: AbortSignal.timeout(15000),
    });
    return { status: response.status, body: await response.json() };
}

function assertSuccess(result) {
    assert.equal(result.status, 200);
    assert.equal(typeof result.body.path, "string");
    assert.equal(fs.existsSync(result.body.path), true);
}

test("a failed local image returns an error promptly and the next request recovers", async (t) => {
    const page = global.page;
    const targetUrl = "http://localhost:3000/data/images/is_7.png?rendering-regression=failure";
    await page.setRequestInterception(true);
    let held;
    let received;
    const intercepted = new Promise((resolve) => { received = resolve; });
    const intercept = (request) => {
        if (request.url() === targetUrl) {
            held = request;
            received();
        } else {
            request.continue();
        }
    };
    page.on("request", intercept);
    let abortTimer;
    try {
        await page.evaluate((url) => {
            window.regressionImage = new Image();
            window.regressionImage.onerror = () => {};
            window.regressionImage.src = url;
        }, targetUrl);
        await Promise.race([
            intercepted,
            sleep(3000).then(() => { throw new Error("Local resource did not start."); }),
        ]);
        const started = Date.now();
        abortTimer = setTimeout(() => { held.abort("failed").catch(() => {}); }, 150);
        const failed = await callApi();
        assert.equal(failed.status, 500);
        assert.equal(failed.body.error.name, "map_render_failed");
        assert.equal(failed.body.path, undefined);
        const elapsedMs = Date.now() - started;
        assert.ok(elapsedMs < 3000, "Failure waited for the old network-idle timeout.");
        t.diagnostic("Failed local resource returned HTTP 500 in " + elapsedMs + " ms.");
    } finally {
        clearTimeout(abortTimer);
        page.off("request", intercept);
        await page.setRequestInterception(false);
    }
    assertSuccess(await callApi());
});

test("a screenshot failure releases the lock for an already queued request", async () => {
    const page = global.page;
    const original = page.screenshot;
    let first = true;
    page.screenshot = function (...args) {
        if (first) {
            first = false;
            return Promise.reject(new Error("Injected screenshot failure"));
        }
        return original.apply(this, args);
    };
    try {
        const [failed, queued] = await Promise.all([callApi(), callApi()]);
        assert.equal(failed.status, 500);
        assert.equal(failed.body.error.name, "map_render_failed");
        assert.equal(failed.body.path, undefined);
        assertSuccess(queued);
    } finally {
        page.screenshot = original;
    }
});

for (const resource of ["/data/world_base.json", "/data/images/is_7.png"]) {
    test("page readiness rejects a failed required resource: " + resource, async () => {
        const browser = global.browser;
        const original = browser.newPage;
        browser.newPage = async function () {
            const page = await original.call(this);
            await page.setRequestInterception(true);
            page.on("request", (request) => {
                if (new URL(request.url()).pathname === resource) request.abort("failed");
                else request.continue();
            });
            return page;
        };
        try {
            await assert.rejects(
                Renderer.createPage(browser, "index.html"),
                (error) => error.message.includes("Resource failed:") && error.message.includes(resource)
            );
        } finally {
            browser.newPage = original;
        }
    });
}

test("page readiness waits for delayed GeoJSON parsing and map rendering", async () => {
    const browser = global.browser;
    const original = browser.newPage;
    browser.newPage = async function () {
        const page = await original.call(this);
        await page.setRequestInterception(true);
        page.on("request", (request) => {
            if (new URL(request.url()).pathname === "/data/world_base.json") {
                setTimeout(() => { request.continue().catch(() => {}); }, 250);
            } else {
                request.continue();
            }
        });
        return page;
    };
    let page;
    const started = Date.now();
    try {
        page = await Renderer.createPage(browser, "index.html");
        assert.ok(Date.now() - started >= 250);
        assert.equal(await page.evaluate(() => getLayerByName("world_base").getSource().getFeatures().length), 242);
    } finally {
        browser.newPage = original;
        if (page) await page.close();
    }
});
