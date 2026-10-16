const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { setTimeout: sleep } = require("node:timers/promises");
const puppeteer = require("puppeteer");
const { checkMapData, checkRenderedBaseMap } = require("./base-map-check");
const { captureMapState, assertMapStateMatches } = require("./map-state");

const root = path.resolve(__dirname, "../..");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function options() {
    const result = { label: "current", runs: 50, warmups: 5 };
    for (const argument of process.argv.slice(2)) {
        const match = /^--(label|runs|warmups|compare)=(.+)$/.exec(argument);
        if (!match) throw new Error("Unknown argument: " + argument);
        result[match[1]] = match[2];
    }
    result.runs = Number(result.runs);
    result.warmups = Number(result.warmups);
    assert.match(result.label, /^[a-zA-Z0-9_-]+$/);
    assert.ok(Number.isInteger(result.runs) && result.runs >= 20 && result.runs <= 100);
    assert.ok(Number.isInteger(result.warmups) && result.warmups >= 1 && result.warmups <= 10);
    return result;
}

function timing(samples) {
    const sorted = [...samples].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return {
        medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
        maxMs: sorted[sorted.length - 1],
    };
}

function fixtures() {
    const cases = require("./fixtures.json").map((fixture) => ({ ...fixture }));
    const shindo = {};
    const intensities = ["1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"];
    Object.keys(require("../../backend/definition/jma_city")).forEach((city, index) => {
        (shindo[intensities[index % intensities.length]] ||= []).push(city);
    });
    cases.push({
        id: "shindo-report-dense",
        label: "全国大量震度点",
        method: "POST",
        endpoint: "/map/shindo_report",
        params: { epicenter: [142.369, 38.322], shindo },
    });
    return cases;
}

