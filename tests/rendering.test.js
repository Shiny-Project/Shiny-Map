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

test("the runtime uses the installed OpenLayers version and supports fractional zoom with integer fit", async () => {
    const result = await global.page.evaluate(() => {
        const view = new ol.View({ center: [0, 0], zoom: 7.3 });
        const before = view.getZoom();
        view.fit([0, 0, 500000, 500000], { size: [1920, 1080], maxZoom: 9 });
        const fitted = view.getZoom();
        view.setZoom(7.3);
        return { version: ol.VERSION, before, fitted, after: view.getZoom() };
    });
    assert.equal(result.version, require("ol/package.json").version);
    assert.ok(Math.abs(result.before - 7.3) < 1e-9);
    assert.equal(Number.isInteger(result.fitted), true);
    assert.ok(Math.abs(result.after - 7.3) < 1e-9);
});

test("unchanged map readiness reuses its painted frame", async () => {
    const page = global.page;
    await Renderer.waitForReady(page);
    await page.evaluate(() => {
        window.regressionRenderSync = map.renderSync;
        window.regressionRenderCount = 0;
        map.renderSync = function () {
            window.regressionRenderCount++;
            return window.regressionRenderSync.call(this);
        };
    });
    try {
        await Renderer.waitForReady(page);
        await Renderer.waitForReady(page);
        assert.equal(await page.evaluate(() => window.regressionRenderCount), 0);
    } finally {
        await page.evaluate(() => { map.renderSync = window.regressionRenderSync; });
    }
});

test("rendering aligns centers to physical pixels and bounds polar GeoJSON coordinates", async () => {
    const result = await global.page.evaluate(() => {
        const state = map.getView().getState();
        const features = new ol.format.GeoJSON().readFeatures({
            type: "Feature",
            geometry: { type: "Point", coordinates: [0, -90] },
            properties: {},
        }, { featureProjection: "EPSG:3857" });
        return {
            pixels: state.center.map((value) => value / state.resolution * devicePixelRatio),
            south: features[0].getGeometry().getCoordinates()[1],
        };
    });
    for (const value of result.pixels) assert.ok(Math.abs(value - Math.round(value)) < 1e-8);
    assert.equal(result.south, -20037508.342789244);
});

test("a changed feature is painted before readiness resolves", async () => {
    const page = await Renderer.createPage(global.browser, "index.html");
    try {
        await page.evaluate(() => {
            const japan = getLayerByName("world_base").getSource().getFeatures()
                .find((feature) => feature.get("code") === "JPN");
            japan.setStyle(new ol.style.Style({ fill: new ol.style.Fill({ color: "red" }) }));
            map.getView().setCenter(ol.proj.fromLonLat([139.69, 35.69]));
        });
        await Renderer.waitForReady(page);
        const pixel = await page.evaluate(() => {
            const canvas = document.querySelector(".ol-layer canvas");
            return Array.from(canvas.getContext("2d").getImageData(960, 540, 1, 1).data);
        });
        assert.deepEqual(pixel, [255, 0, 0, 255]);
    } finally {
        await page.close();
    }
});

test("paint reuse still waits for a newly added delayed icon", async () => {
    const page = await Renderer.createPage(global.browser, "index.html");
    let timer;
    try {
        await page.setRequestInterception(true);
        page.on("request", (request) => {
            if (request.url().includes("paint-cache-delay")) {
                timer = setTimeout(() => { request.continue().catch(() => {}); }, 250);
            } else {
                request.continue();
            }
        });
        await page.evaluate(() => {
            const coordinate = ol.proj.fromLonLat([139.69, 35.69]);
            map.getView().setCenter(coordinate);
            const feature = new ol.Feature({ geometry: new ol.geom.Point(coordinate) });
            feature.setStyle(new ol.style.Style({
                image: new ol.style.Icon({ src: "/data/images/is_7.png?paint-cache-delay", scale: 0.05 }),
            }));
            map.addLayer(new ol.layer.Vector({ source: new ol.source.Vector({ features: [feature] }) }));
        });
        const started = Date.now();
        await Renderer.waitForReady(page);
        assert.ok(Date.now() - started >= 150, "Readiness reused a frame before the icon loaded.");
        const pixel = await page.evaluate(() => Array.from(
            document.querySelector(".ol-layer canvas").getContext("2d").getImageData(950, 530, 1, 1).data
        ));
        assert.ok(pixel[0] > 150 && pixel[1] < 60 && pixel[2] > 150, "The purple icon was not painted.");
    } finally {
        clearTimeout(timer);
        await page.close();
    }
});

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
    const service = require("../backend/service/MapService");
    const originalReport = service.shindoEarlyReport;
    let screenshotStarted;
    let queueStarted;
    let failScreenshot;
    const screenshotReady = new Promise((resolve) => { screenshotStarted = resolve; });
    const queueReady = new Promise((resolve) => { queueStarted = resolve; });
    const heldScreenshot = new Promise((resolve, reject) => {
        failScreenshot = () => reject(new Error("Injected screenshot failure"));
    });
    let calls = 0;
    service.shindoEarlyReport = function (...args) {
        const result = originalReport.apply(this, args);
        if (++calls === 2) queueStarted();
        return result;
    };
    let first = true;
    page.screenshot = function (...args) {
        if (first) {
            first = false;
            screenshotStarted();
            return heldScreenshot;
        }
        return original.apply(this, args);
    };
    const requests = [];
    const waitFor = (promise, message) => Promise.race([
        promise,
        sleep(3000).then(() => { throw new Error(message); }),
    ]);
    try {
        // Concurrent fetches may reach the server in either order. Hold the
        // failing screenshot until the second handler has actually queued.
        requests.push(callApi());
        await waitFor(screenshotReady, "First request did not reach screenshot.");
        requests.push(callApi());
        await waitFor(queueReady, "Second request did not queue.");
        failScreenshot();
        const [failed, queued] = await Promise.all(requests);
        assert.equal(failed.status, 500);
        assert.equal(failed.body.error.name, "map_render_failed");
        assert.equal(failed.body.path, undefined);
        assertSuccess(queued);
    } finally {
        failScreenshot();
        service.shindoEarlyReport = originalReport;
        page.screenshot = original;
        await Promise.allSettled(requests);
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
