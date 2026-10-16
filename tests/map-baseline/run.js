const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { setTimeout: sleep } = require("node:timers/promises");
const puppeteer = require("puppeteer");
const { compareImages, comparison } = require("./image-diff");
const { writeReport } = require("./report");
const { checkMapData, checkRenderedBaseMap } = require("./base-map-check");

const root = path.resolve(__dirname, "../..");
const referenceDirectory = path.join(__dirname, "references");
const fixturesPath = path.join(__dirname, "fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
const fixedFooterTimestamp = "2024-01-01T00:00:00.000Z";
const baseUrl = "http://localhost:3000";
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

function options() {
    const result = { update: false, runs: 3, warmups: 1 };
    for (const argument of process.argv.slice(2)) {
        if (argument === "--update") {
            result.update = true;
        } else if (/^--(runs|warmups)=\d+$/.test(argument)) {
            const [name, value] = argument.slice(2).split("=");
            result[name] = Number(value);
        } else {
            throw new Error("Unknown argument: " + argument + ". Use --update, --runs=3, --warmups=1.");
        }
    }
    if (result.runs < 2 || result.runs > 100 || result.warmups < 1 || result.warmups > 10) {
        throw new Error("Use 2–100 measured runs and 1–10 warmup rounds.");
    }
    return result;
}

function readPng(file) {
    const buffer = fs.readFileSync(file);
    if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        throw new Error("Not a valid PNG: " + file);
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width !== 1920 || height !== 1080) {
        throw new Error("Expected 1920×1080 PNG, got " + width + "×" + height + ": " + file);
    }
    return buffer;
}

function timing(samples) {
    const sorted = [...samples].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return {
        samplesMs: samples,
        minMs: sorted[0],
        medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
        maxMs: sorted[sorted.length - 1],
    };
}

async function requestImage(fixture) {
    const fields = new URLSearchParams();
    for (const [key, value] of Object.entries(fixture.params)) {
        fields.set(key, typeof value === "string" ? value : JSON.stringify(value));
    }
    const url = new URL(fixture.endpoint, baseUrl);
    const request = { method: fixture.method, signal: AbortSignal.timeout(15000) };
    if (fixture.method === "GET") {
        url.search = fields.toString();
    } else {
        request.body = fields;
    }
    const start = performance.now();
    const response = await fetch(url, request);
    const body = await response.json();
    const elapsedMs = performance.now() - start;
    if (!response.ok || body.error || typeof body.path !== "string") {
        throw new Error(fixture.id + ": HTTP " + response.status + " " + JSON.stringify(body));
    }
    const outputDirectory = path.join(root, "output") + path.sep;
    const outputPath = path.resolve(body.path);
    if (!outputPath.startsWith(outputDirectory)) {
        throw new Error(fixture.id + ": API returned a path outside output/: " + outputPath);
    }
    return { buffer: readPng(outputPath), elapsedMs };
}

