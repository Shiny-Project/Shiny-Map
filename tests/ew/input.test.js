const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { prepare, kinds } = require("../../backend/service/EWInput");
const fixtures = require("./fixtures");

test("GIS is the pinned weather dataset and includes current split areas with unique codes", () => {
    const buffer = fs.readFileSync("data/jma_weather_areas.json");
    const metadata = require("../../data/jma_weather_areas.sources.json");
    assert.equal(crypto.createHash("sha256").update(buffer).digest("hex"), metadata.outputSha256);
    const features = JSON.parse(buffer).features;
    assert.equal(features.length, 1805);
    assert.equal(metadata.featureCount, features.length);
    assert.equal(metadata.excludedUncodedLandFeatures, 16);
    const codes = features.map((feature) => feature.properties.code);
    assert.equal(new Set(codes).size, codes.length);
    for (const code of codes) assert.match(code, /^\d{7}$/);
    for (const code of ["1410011", "1410012", "2920101", "2920102", "1620111", "4320212"]) {
        assert.ok(codes.includes(code), code);
    }
});

test("all drawing samples accept JSON objects and form-encoded JSON strings", () => {
    for (const fixture of fixtures) {
        assert.deepEqual(prepare(fixture.warning), prepare(JSON.stringify(fixture.warning)), fixture.id);
    }
    assert.equal(Object.keys(kinds).length, 7);
});
