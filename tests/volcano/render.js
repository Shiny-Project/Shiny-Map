const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const fixtures = require("./fixtures");
const { prepare } = require("../../backend/service/VolcanoInput");

const directory = path.resolve(__dirname, "../../output/volcano-samples");
const escape = (value) => value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

async function request(warning, form = false) {
    const response = await fetch("http://localhost:3000/map/volcano_warning", {
        method: "POST", headers: form ? {} : { "Content-Type": "application/json" },
        body: form ? new URLSearchParams({ warning: JSON.stringify(warning) }) : JSON.stringify({ warning }),
        signal: AbortSignal.timeout(30000),
    });
    return { status: response.status, body: await response.json() };
}

async function run() {
    process.chdir(path.resolve(__dirname, "../.."));
    process.env.SENTRY_DSN = "";
    fs.mkdirSync(directory, { recursive: true });
    const server = require("../../backend");
    let startupError;
    server.on("error", (error) => { startupError = error; });
    try {
        const deadline = Date.now() + 60000;
        while (!global.isBrowserLoaded) {
            if (startupError || global.browserInitializationError) throw startupError || global.browserInitializationError;
            if (Date.now() > deadline) throw new Error("Volcano sample browser did not initialize");
            await sleep(50);
        }
        await global.volcanoPage.evaluate(() => {
            const original = window.setFooter;
            window.setFooter = (value) => original(value.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/, "2026-10-19T00:00:00.000Z"));
        });
        const results = [];
        for (const [index, fixture] of fixtures.entries()) {
            const response = await request(fixture.warning, index % 2 === 1);
            assert.equal(response.status, 200, fixture.id + ": " + JSON.stringify(response.body));
            const buffer = fs.readFileSync(response.body.path);
            assert.equal(buffer.readUInt32BE(16), 1920);
            assert.equal(buffer.readUInt32BE(20), 1080);
            fs.copyFileSync(response.body.path, path.join(directory, fixture.id + ".png"));
            fs.writeFileSync(path.join(directory, fixture.id + ".json"), JSON.stringify({ warning: fixture.warning }, null, 2) + "\n");
            const state = await global.volcanoPage.evaluate(async (png) => {
                const pixel = map.getPixelFromCoordinate(ol.proj.fromLonLat(window.volcanoState.coordinate));
                const image = new Image();
                image.src = "data:image/png;base64," + png;
                await image.decode();
                const canvas = document.createElement("canvas");
                canvas.width = 1920;
                canvas.height = 1080;
                const context = canvas.getContext("2d");
                context.drawImage(image, 0, 0);
                const areaLayer = map.getLayers().getArray()[1];
                return {
                    ...window.volcanoState,
                    title: document.getElementById("title").textContent,
                    summary: document.getElementById("summary").textContent,
                    badge: document.getElementById("badge").textContent,
                    legend: document.getElementById("legend").textContent,
                    panelBottom: document.getElementById("panel").getBoundingClientRect().bottom,
                    legendTop: document.getElementById("legend").getBoundingClientRect().top,
                    overlays: ["panel", "heading", "legend"].map((id) => {
                        const rect = document.getElementById(id).getBoundingClientRect();
                        return { id, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
                    }),
                    markerCount: map.getLayers().getArray()[2].getSource().getFeatures().length,
                    markerPixel: pixel,
                    paintedMarker: [...context.getImageData(Math.round(pixel[0]), Math.round(pixel[1] + 2), 1, 1).data],
                    fills: Object.fromEntries(areaLayer.getSource().getFeatures()
                        .filter((feature) => window.volcanoState.areaStates[feature.get("code")])
                        .map((feature) => [feature.get("code"), areaLayer.getStyleFunction()(feature).getFill().getColor()])),
                    fitted: [[window.volcanoState.extent[0], window.volcanoState.extent[1]],
                        [window.volcanoState.extent[2], window.volcanoState.extent[3]]].map((point) => map.getPixelFromCoordinate(point)),
                };
            }, buffer.toString("base64"));
            assert.equal(state.markerCount, 1, fixture.id + ": stale marker");
            assert.deepEqual(state.coordinate, prepare(fixture.warning).volcano.coordinate, fixture.id + ": wrong position");
            assert.ok(state.panelBottom < state.legendTop - 12, fixture.id + ": panel overlaps legend");
            for (const rect of state.overlays) {
                assert.ok(rect.left >= 0 && rect.right <= 1920 && rect.top >= 0 && rect.bottom <= 1055,
                    fixture.id + ": clipped " + rect.id);
            }
            assert.ok(state.markerPixel[0] >= 100 && state.markerPixel[0] < 1420, fixture.id + ": marker under panel");
            assert.ok(state.markerPixel[1] >= 170 && state.markerPixel[1] < 910, fixture.id + ": marker clipped");
            for (const point of state.fitted) {
                assert.ok(point[0] >= 100 && point[0] <= 1425 && point[1] >= 165 && point[1] <= 915, fixture.id + ": extent clipped");
            }
            const expectedAreas = new Set([...(fixture.warning.areas || []), ...(fixture.warning.responses || [])].map((item) => item.code));
            assert.deepEqual(Object.keys(state.areaStates).sort(), [...expectedAreas].sort(), fixture.id);
            assert.equal(state.badge, { 通常: "", 訓練: "训练", 試験: "试验" }[fixture.warning.status], fixture.id);
            for (const [code, item] of Object.entries(state.areaStates)) assert.equal(state.fills[code], item.color);
            if (fixture.id === "asama") {
                assert.deepEqual(state.paintedMarker, [255, 40, 0, 255]);
                assert.equal(state.fills["1042500"], "#ff2800");
            }
            if (fixture.id === "hakone") {
                assert.deepEqual(state.paintedMarker, [153, 0, 204, 255]);
                assert.match(state.title, /特别警报/);
            }
            if (fixture.id === "released") {
                assert.match(state.title, /警报解除/);
                assert.equal(state.areaStates["1042100"].responseKind, "45");
            }
            if (fixture.id === "level-2") assert.deepEqual(state.paintedMarker, [250, 245, 0, 255]);
            if (fixture.id === "mixed") {
                assert.equal(state.fills["1042500"], "#ff2800");
                assert.equal(state.fills["2020800"], "#9da7b1");
            }
            if (fixture.id === "different-responses") {
                assert.equal(state.fills["1042500"], "#9900CC");
                assert.equal(state.fills["2020800"], "#ff2800");
                assert.equal(state.fills["2032100"], "#faf500");
            }
            if (fixture.id === "submarine" || fixture.id === "keyword") {
                assert.equal(Object.keys(state.areaStates).length, 0);
                assert.doesNotMatch(state.summary, /等级/);
            }
            if (fixture.id === "cancelled") {
                assert.match(state.title, /电文取消/);
                assert.doesNotMatch(state.title, /解除/);
                assert.deepEqual(state.paintedMarker, [157, 167, 177, 255]);
            }
            if (fixture.id === "corrected") assert.match(state.title, /订正/);
            if (fixture.id === "crater-warning") assert.doesNotMatch(state.title, /解除/);
            results.push({ id: fixture.id, label: fixture.label, ...state });
            console.log("Volcano sample verified: " + fixture.id);
        }
        // A-B-A catches state leaking between requests, including labels, fills and camera.
        const repeated = await request(fixtures[0].warning);
        assert.equal(repeated.status, 200);
        assert.deepEqual(fs.readFileSync(repeated.body.path), fs.readFileSync(path.join(directory, "asama.png")));
        for (const warning of [{}, { ...fixtures[0].warning, volcano: { ...fixtures[0].warning.volcano, coordinate: "+3660+13830/" } }]) {
            const invalid = await request(warning);
            assert.equal(invalid.status, 400);
            assert.equal(invalid.body.error.name, "bad_volcano");
        }
        const concurrent = await Promise.all([request(fixtures[0].warning), request(fixtures[8].warning)]);
        assert.ok(concurrent.every((result) => result.status === 200));
        assert.notEqual(concurrent[0].body.path, concurrent[1].body.path);
        assert.deepEqual(fs.readFileSync(concurrent[0].body.path), fs.readFileSync(path.join(directory, "asama.png")));
        assert.deepEqual(fs.readFileSync(concurrent[1].body.path), fs.readFileSync(path.join(directory, "submarine.png")));
        fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(results, null, 2) + "\n");
        fs.writeFileSync(path.join(directory, "index.html"), `<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8">
<title>VFVO50 渲染样例</title><style>body{margin:32px;background:#20242c;color:white;font:16px/1.6 sans-serif}h1{font-size:28px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:#303640;padding:16px}h2{font-size:19px}img{width:100%}a{color:#bcdcff}</style>
<h1>VFVO50 · 喷火警报与预报</h1><p>前三项采用 JMA 官方样例并添加试验标记，其余为模拟数据。均使用 JMA 火山市町村 GIS。</p><main>
${fixtures.map((item) => `<article><h2>${escape(item.label)}</h2><a href="${item.id}.png"><img src="${item.id}.png" alt="${escape(item.label)}"></a><a href="${item.id}.json">请求参数</a></article>`).join("\n")}</main></html>`);
        console.log("Verified " + fixtures.length + " VFVO50 samples: " + path.join(directory, "index.html"));
    } finally {
        if (global.browser) await global.browser.close();
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
