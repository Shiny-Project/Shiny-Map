const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const fixtures = require("./fixtures");
const { prepare } = require("../../backend/service/FloodInput");
const directory = path.resolve(__dirname, "../../output/flood-samples");

async function request(warning, form = false) {
    const response = await fetch("http://localhost:3000/map/flood_warning", {
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
            if (Date.now() > deadline) throw new Error("Flood sample browser did not initialize");
            await sleep(50);
        }
        await global.floodPage.evaluate(() => {
            const original = window.setFooter;
            window.setFooter = (value) => original(value.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/, "2026-10-21T00:00:00.000Z"));
        });
        for (const [index, fixture] of fixtures.entries()) {
            const response = await request(fixture.warning, index % 2 === 1);
            assert.equal(response.status, 200, fixture.id + ": " + JSON.stringify(response.body));
            const png = fs.readFileSync(response.body.path);
            assert.equal(png.readUInt32BE(16), 1920);
            assert.equal(png.readUInt32BE(20), 1080);
            fs.copyFileSync(response.body.path, path.join(directory, fixture.id + ".png"));
            const result = await global.floodPage.evaluate(async (png) => {
                const image = new Image();
                image.src = "data:image/png;base64," + png;
                await image.decode();
                const canvas = document.createElement("canvas");
                canvas.width = 1920;
                canvas.height = 1080;
                const context = canvas.getContext("2d");
                context.drawImage(image, 0, 0);
                const pixels = context.getImageData(100, 170, 1320, 760).data;
                const colors = {};
                for (let i = 0; i < pixels.length; i += 4) {
                    const color = [...pixels.slice(i, i + 3)].map((v) => v.toString(16).padStart(2, "0")).join("");
                    colors[color] = (colors[color] || 0) + 1;
                }
                const layer = map.getLayers().getArray()[1];
                const states = window.floodState.areaStates;
                return {
                    ...window.floodState,
                    title: document.getElementById("title").textContent,
                    badge: document.getElementById("badge").textContent,
                    panel: document.getElementById("panel").textContent,
                    legend: document.getElementById("legend").textContent,
                    overlays: Object.fromEntries(["heading", "panel", "legend"].map((id) => {
                        const rect = document.getElementById(id).getBoundingClientRect();
                        return [id, { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }];
                    })),
                    styles: Object.fromEntries(layer.getSource().getFeatures().filter((f) => states[f.get("code")])
                        .map((f) => {
                            const style = layer.getStyleFunction()(f);
                            return [f.get("code"), { fill: style.getFill().getColor(),
                                stroke: style.getStroke().getColor(), dash: style.getStroke().getLineDash() }];
                        })),
                    pixels: Object.fromEntries([...new Set(Object.values(states).map((a) => a.color))]
                        .map((color) => [color, colors[color.slice(1).toLowerCase()] || 0])),
                    occurredPixels: colors.ff9f00 || 0,
                    fitted: [[window.floodState.extent[0], window.floodState.extent[1]],
                        [window.floodState.extent[2], window.floodState.extent[3]]].map((p) => map.getPixelFromCoordinate(p)),
                };
            }, png.toString("base64"));
            const expected = prepare(fixture.warning);
            assert.deepEqual(result.areaStates, Object.fromEntries(expected.areas.map((area) => [area.code, area])), fixture.id);
            assert.deepEqual(Object.keys(result.styles).sort(), Object.keys(result.areaStates).sort(), fixture.id + ": GIS coverage");
            for (const area of expected.areas) {
                const style = result.styles[area.code];
                assert.equal(style.fill, area.color, fixture.id);
                assert.equal(style.stroke, area.occurred ? "#ff9f00" : "#fff", fixture.id);
                assert.deepEqual(style.dash, area.ended ? [6, 4] : null, fixture.id);
            }
            assert.ok(Object.values(result.pixels).some((count) => count > 50), fixture.id + ": areas were not painted");
            if (fixture.id !== "many-rivers") {
                for (const count of Object.values(result.pixels)) assert.ok(count > 50, fixture.id + ": missing warning color");
            }
            if (expected.areas.some((area) => area.occurred)) {
                assert.ok(result.occurredPixels > 5, fixture.id + ": missing occurrence outline");
                assert.match(result.legend, /泛滥发生信息/);
            } else assert.doesNotMatch(result.legend, /泛滥发生/);
            assert.equal(result.badge, { 通常: "", 試験: "试验", 訓練: "训练" }[expected.status], fixture.id);
            assert.ok(result.overlays.panel.bottom < result.overlays.legend.top - 12, fixture.id + ": panel overlaps legend");
            assert.ok(result.overlays.heading.right < result.overlays.panel.left, fixture.id + ": title overlaps panel");
            for (const rect of Object.values(result.overlays)) {
                assert.ok(rect.left >= 0 && rect.right <= 1920 && rect.top >= 0 && rect.bottom < 1055, fixture.id + ": clipped overlay");
            }
            for (const point of result.fitted) {
                assert.ok(point[0] >= 95 && point[0] <= 1425 && point[1] >= 165 && point[1] <= 935, fixture.id + ": clipped extent");
            }
            if (fixture.id === "tone-downgraded") {
                assert.match(result.title, /注意报/);
                assert.doesNotMatch(result.title, /解除/);
                assert.match(result.panel, /泛滥注意报/);
            }
            if (fixture.id === "cancelled") {
                assert.match(result.title, /电文取消/);
                assert.doesNotMatch(result.title, /解除/);
            }
            if (fixture.id === "corrected") assert.match(result.title, /订正/);
            if (fixture.id === "many-rivers") assert.match(result.panel, /另 \d+ 个河川预报区/);
            console.log("Flood sample verified: " + fixture.id);
        }
        // Reusing one page must clear old fills, outlines, labels and camera state.
        const repeated = await request(fixtures[0].warning);
        assert.equal(repeated.status, 200);
        assert.deepEqual(fs.readFileSync(repeated.body.path), fs.readFileSync(path.join(directory, "oyabe.png")));
        const concurrent = await Promise.all([request(fixtures[0].warning), request(fixtures[7].warning)]);
        assert.ok(concurrent.every((r) => r.status === 200));
        assert.notEqual(concurrent[0].body.path, concurrent[1].body.path);
        assert.deepEqual(fs.readFileSync(concurrent[0].body.path), fs.readFileSync(path.join(directory, "oyabe.png")));
        assert.deepEqual(fs.readFileSync(concurrent[1].body.path), fs.readFileSync(path.join(directory, "mogami-occurred.png")));
        for (const warning of [{}, { rivers: [{ code: "8404100001", kind: "20" }] },
            { rivers: [{ code: "840410000100", kind: "50" }] }]) {
            const invalid = await request(warning);
            assert.equal(invalid.status, 400);
            assert.equal(invalid.body.error.name, "bad_flood");
        }
        console.log("Verified " + fixtures.length + " flood samples, repeat/concurrent requests and invalid API input.");
    } finally {
        if (global.browser) await global.browser.close();
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