async function run() {
    const config = options();
    process.chdir(root);
    // Disable reporting from this local test process. dotenv preserves an existing value.
    process.env.SENTRY_DSN = "";
    const baseMapRegions = checkMapData(root);
    const fixtureSha256 = sha256(fs.readFileSync(fixturesPath));
    let reference;
    if (!config.update) {
        const manifestPath = path.join(referenceDirectory, "manifest.json");
        if (!fs.existsSync(manifestPath)) {
            throw new Error("No reference images. Run npm run baseline:maps, then review the images.");
        }
        reference = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (
            reference.schemaVersion !== 1 || reference.fixtureSha256 !== fixtureSha256 ||
            reference.fixedFooterTimestamp !== fixedFooterTimestamp ||
            JSON.stringify(reference.comparison) !== JSON.stringify(comparison)
        ) {
            throw new Error("Fixtures or comparison settings changed. Review them and run npm run baseline:maps.");
        }
        for (const fixture of fixtures) {
            const item = reference.cases.find((item) => item.id === fixture.id);
            const buffer = readPng(path.join(referenceDirectory, fixture.id + ".png"));
            if (!item || sha256(buffer) !== item.sha256) {
                throw new Error("Reference image does not match manifest: " + fixture.id);
            }
        }
    }
    for (const entry of ["dist/index.html", "dist/typhoon.html"]) {
        if (!fs.existsSync(path.join(root, entry))) {
            throw new Error("Missing " + entry + ". Install dependencies and run npm run build.");
        }
    }
    const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomBytes(3).toString("hex");
    const directory = path.join(root, "output/map-baseline", runId);
    for (const name of ["actual", "expected", "diff"]) {
        fs.mkdirSync(path.join(directory, name), { recursive: true });
    }
    const report = {
        mode: config.update ? "record" : "compare",
        startedAt: new Date().toISOString(),
        runs: config.runs,
        warmups: config.warmups,
        fixtureSha256,
        fixedFooterTimestamp,
        comparison,
        warnings: [],
        failures: [],
        cases: fixtures.map(({ id, label }) => ({ id, label, passed: null, samples: [] })),
    };
    let browser;
    let server;
    let inspectionPage;
    let startupError;
    let activePhase = "startup";
    const runtimeErrors = [];
    const originalLaunch = puppeteer.launch;
    const originalLog = console.log;
    // Observe the existing application without changing its rendering or screenshot waits.
    puppeteer.launch = async function (...args) {
        browser = await originalLaunch.apply(this, args);
        const newPage = browser.newPage.bind(browser);
        browser.newPage = async function () {
            const page = await newPage();
            page.on("pageerror", (error) => runtimeErrors.push(activePhase + ": " + error.message));
            page.on("requestfailed", (request) => {
                runtimeErrors.push(activePhase + ": " + request.url() + " " + request.failure()?.errorText);
            });
            page.on("response", (response) => {
                if (response.status() >= 400) {
                    runtimeErrors.push(activePhase + ": HTTP " + response.status() + " " + response.url());
                }
            });
            return page;
        };
        return browser;
    };
    console.log = (...args) => {
        if (/^(Navigation|Screenshot|Cleanup) failed:/.test(String(args[0]))) {
            runtimeErrors.push(activePhase + ": " + args.join(" "));
        }
        originalLog(...args);
    };
    const handleRejection = (error) => { startupError = error; };
    process.on("unhandledRejection", handleRejection);

    try {
        server = require("../../backend");
        server.on("error", (error) => { startupError = error; });
        const deadline = performance.now() + 60000;
        while (!global.isBrowserLoaded) {
            if (startupError) throw startupError;
            if (global.browserInitializationError) throw global.browserInitializationError;
            if (performance.now() > deadline) throw new Error("Browser startup timed out after 60 seconds.");
            await sleep(50);
        }
        for (const page of [global.page, global.tsunamiPage, global.typhoonPage]) {
            await checkRenderedBaseMap(page, baseMapRegions);
            await page.evaluate(async (timestamp) => {
                if (!window.map || !window.ol || typeof window.setFooter !== "function") {
                    throw new Error("Map template did not initialize.");
                }
                await document.fonts.ready;
                const originalFooter = window.setFooter;
                window.setFooter = (text) => originalFooter(
                    text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, timestamp)
                );
            }, fixedFooterTimestamp);
        }
        if (runtimeErrors.length) throw new Error(runtimeErrors.join("\n"));
        report.environment = {
            platform: process.platform,
            arch: process.arch,
            node: process.version,
            puppeteer: require("puppeteer/package.json").version,
            browser: await browser.version(),
            openlayers: await global.page.evaluate(() => ol.VERSION),
            viewport: await global.page.viewport(),
        };
        if (reference) {
            for (const key of ["platform", "arch", "browser", "node", "puppeteer", "openlayers"]) {
                if (reference.environment[key] !== report.environment[key]) {
                    report.warnings.push(
                        key + " differs: reference=" + reference.environment[key] +
                        ", current=" + report.environment[key] + ". Inspect image differences."
                    );
                }
            }
        }
        inspectionPage = await browser.newPage();
        for (let round = 0; round < config.warmups; round++) {
            for (const fixture of fixtures) {
                activePhase = "warmup/" + fixture.id;
                await requestImage(fixture);
            }
        }
        if (runtimeErrors.length) throw new Error(runtimeErrors.join("\n"));
        const candidates = new Map();
        for (let round = 0; round < config.runs; round++) {
            for (const [index, fixture] of fixtures.entries()) {
                activePhase = fixture.id + "/" + (round + 1);
                const item = report.cases[index];
                const errorCount = runtimeErrors.length;
                try {
                    const { buffer, elapsedMs } = await requestImage(fixture);
                    if (runtimeErrors.length > errorCount) {
                        throw new Error(runtimeErrors.slice(errorCount).join("\n"));
                    }
                    const actualPath = path.join(directory, "actual", fixture.id + ".png");
                    if (!candidates.has(fixture.id)) {
                        candidates.set(fixture.id, buffer);
                        fs.writeFileSync(actualPath, buffer);
                    }
                    const expected = config.update
                        ? candidates.get(fixture.id)
                        : fs.readFileSync(path.join(referenceDirectory, fixture.id + ".png"));
                    fs.writeFileSync(path.join(directory, "expected", fixture.id + ".png"), expected);
                    const diffPath = path.join(directory, "diff", fixture.id + "-" + (round + 1) + ".png");
                    const diff = await compareImages(inspectionPage, expected, buffer, diffPath);
                    item.samples.push({ elapsedMs, ...diff });
                    if (round === 0 || diff.diffRatio > (item.maxDiffRatio || 0)) {
                        fs.writeFileSync(actualPath, buffer);
                        if (fs.existsSync(diffPath)) {
                            fs.copyFileSync(diffPath, path.join(directory, "diff", fixture.id + ".png"));
                        }
                    }
                    item.maxDiffRatio = Math.max(item.maxDiffRatio || 0, diff.diffRatio);
                    if (!diff.passed) {
                        item.passed = false;
                        report.failures.push(activePhase + ": pixel difference " + (diff.diffRatio * 100).toFixed(4) + "%");
                    }
                    originalLog(activePhase + ": " + elapsedMs.toFixed(1) + " ms, diff " +
                        (diff.diffRatio * 100).toFixed(4) + "%");
                } catch (error) {
                    item.passed = false;
                    // A request that hung may still hold the application's page lock.
                    // Stop here rather than mixing it with subsequent samples.
                    throw new Error(activePhase + ": " + error.message);
                }
            }
        }
        for (const item of report.cases) {
            item.timing = timing(item.samples.map((sample) => sample.elapsedMs));
        }
        if (config.update && !report.failures.length) {
            fs.mkdirSync(referenceDirectory, { recursive: true });
            const cases = report.cases.map((item) => {
                const buffer = candidates.get(item.id);
                fs.writeFileSync(path.join(referenceDirectory, item.id + ".png"), buffer);
                return { id: item.id, label: item.label, sha256: sha256(buffer), timing: item.timing };
            });
            fs.writeFileSync(path.join(referenceDirectory, "manifest.json"), JSON.stringify({
                schemaVersion: 1,
                recordedAt: report.startedAt,
                fixtureSha256,
                fixedFooterTimestamp,
                comparison,
                environment: report.environment,
                warmups: config.warmups,
                runs: config.runs,
                cases,
            }, null, 2) + "\n");
        }
    } catch (error) {
        report.failures.push(error.message);
    } finally {
        for (const item of report.cases) {
            item.passed = item.samples.length === config.runs && item.samples.every((sample) => sample.passed);
            if (item.samples.length) {
                item.timing = timing(item.samples.map((sample) => sample.elapsedMs));
            }
        }
        report.passed = !report.failures.length;
        report.finishedAt = new Date().toISOString();
        try {
            await writeReport(directory, report, inspectionPage);
        } catch (error) {
            report.failures.push("Report generation failed: " + error.message);
            report.passed = false;
            await writeReport(directory, report);
        }
        puppeteer.launch = originalLaunch;
        console.log = originalLog;
        if (browser) await browser.close();
        if (server) {
            server.closeAllConnections?.();
            await new Promise((resolve) => server.close(resolve));
        }
        process.removeListener("unhandledRejection", handleRejection);
    }
    console.log("Report: " + path.join(directory, "report.html"));
    console.log(report.passed ? "All " + fixtures.length + " map scenarios passed." :
        "Map baseline FAILED: " + report.failures.join("\n"));
    process.exitCode = report.passed ? 0 : 1;
}

run().then(
    () => process.exit(process.exitCode || 0),
    (error) => {
        console.error(error.message);
        process.exit(1);
    }
);
