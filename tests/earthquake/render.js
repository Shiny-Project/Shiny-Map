const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const { compareImages } = require("../map-baseline/image-diff");
const fixtures = require("./fixtures");
const directory = path.resolve(__dirname, "../../output/earthquake-samples");

async function request(earthquake, form = false) {
    const response = await fetch("http://localhost:3000/map/earthquake", {
        method: "POST", headers: form ? {} : { "Content-Type": "application/json" },
        body: form ? new URLSearchParams({ earthquake: JSON.stringify(earthquake) }) : JSON.stringify({ earthquake }),
        signal: AbortSignal.timeout(30000),
    });
    return { status: response.status, body: await response.json() };
}

async function assertRepeatedImage(file, id) {
    const comparison = await compareImages(global.earthquakePage,
        fs.readFileSync(path.join(directory, id + ".png")), fs.readFileSync(file),
        path.join(directory, id + "-repeat-diff.png"));
    assert.ok(comparison.passed, id + ": repeat render changed: " + JSON.stringify(comparison));
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
            if (Date.now() > deadline) throw new Error("Earthquake sample browser did not initialize");
            await sleep(50);
        }
        await global.earthquakePage.evaluate(() => {
            const original = window.setFooter;
            window.setFooter = (value) => original(value.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/,
                "2026-10-22T00:00:00.000Z"));
        });
        const results = [];
        for (const [index, fixture] of fixtures.entries()) {
            const response = await request(fixture.earthquake, index % 2 === 1);
            assert.equal(response.status, 200, fixture.id + ": " + JSON.stringify(response.body));
            const png = fs.readFileSync(response.body.path);
            assert.equal(png.readUInt32BE(16), 1920);
            assert.equal(png.readUInt32BE(20), 1080);
            fs.copyFileSync(response.body.path, path.join(directory, fixture.id + ".png"));
            fs.writeFileSync(path.join(directory, fixture.id + ".json"), JSON.stringify({ earthquake: fixture.earthquake }, null, 2) + "\n");
            const state = await global.earthquakePage.evaluate(async (png) => {
                const features = map.getLayers().getArray()[1].getSource().getFeatures();
                const pixel = map.getPixelFromCoordinate(features[0].getGeometry().getCoordinates());
                const image = new Image();
                image.src = "data:image/png;base64," + png;
                await image.decode();
                const canvas = document.createElement("canvas");
                canvas.width = 1920;
                canvas.height = 1080;
                const context = canvas.getContext("2d");
                context.drawImage(image, 0, 0);
                const rect = (id) => {
                    const bounds = document.getElementById(id).getBoundingClientRect();
                    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
                };
                return {
                    count: features.length, pixel,
                    title: document.getElementById("title").textContent,
                    markerColor: [...context.getImageData(Math.round(pixel[0]), Math.round(pixel[1]), 1, 1).data],
                    region: document.getElementById("region").textContent,
                    description: document.getElementById("description").textContent,
                    magnitude: document.getElementById("magnitude").textContent,
                    epicenter: document.getElementById("epicenter").textContent,
                    depth: document.getElementById("depth").textContent,
                    panel: rect("panel"), heading: rect("heading"), legend: rect("legend"),
                    footer: document.getElementById("footer").textContent,
                    external: performance.getEntriesByType("resource")
                        .filter((entry) => new URL(entry.name).origin !== location.origin).map((entry) => entry.name),
                };
            }, png.toString("base64"));
            assert.equal(state.count, 1, fixture.id + ": stale epicenter");
            assert.ok(state.markerColor[0] > 240 && state.markerColor[1] < 20 && state.markerColor[2] < 20 &&
                state.markerColor[3] === 255, fixture.id + ": missing painted epicenter");
            assert.ok(state.pixel[0] > 100 && state.pixel[0] < 1420 && state.pixel[1] > 160 && state.pixel[1] < 920,
                fixture.id + ": epicenter outside visible map area: " + state.pixel);
            for (const rect of [state.panel, state.heading, state.legend]) {
                assert.ok(rect.left >= 0 && rect.right <= 1920 && rect.top >= 0 && rect.bottom < 1055, fixture.id + ": clipped overlay");
            }
            assert.ok(state.panel.bottom + 20 < state.legend.top, fixture.id + ": panel overlaps legend");
            assert.deepEqual(state.external, [], fixture.id + ": remote resource dependency");
            if (fixture.earthquake.source) {
                assert.equal(state.title, fixture.earthquake.source + " 地震速报");
                assert.ok(state.footer.endsWith("Data Source: " + fixture.earthquake.source));
            } else {
                assert.equal(state.title, "地震速报");
                assert.doesNotMatch(state.footer, /Data Source|USGS/);
            }
            if (fixture.id === "china") {
                assert.equal(state.region, "中国");
                assert.equal(state.magnitude, "M 7.0");
                assert.equal(state.depth, "18 千米");
                assert.match(state.epicenter, /北纬 32\.3805°\n东经 93\.7797°/);
            }
            if (fixture.id === "vanuatu") assert.match(state.epicenter, /南纬/);
            if (fixture.id === "alaska") assert.match(state.epicenter, /西经/);
            if (fixture.id === "ocean" || fixture.id === "region-only") assert.equal(state.description, "");
            if (fixture.id === "region-only") assert.equal(state.depth, "0 千米");
            results.push({ id: fixture.id, ...state });
            console.log("Earthquake sample verified: " + fixture.id);
        }
        // Use the shared image tolerance for coastline antialiasing after camera changes.
        const repeated = await request(fixtures[0].earthquake);
        assert.equal(repeated.status, 200);
        await assertRepeatedImage(repeated.body.path, "china");
        for (const earthquake of [null, {}, { ...fixtures[0].earthquake, location: "91 0" }]) {
            const invalid = await request(earthquake);
            assert.equal(invalid.status, 400);
            assert.equal(invalid.body.error.name, "bad_earthquake");
        }
        const concurrent = await Promise.all([request(fixtures[0].earthquake), request(fixtures[1].earthquake)]);
        assert.ok(concurrent.every((result) => result.status === 200));
        assert.notEqual(concurrent[0].body.path, concurrent[1].body.path);
        for (const [index, result] of concurrent.entries()) {
            await assertRepeatedImage(result.body.path, fixtures[index].id);
        }
        fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(results, null, 2) + "\n");
        fs.writeFileSync(path.join(directory, "index.html"), `<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8">
<title>地震速报渲染样例</title><style>body{margin:32px;background:#20242c;color:white;font:16px/1.6 sans-serif}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:#303640;padding:16px}h2{font-size:19px}img{width:100%}a{color:#bcdcff}</style>
<h1>地震速报</h1><p>前两项为 USGS 官方 Atom 数据，其余为模拟场景。</p><main>
${fixtures.map((item) => `<article><h2>${item.label}</h2><a href="${item.id}.png"><img src="${item.id}.png" alt="${item.label}"></a><a href="${item.id}.json">请求参数</a></article>`).join("\n")}</main></html>`);
        console.log("Verified " + fixtures.length + " earthquake samples: " + path.join(directory, "index.html"));
    } finally {
        if (global.browser) await global.browser.close();
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
