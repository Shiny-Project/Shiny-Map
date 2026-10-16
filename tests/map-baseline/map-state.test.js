const { test } = require("node:test");
const assert = require("node:assert/strict");
const { assertMapStateMatches } = require("./map-state");

const reference = {
    center: [14000000, 4000000],
    zoom: 7.3,
    features: [{ pixel: [100, 200], styles: [{ fill: "red", scale: 0.05 }] }],
};

test("map state permits only floating point projection noise", () => {
    const actual = structuredClone(reference);
    actual.center[0] += 1e-8;
    assert.doesNotThrow(() => assertMapStateMatches(actual, reference));
});

test("map state rejects a missing marker", () => {
    const actual = structuredClone(reference);
    actual.features = [];
    assert.throws(() => assertMapStateMatches(actual, reference));
});

test("map state rejects shifted markers, changed colors and changed scale", () => {
    for (const change of [
        (actual) => { actual.features[0].pixel[0] += 1; },
        (actual) => { actual.features[0].styles[0].fill = "blue"; },
        (actual) => { actual.features[0].styles[0].scale = 0.04; },
    ]) {
        const actual = structuredClone(reference);
        change(actual);
        assert.throws(() => assertMapStateMatches(actual, reference));
    }
});
