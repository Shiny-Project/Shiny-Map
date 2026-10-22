const assert = require("node:assert/strict");
const { test } = require("node:test");
const { prepare } = require("../../backend/service/EarthquakeInput");
const fixtures = require("./fixtures");

test("legacy USGS payload preserves location order and converts elevation to depth", () => {
    const result = prepare(fixtures[0].earthquake);
    assert.deepEqual(result.coordinate, [93.7797, 32.3805]);
    assert.equal(result.magnitude, 7);
    assert.equal(result.depthKm, 18);
    assert.equal(result.region, "中国");
    assert.equal(result.description, "Nagqu 东北偏东方 191 千米");
    assert.equal(prepare({ ...fixtures[0].earthquake, depth: "1500" }).depthKm, -1.5);
    assert.equal(prepare({ ...fixtures[0].earthquake, location: "0 0", depth: 0 }).depthKm, 0);
    assert.equal(prepare({ ...fixtures[0].earthquake, source: " Example " }).source, "Example");
    assert.equal(prepare(fixtures[6].earthquake).source, "");
    for (const fixture of fixtures) assert.deepEqual(prepare(JSON.stringify(fixture.earthquake)), prepare(fixture.earthquake));
});

test("region-only, multi-comma and unknown place descriptions remain usable", () => {
    const ocean = prepare(fixtures[3].earthquake);
    assert.equal(ocean.region, "South Sandwich Islands region");
    assert.equal(ocean.description, "");
    assert.equal(prepare(fixtures[6].earthquake).region, "日本");
    assert.equal(prepare(fixtures[6].earthquake).description, "");
    assert.equal(prepare(fixtures[8].earthquake).description,
        "San Sebastián de La Gomera, Canary Islands 东北偏北方 100 千米");
    const input = (content) => prepare({ ...fixtures[0].earthquake, content });
    assert.equal(input("M 5.6 - Puerto Rico").region, "波多黎各");
    assert.equal(input("M 5.6 - near the coast of Chile").region, "near the coast of Chile");
    assert.equal(input("M 5.6 - Ridge, Unknown region").description, "Ridge");
    assert.equal(input("M 5.6 - Town, __proto__").region, "__proto__");
});

test("invalid payloads are rejected before they reach a map page", () => {
    const base = fixtures[0].earthquake;
    for (const input of [undefined, null, [], true, "{", {},
        { ...base, location: "" }, { ...base, location: "10" },
        { ...base, location: "91 0" }, { ...base, location: "0 -181" },
        { ...base, location: "NaN 120" }, { ...base, location: "0 0 0" },
        { ...base, depth: "" }, { ...base, depth: null }, { ...base, depth: true },
        { ...base, depth: "Infinity" }, { ...base, content: "no magnitude" },
        { ...base, source: 42 }, { ...base, source: "x".repeat(33) },
        { ...base, content: "M 99 - nowhere" }, { ...base, content: "M 5 - " + "x".repeat(501) },
    ]) assert.throws(() => prepare(input), { name: "EarthquakeInputError" });
});
