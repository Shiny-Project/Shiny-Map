const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { prepare } = require("../../backend/service/TsunamiInput");
const areas = require("../../data/jma_tsunami_areas.json");
const officialSamples = require("./official-samples.json");

test("all 66 official GIS areas have coastlines and accept codes, current names and legacy aliases", () => {
    const metadata = require("../../data/jma_tsunami_areas.sources.json");
    const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    assert.equal(sha("data/jma_tsunami_areas.json"), metadata.outputSha256);
    assert.equal(sha(metadata.coastlinePath), metadata.coastlineSha256);
    assert.equal(Object.keys(areas).length, 66);
    for (const [code, area] of Object.entries(areas)) {
        for (const value of [code, Number(code), area.name, ...(area.aliases || [])]) {
            const result = prepare({ forecast: [value] });
            assert.deepEqual(result.areaLevelMap, { [code]: "forecast" });
            assert.equal(result.areaData.features.length, 1, String(value));
        }
    }
    assert.equal(prepare({ forecast: Object.keys(areas) }).areaData.features.length, 66);
});

test("JMA sample current Kind codes preserve forecasts and exclude plain releases", () => {
    for (const sample of officialSamples) {
        const result = prepare(sample.warning);
        assert.deepEqual(prepare(JSON.stringify(sample.warning)), result);
        const counts = {};
        for (const level of Object.values(result.areaLevelMap)) counts[level] = (counts[level] || 0) + 1;
        assert.deepEqual(counts, sample.expectedCounts, sample.sourceFile);
        assert.equal(result.areaData.features.length, Object.keys(result.areaLevelMap).length);
    }
    for (const kind of ["71", "72", "73"]) {
        assert.deepEqual(prepare({ [kind]: ["300"] }).areaLevelMap, { "300": "forecast" });
    }
});

test("higher warnings win even when a forecast repeats the same coast under a different alias", () => {
    assert.deepEqual(prepare({
        alert: ["300"], warning: ["600"], notice: ["521"],
        forecast: ["茨城県", "愛媛県宇和海", "兵庫県瀬戸内海沿岸", "601"],
    }).areaLevelMap, { "300": "alert", "521": "notice", "600": "warning", "601": "forecast" });
});

test("cancel preserves only residual forecasts and still accepts legacy requests without warning data", () => {
    for (const raw of [undefined, null, "invalid JSON", [], { notice: ["300"] }]) {
        assert.equal(prepare(raw, true).areaData.features.length, 0);
    }
    const result = prepare({ notice: ["300"], forecast: ["521"], "72": ["600"], "73": ["601"] }, true);
    assert.deepEqual(result.areaLevelMap, { "521": "forecast", "600": "forecast", "601": "forecast" });
    assert.equal(result.hasForecast, true);
    assert.equal(result.hasWarning, false);
});

test("bad inputs return an input error instead of producing an empty or invalid map extent", () => {
    for (const input of [undefined, null, [], "bad JSON", { forecast: "茨城県" },
        { forecast: ["unknown"] }, { forecast: ["0"] }, { forecast: [["300"]] }, { typo: [] }]) {
        assert.throws(() => prepare(input), { name: "TsunamiInputError" });
    }
    for (const input of [{}, { forecast: [] }, { "00": ["300"], "50": ["521"], "60": ["601"] }]) {
        assert.equal(prepare(input).areaData.features.length, 0);
    }
});
