const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const regionalCodes = ["CHN", "JPN", "PRK", "KOR", "TWN"];
const locations = {
    RUS: [142.8, 50],
    CAN: [-100, 60],
    BRA: [-55, -10],
    AUS: [134, -25],
    CHN: [116.4, 39.9],
    JPN: [139.69, 35.69],
    PRK: [125.75, 39.03],
    KOR: [126.98, 37.56],
    TWN: [121.56, 25.03],
};
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

function checkMapData(root) {
    const dataPath = path.join(root, "data");
    const metadata = JSON.parse(fs.readFileSync(path.join(dataPath, "world_base.sources.json"), "utf8"));
    const buffer = fs.readFileSync(path.join(dataPath, "world_base.json"));
    assert.equal(sha256(buffer), metadata.outputSha256, "Base map does not match its source metadata.");
    const map = JSON.parse(buffer.toString("utf8"));
    const codes = map.features.map((feature) => feature.properties.code);
    assert.equal(new Set(codes).size, codes.length, "Base map contains duplicate regional outlines.");
    assert.deepEqual(
        map.features.filter((feature) => feature.properties.detail === "regional").map((feature) => feature.properties.code),
        regionalCodes,
        "High-detail regions must replace their world counterparts."
    );
    return codes.length;
}

async function checkRenderedBaseMap(page, expectedCount) {
    const result = await page.evaluate(({ locations }) => {
        const base = map.getLayers().getArray()[0];
        const source = base.getSource();
        return {
            name: base.get("name"),
            visible: base.getVisible(),
            count: source.getFeatures().length,
            locations: Object.fromEntries(Object.entries(locations).map(([code, coordinate]) => [
                code,
                source.getFeaturesAtCoordinate(ol.proj.fromLonLat(coordinate)).map((feature) => feature.get("code")),
            ])),
        };
    }, { locations });
    assert.equal(result.name, "world_base", "World base must render beneath administrative and hazard layers.");
    assert.equal(result.visible, true);
    assert.equal(result.count, expectedCount, "World base did not finish loading.");
    for (const code of Object.keys(locations)) {
        assert.ok(result.locations[code].includes(code), "Missing land at reference location: " + code);
    }
}

module.exports = { checkMapData, checkRenderedBaseMap };
