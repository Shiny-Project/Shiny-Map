const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { checkMapData } = require("./base-map-check");

const root = path.resolve(__dirname, "../..");
const map = require("../../data/world_base.json");
const china = map.features.find((feature) => feature.properties.code === "CHN");

test("the final basemap matches its recorded checksum and contains valid China boundary rings", () => {
    assert.equal(checkMapData(root), 242);
    for (const polygon of china.geometry.coordinates) {
        for (const ring of polygon) {
            assert.ok(ring.length >= 4);
            assert.deepEqual(ring[0], ring.at(-1), "Unclosed boundary ring.");
            for (const [longitude, latitude] of ring) {
                assert.ok(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);
                assert.ok(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90);
            }
        }
    }
});

test("Zangnan and western border reference points belong to CHN without a duplicate outline", async () => {
    const { default: GeoJSON } = await import("ol/format/GeoJSON.js");
    const features = new GeoJSON().readFeatures(map);
    const cases = [
        ["Tawang", [91.864, 27.585], "CHN"],
        ["Itanagar", [93.605, 27.084], "CHN"],
        ["Pasighat", [95.325, 28.067], "CHN"],
        ["Aksai Chin", [79, 35], "CHN"],
        ["Demchok", [79.41, 32.69], "CHN"],
        ["Guwahati", [91.7362, 26.1445], "IND"],
        ["Tinsukia", [95.359, 27.489], "IND"],
        ["New Delhi", [77.21, 28.61], "IND"],
        ["Thimphu", [89.64, 27.47], "BTN"],
        ["Kathmandu", [85.324, 27.717], "NPL"],
        ["Tokyo", [139.69, 35.69], "JPN"],
        ["Taipei", [121.56, 25.03], "TWN"],
    ];
    for (const [name, coordinate, code] of cases) {
        const hits = features.filter((feature) => feature.getGeometry().intersectsCoordinate(coordinate));
        assert.deepEqual(hits.map((feature) => feature.get("code")), [code], name);
    }
});
