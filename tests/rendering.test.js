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

test("typhoon forecasts connect from the current position and fit geodesic error circles", async () => {
    const page = global.typhoonPage;
    const info = {
        points: [
            { type: 1, coordinate: [138, 43], intensity: 2 },
            { type: 2, coordinate: [140, 45], intensity: 3 },
            { type: 3, coordinate: [143, 50], intensity: 4, circles: [{ type: 3, radius: 400000 }] },
            { type: 3, coordinate: [149, 55], intensity: 5, circles: [{ type: 3, radius: 600000 }] },
        ],
    };
    try {
        await page.evaluate((data) => drawTyphoonInfo(data), info);
        await Renderer.waitForReady(page);
        const result = await page.evaluate(() => {
            const features = TyphoonInfoLayer.getSource().getFeatures();
            const resolution = map.getView().getResolution();
            const lines = features.filter((feature) => feature.getGeometry().getType() === "LineString");
            const circles = features.filter((feature) => feature.get("circle")?.type === 3);
            const point = features.find((feature) => feature.get("type") === 3);
            const pointStyle = point.getStyleFunction()(point, resolution);
            return {
                lines: lines.map((feature) => {
                    const style = feature.getStyleFunction();
                    return {
                        now: feature.get("now").type,
                        next: feature.get("next").type,
                        dash: style(feature, resolution).getStroke().getLineDash(),
                        zoomedDash: style(feature, resolution / 2).getStroke().getLineDash(),
                    };
                }),
                circles: circles.map((feature) => {
                    const geometry = feature.getGeometry();
                    return {
                        radius: feature.get("circle").radius,
                        center: feature.get("point").coordinate,
                        coordinates: geometry.clone().transform("EPSG:3857", "EPSG:4326").getCoordinates()[0],
                        pixels: geometry.getCoordinates()[0].map((coordinate) => map.getPixelFromCoordinate(coordinate)),
                        zIndex: feature.getStyle().getZIndex(),
                    };
                }),
                pointZIndex: pointStyle.getZIndex(),
                pointFill: pointStyle.getImage().getFill().getColor(),
            };
        });
        assert.deepEqual(result.lines.map(({ now, next }) => [now, next]), [[1, 2], [2, 3], [3, 3]]);
        assert.equal(result.lines[0].dash, null);
        for (const line of result.lines.slice(1)) {
            assert.deepEqual(line.dash, [8, 6]);
            assert.deepEqual(line.zoomedDash, line.dash);
        }
        assert.equal(result.circles.length, 2);
        const { getDistance } = await import("ol/sphere.js");
        for (const circle of result.circles) {
            for (const coordinate of circle.coordinates) {
                assert.ok(Math.abs(getDistance(circle.center, coordinate) - circle.radius) < 1);
            }
            for (const [x, y] of circle.pixels) {
                assert.ok(x >= 99 && x <= 1721 && y >= 99 && y <= 981, "Error circle is cropped.");
            }
            assert.ok(circle.zIndex < result.pointZIndex);
        }
        assert.equal(result.pointFill, "#ffffff");
    } finally {
        await page.evaluate(() => clearTyphoonInfo());
    }
});

test("forecast paths cross the date line without a world-spanning segment or mutating input", async () => {
    const page = global.typhoonPage;
    try {
        const result = await page.evaluate(() => {
            const data = { points: [
                { type: 2, coordinate: [179, 30], intensity: 3, circles: [{ type: 3, radius: 500000 }] },
                { type: 3, coordinate: [-179, 31], intensity: 3, circles: [
                    { type: 3, radius: 200000 },
                    { type: 3, radius: 0 },
                    { type: 3, radius: -1 },
                    { type: 3, radius: null },
                    { type: 3, radius: "200000" },
                ] },
            ] };
            const original = JSON.stringify(data);
            drawTyphoonInfo(data);
            const features = TyphoonInfoLayer.getSource().getFeatures();
            const line = features.find((feature) => feature.getGeometry().getType() === "LineString");
            const extent = TyphoonInfoLayer.getSource().getExtent();
            return {
                unchanged: JSON.stringify(data) === original,
                line: line.getGeometry().clone().transform("EPSG:3857", "EPSG:4326").getCoordinates(),
                width: extent[2] - extent[0],
                circles: features.filter((feature) => feature.get("circle")).length,
            };
        });
        await Renderer.waitForReady(page);
        assert.equal(result.unchanged, true);
        assert.ok(Math.abs(result.line[0][0] - 179) < 1e-9);
        assert.ok(Math.abs(result.line[1][0] - 181) < 1e-9);
        assert.ok(result.width < 1000000, "The track spans the entire world.");
        assert.equal(result.circles, 1);
    } finally {
        await page.evaluate(() => clearTyphoonInfo());
    }
});

test("legacy forecasts still render without error radii and repeated typhoon draws clear their state", async () => {
    const page = global.typhoonPage;
    const info = JSON.parse(JSON.stringify(fixtures.find((item) => item.id === "typhoon-track").params.typhoon_info));
    for (const point of info.points.filter((point) => point.type === 3)) delete point.circles;
    try {
        const result = await page.evaluate((data) => {
            drawTyphoonInfo(data);
            drawTyphoonInfo(data);
            const features = TyphoonInfoLayer.getSource().getFeatures();
            const legacy = {
                layers: map.getLayers().getArray().filter((layer) => layer.get("name") === "typhoon_info").length,
                windCircles: features.filter((feature) => [1, 2].includes(feature.get("circle")?.type)).length,
                errorCircles: features.filter((feature) => feature.get("circle")?.type === 3).length,
            };
            drawTyphoonInfo({ remark: "台风已消散" });
            const remark = {
                layer: !!getLayerByName("typhoon_info"),
                tip: document.getElementById("fullscreen-tip").style.opacity,
            };
            drawTyphoonInfo({ points: [] });
            return { legacy, remark, tipAfterClear: document.getElementById("fullscreen-tip").style.opacity };
        }, info);
        assert.deepEqual(result.legacy, {
            layers: 1, windCircles: 2, errorCircles: 0,
        });
        assert.deepEqual(result.remark, { layer: false, tip: "1" });
        assert.equal(result.tipAfterClear, "0");
    } finally {
        await page.evaluate(() => clearTyphoonInfo());
    }
});