async function run() {
    const config = options();
    process.chdir(root);
    process.env.SENTRY_DSN = "";
    const expectedRegions = checkMapData(root);
    const cases = fixtures();
    const baseline = config.compare && JSON.parse(fs.readFileSync(path.resolve(config.compare), "utf8"));
    const output = path.join(root, "output/map-benchmark", config.label);
    fs.mkdirSync(output, { recursive: true });
    const renderer = require("../../backend/service/MapRenderer");
    let active;
    const originalReady = renderer.waitForReady;
    renderer.waitForReady = async (...args) => {
        const started = performance.now();
        try {
            return await originalReady(...args);
        } finally {
            if (active) active.readyMs += performance.now() - started;
        }
    };
    const originalLaunch = puppeteer.launch;
    const runtimeErrors = [];
    let browser;
    let server;
    let startupError;
    let browserSession;
    let sessions;
    const report = {
        schemaVersion: 1,
        label: config.label,
        startedAt: new Date().toISOString(),
        runs: config.runs,
        warmups: config.warmups,
        fixtureSha256: sha256(JSON.stringify(cases)),
        dataSha256: sha256(fs.readFileSync(path.join(root, "data/world_base.json"))),
        limits: { medianRatio: 1.05, medianAbsoluteMs: 10, p95Ratio: 1.10, p95AbsoluteMs: 20 },
        memory: [],
        cases: cases.map(({ id, label }) => ({ id, label, samples: [] })),
        failures: [],
    };
    puppeteer.launch = async (...args) => {
        report.browserArguments = args[0].args;
        browser = await originalLaunch.apply(puppeteer, args);
        const originalNewPage = browser.newPage.bind(browser);
        browser.newPage = async () => {
            const page = await originalNewPage();
            page.on("pageerror", (error) => runtimeErrors.push(error.message));
            page.on("requestfailed", (request) => runtimeErrors.push(request.url() + ": request failed"));
            page.on("response", (response) => {
                if (response.status() >= 400) runtimeErrors.push(response.status() + " " + response.url());
            });
            const originalScreenshot = page.screenshot.bind(page);
            page.screenshot = async (...screenshotArgs) => {
                if (active?.inspect !== undefined) {
                    report.cases[active.inspect].mapState = await captureMapState(page);
                }
                const started = performance.now();
                try {
                    return await originalScreenshot(...screenshotArgs);
                } finally {
                    if (active) active.screenshotMs += performance.now() - started;
                }
            };
            return page;
        };
        return browser;
    };
    const onRejection = (error) => { startupError = error; };
    process.on("unhandledRejection", onRejection);

    async function request(fixture, saveImage, inspect) {
        active = { readyMs: 0, screenshotMs: 0 };
        if (inspect !== undefined) active.inspect = inspect;
        const fields = new URLSearchParams(Object.entries(fixture.params).map(([key, value]) => [
            key, typeof value === "string" ? value : JSON.stringify(value),
        ]));
        const url = new URL(fixture.endpoint, "http://localhost:3000");
        const init = { method: fixture.method, signal: AbortSignal.timeout(30000) };
        if (fixture.method === "GET") url.search = fields.toString();
        else init.body = fields;
        const started = performance.now();
        const response = await fetch(url, init);
        const body = await response.json();
        const elapsedMs = performance.now() - started;
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(typeof body.path, "string");
        const image = path.resolve(body.path);
        assert.ok(image.startsWith(path.join(root, "output") + path.sep));
        const sample = { elapsedMs, readyMs: active.readyMs, screenshotMs: active.screenshotMs };
        active = null;
        if (saveImage) fs.copyFileSync(image, path.join(output, fixture.id + ".png"));
        // Exclude output accumulation from long benchmarks; remove only the file
        // returned for this request, after validating its absolute parent path.
        fs.unlinkSync(image);
        if (runtimeErrors.length) throw new Error(runtimeErrors.join("\n"));
        return sample;
    }

    async function memory(round, collectGarbage = false) {
        const pages = [];
        for (const session of sessions) {
            if (collectGarbage) await session.send("HeapProfiler.collectGarbage");
            const { metrics } = await session.send("Performance.getMetrics");
            const values = Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
            pages.push({ jsHeapBytes: values.JSHeapUsedSize, nodes: values.Nodes, documents: values.Documents });
        }
        report.memory.push({ round, collectGarbage, pages });
    }

    try {
        const startup = performance.now();
        server = require("../../backend");
        server.on("error", (error) => { startupError = error; });
        while (!global.isBrowserLoaded) {
            if (startupError || global.browserInitializationError) {
                throw startupError || global.browserInitializationError;
            }
            assert.ok(performance.now() - startup < 60000, "Browser startup timed out.");
            await sleep(25);
        }
        report.startupMs = performance.now() - startup;
        const pages = [global.page, global.tsunamiPage, global.typhoonPage];
        for (const page of pages) {
            await checkRenderedBaseMap(page, expectedRegions);
            await page.evaluate(() => {
                const originalFooter = window.setFooter;
                window.setFooter = (text) => originalFooter(
                    text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "2024-01-01T00:00:00.000Z")
                );
            });
        }
        report.environment = {
            platform: process.platform,
            arch: process.arch,
            node: process.version,
            puppeteer: require("puppeteer/package.json").version,
            browser: await browser.version(),
            viewport: await global.page.viewport(),
        };
        report.openlayers = await global.page.evaluate(() => ol.VERSION);
        if (baseline) {
            assert.equal(baseline.passed, true, "The comparison run must have passed.");
            assert.equal(baseline.schemaVersion, report.schemaVersion);
            assert.equal(baseline.runs, config.runs, "Use the same measured run count.");
            assert.equal(baseline.warmups, config.warmups, "Use the same warmup count.");
            assert.deepEqual(report.environment, baseline.environment, "Benchmark environment changed.");
            assert.deepEqual(report.browserArguments, baseline.browserArguments, "Browser flags changed.");
            assert.equal(report.fixtureSha256, baseline.fixtureSha256, "Benchmark fixtures changed.");
            assert.equal(report.dataSha256, baseline.dataSha256, "Base map changed.");
        }
        sessions = await Promise.all(pages.map((page) => page.target().createCDPSession()));
        for (const session of sessions) await session.send("Performance.enable");
        browserSession = await browser.target().createCDPSession();
        for (let round = 0; round < config.warmups; round++) {
            for (const [index, fixture] of cases.entries()) {
                await request(fixture, false, round === config.warmups - 1 ? index : undefined);
            }
        }
        await memory(0, true);
        const cpuBefore = await browserSession.send("SystemInfo.getProcessInfo");
        for (let round = 0; round < config.runs; round++) {
            for (const [index, fixture] of cases.entries()) {
                report.cases[index].samples.push(await request(fixture, round === 0));
            }
            if ((round + 1) % 10 === 0) {
                await memory(round + 1);
                console.log(config.label + ": " + (round + 1) + "/" + config.runs + " rounds");
            }
        }
        const cpuAfter = await browserSession.send("SystemInfo.getProcessInfo");
        const previousCpu = new Map(cpuBefore.processInfo.map((item) => [item.id, item.cpuTime]));
        report.browserCpuSeconds = cpuAfter.processInfo.reduce(
            (total, item) => total + item.cpuTime - (previousCpu.get(item.id) || 0), 0
        );
        await memory(config.runs, true);
        for (const item of report.cases) {
            item.timing = timing(item.samples.map((sample) => sample.elapsedMs));
            item.ready = timing(item.samples.map((sample) => sample.readyMs));
            item.screenshot = timing(item.samples.map((sample) => sample.screenshotMs));
            if (baseline) {
                const before = baseline.cases.find((candidate) => candidate.id === item.id);
                assert.ok(before?.timing, "Missing baseline for " + item.id);
                assert.ok(before.mapState, "Missing map state for " + item.id + "; record a fresh baseline.");
                try {
                    assertMapStateMatches(item.mapState, before.mapState, item.id);
                } catch (error) {
                    report.failures.push(error.message);
                }
                item.changePercent = {};
                for (const metric of ["median", "p95"]) {
                    const key = metric + "Ms";
                    const ratio = item.timing[key] / before.timing[key];
                    item.changePercent[metric] = (ratio - 1) * 100;
                    if (ratio > report.limits[metric + "Ratio"] &&
                        item.timing[key] - before.timing[key] > report.limits[metric + "AbsoluteMs"]) {
                        report.failures.push(item.id + " " + metric + " regressed " +
                            item.changePercent[metric].toFixed(1) + "%");
                    }
                }
            }
        }
    } catch (error) {
        report.failures.push(error.stack || error.message);
    } finally {
        report.finishedAt = new Date().toISOString();
        report.passed = report.failures.length === 0;
        fs.writeFileSync(path.join(output, "performance.json"), JSON.stringify(report, null, 2) + "\n");
        renderer.waitForReady = originalReady;
        puppeteer.launch = originalLaunch;
        if (browser) await browser.close();
        if (server) {
            server.closeAllConnections?.();
            await new Promise((resolve) => server.close(resolve));
        }
        process.removeListener("unhandledRejection", onRejection);
    }
    console.table(report.cases.map((item) => ({
        scenario: item.id,
        medianMs: item.timing?.medianMs.toFixed(1),
        p95Ms: item.timing?.p95Ms.toFixed(1),
        medianChange: item.changePercent && item.changePercent.median.toFixed(1) + "%",
    })));
    console.log("Report: " + path.join(output, "performance.json"));
    assert.equal(report.passed, true, report.failures.join("\n"));
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
