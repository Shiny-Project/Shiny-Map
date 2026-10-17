const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const { prepare } = require("../../backend/service/EWInput");
const fixtures = require("./fixtures");

const directory = path.resolve(__dirname, "../../output/ew-samples");
const areas = require("../../data/jma_weather_areas.json").features;
const allCases = [...fixtures, {
    id: "national", label: "全国 1,805 个气象警报区域（压力样例）",
    warning: { ...fixtures[0].warning, active: { "33": areas.map((feature) => feature.properties.code) } },
}];
const escape = (value) => value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

async function run() {
    process.chdir(path.resolve(__dirname, "../.."));
    process.env.SENTRY_DSN = "";
    fs.mkdirSync(directory, { recursive: true });
    const manifestPath = path.join(directory, "manifest.json");
    const previousCases = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : [];
    const server = require("../../backend");
    let startupError;
    server.on("error", (error) => { startupError = error; });
    const results = [];
    try {
        const deadline = Date.now() + 60000;
        while (!global.isBrowserLoaded) {
            if (startupError || global.browserInitializationError) throw startupError || global.browserInitializationError;
            if (Date.now() > deadline) throw new Error("EW sample browser did not initialize");
            await sleep(50);
        }
        // Keep generated samples deterministic while still exercising the API.
        await global.ewPage.evaluate(() => {
            const original = window.setFooter;
            window.setFooter = (value) => original(value.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/, "2026-10-17T00:00:00.000Z"));
        });
        for (const [index, fixture] of allCases.entries()) {
            const form = index % 2 === 1;
            const response = await fetch("http://localhost:3000/map/" + (form ? "emergency_warning" : "ew"), {
                method: "POST",
                headers: form ? {} : { "Content-Type": "application/json" },
                body: form ? new URLSearchParams({ warning: JSON.stringify(fixture.warning) }) : JSON.stringify({ warning: fixture.warning }),
                signal: AbortSignal.timeout(30000),
            });
            const body = await response.json();
            assert.equal(response.status, 200, fixture.id + ": " + JSON.stringify(body));
            const buffer = fs.readFileSync(body.path);
            assert.equal(buffer.readUInt32BE(16), 1920);
            assert.equal(buffer.readUInt32BE(20), 1080);
            fs.copyFileSync(body.path, path.join(directory, fixture.id + ".png"));
            fs.writeFileSync(path.join(directory, fixture.id + ".json"), JSON.stringify({ warning: fixture.warning }, null, 2) + "\n");
            const state = await global.ewPage.evaluate(() => ({
                ...window.ewState,
                title: document.getElementById("title").textContent,
                badge: document.getElementById("badge").textContent,
                badgeVisible: getComputedStyle(document.getElementById("badge")).display !== "none",
                detail: document.getElementById("kinds").textContent,
                overflow: document.getElementById("panel").getBoundingClientRect().bottom > innerHeight - 28,
                fills: Object.fromEntries(map.getLayers().getArray()[1].getSource().getFeatures()
                    .filter((feature) => window.ewState.areaStates[feature.get("code")])
                    .map((feature) => [feature.get("code"), map.getLayers().getArray()[1]
                        .getStyleFunction()(feature).getFill().getColor()])),
            }));
            const normalized = prepare(fixture.warning);
            const cancelled = normalized.infoType === "取消";
            const expectedActive = normalized.items.filter((item) => !cancelled && item.kinds.some((kind) => kind.state === "active"));
            assert.deepEqual(state.activeAreas, expectedActive.map((item) => item.areaCode), fixture.id);
            assert.equal(state.overflow, false, fixture.id + ": panel overflows viewport");
            assert.equal(state.badge, { 通常: "", 訓練: "训练", 試験: "试验" }[normalized.status]);
            assert.equal(state.badgeVisible, normalized.status !== "通常", fixture.id);
            for (const item of expectedActive) assert.equal(state.fills[item.areaCode], "#9900CC", fixture.id);
            for (const [code, value] of Object.entries(state.areaStates)) {
                if (value === "ended") assert.equal(state.fills[code], "#9da7b1", fixture.id);
            }
            if (cancelled) assert.match(state.title, /电文取消/);
            results.push({ id: fixture.id, label: fixture.label, ...state });
            console.log("EW sample verified: " + fixture.id);
        }
        const invalid = await fetch("http://localhost:3000/map/ew", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ warning: { ...fixtures[0].warning, active: { "33": ["290000"] } } }),
        });
        assert.equal(invalid.status, 400);
        assert.equal((await invalid.json()).error.name, "bad_ew");
        const currentIds = new Set(allCases.map((fixture) => fixture.id));
        for (const previous of previousCases) {
            if (typeof previous.id !== "string" || !/^[a-z0-9-]+$/.test(previous.id) || currentIds.has(previous.id)) continue;
            for (const extension of [".png", ".json"]) {
                const stalePath = path.resolve(directory, previous.id + extension);
                if (path.dirname(stalePath) !== directory) throw new Error("Invalid stale sample path");
                fs.rmSync(stalePath, { force: true });
            }
        }
        fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2) + "\n");
        fs.copyFileSync("data/jma_weather_areas.sources.json", path.join(directory, "GIS-source.json"));
        fs.writeFileSync(path.join(directory, "index.html"), `<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8">
<title>JMA EW 渲染样例</title><style>body{margin:32px;background:#20242c;color:white;font:16px/1.6 sans-serif}h1{font-size:28px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:#303640;padding:16px}h2{font-size:19px}img{width:100%;height:auto}a{color:#bcdcff}</style>
<h1>JMA 特别警报 · ${allCases.length} 种渲染样例</h1><p>以下均为模拟数据，覆盖截至 2026-10-17 仍在使用的七类气象特别警报及不同绘图状态。使用 JMA 官方 GIS，点击图片查看 1920 × 1080 原图。</p><main>
${allCases.map((fixture) => `<article><h2>${escape(fixture.label)}</h2><a href="${fixture.id}.png"><img loading="lazy" src="${fixture.id}.png" alt="${escape(fixture.label)}"></a><a href="${fixture.id}.json">请求参数 JSON</a></article>`).join("\n")}
</main></html>`);
        const overviewPage = await global.browser.newPage();
        try {
            await overviewPage.setViewport({ width: 1920, height: 1280 });
            for (let index = 0; index < allCases.length; index += 9) {
                const batch = allCases.slice(index, index + 9);
                await overviewPage.setContent(`<!DOCTYPE html><meta charset="utf-8"><style>
body{margin:20px;background:#20242c;color:white;font:20px/1.5 'Microsoft YaHei',sans-serif}
h1{font-size:28px;margin:0 0 18px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
article{background:#303640}h2{font-size:18px;margin:8px 12px;font-weight:500}img{display:block;width:100%;height:auto}
</style><h1>JMA EW · 模拟数据样例 ${index + 1}–${index + batch.length} / ${allCases.length}</h1><main>
${batch.map((fixture) => `<article><h2>${escape(fixture.label)}</h2><img src="data:image/png;base64,${fs.readFileSync(path.join(directory, fixture.id + ".png")).toString("base64")}"></article>`).join("")}
</main>`);
                await overviewPage.evaluate(async () => {
                    await Promise.all([...document.images].map((image) => image.decode()));
                    await document.fonts.ready;
                });
                await overviewPage.screenshot({
                    path: path.join(directory, "overview-" + (index / 9 + 1) + ".png"),
                    fullPage: true,
                });
            }
        } finally {
            await overviewPage.close();
        }
        console.log("Verified " + allCases.length + " EW samples: " + path.join(directory, "index.html"));
    } finally {
        if (global.browser) await global.browser.close();
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
