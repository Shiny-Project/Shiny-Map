const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { prepare, coordinate } = require("../../backend/service/VolcanoInput");
const samples = require("./official-samples.json");
const fixtures = require("./fixtures");

test("volcano GIS, code tables and official XML fixtures match their recorded provenance", () => {
    const metadata = require("../../data/jma_volcano_areas.sources.json");
    const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    assert.equal(hash("data/jma_volcano_areas.json"), metadata.outputSha256);
    assert.equal(hash("data/jma_volcano_codes.json"), metadata.codesOutputSha256);
    assert.equal(hash("tests/volcano/official-samples.json"), metadata.samplesOutputSha256);
    const features = require("../../data/jma_volcano_areas.json").features;
    assert.equal(features.length, 1745);
    assert.equal(new Set(features.map((item) => item.properties.code)).size, features.length);
    assert.equal(features.find((item) => item.properties.code === "1438200").properties.name, "神奈川県箱根町");
    // Fire/volcano uses whole municipalities, unlike the weather-warning split areas.
    assert.equal(features.some((item) => item.properties.code === "1410011"), false);
    assert.equal(features.some((item) => item.properties.code === "1410000"), true);
    for (const sample of samples) {
        assert.equal(hash("tests/volcano/official/" + sample.sourceFile), sample.sourceSha256);
    }
});

test("official VFVO50 samples retain the volcano, warning types and municipality responses separately", () => {
    const results = samples.map((sample) => prepare(sample.warning));
    assert.deepEqual(results.map((item) => item.volcano.kind), ["13", "15", "11"]);
    assert.deepEqual(results.map((item) => item.areas.length), [4, 1, 2]);
    assert.deepEqual(results.map((item) => item.responses.length), [4, 1, 3]);
    assert.equal(results[0].volcano.volcanoName, "浅間山");
    assert.equal(results[1].volcano.special, true);
    assert.ok(results[2].areas.every((item) => item.ended));
    assert.equal(results[2].responses.find((item) => item.code === "1042100").condition, "継続");
    for (const sample of samples) assert.deepEqual(prepare(JSON.stringify(sample.warning)), prepare(sample.warning));
});

test("JMA degree-minute coordinates are converted to longitude/latitude, including submarine altitudes", () => {
    const asama = coordinate("+3624.38+13831.38+2568/");
    assert.ok(Math.abs(asama[0] - 138.523) < 1e-10);
    assert.ok(Math.abs(asama[1] - 36.4063333333) < 1e-9);
    assert.ok(Math.abs(coordinate("+2417.08+14128.87-29/")[0] - 141.4811666667) < 1e-9);
    assert.deepEqual(coordinate("-3630.00-13830.00+0/"), [-138.5, -36.5]);
    assert.deepEqual(coordinate("+36.5+138.5+0/"), [138.5, 36.5]);
    assert.deepEqual(coordinate([138.5, 36.5]), [138.5, 36.5]);
    for (const value of [null, [36], [138, 36, 0], [181, 36], [138, 86], ["138", 36], [NaN, 36],
        "+3660.00+13830.00+0/", "+3624+138.5/", "+3624.38+13831.38", "+9999+99999/"]) {
        assert.throws(() => coordinate(value), { name: "VolcanoInputError" });
    }
});

test("every specific volcano code has a default position, including submarine volcanoes and subregions", () => {
    const volcanoes = require("../../data/jma_volcano_codes.json").volcanoes;
    const positioned = Object.entries(volcanoes).filter(([, item]) => item.coordinate);
    assert.equal(positioned.length, 117);
    for (const [code, item] of positioned) {
        const warning = { volcano: { code, kind: "11" } };
        assert.deepEqual(prepare(warning).volcano.coordinate, coordinate(item.coordinate), code);
        assert.deepEqual(prepare(JSON.stringify(warning)), prepare(warning), code);
    }
    for (const [code, expected] of Object.entries({
        "306": [138.523, 36.406], "331": [141.481, 24.285],
        "350": [138.536, 36.643], "351": [138.527, 36.618],
        "550": [130.91, 31.886], "551": [130.886, 31.909],
        "552": [130.854, 31.947], "553": [130.897, 31.926],
    })) {
        assert.deepEqual(prepare({ volcano: { code, kind: "11" } }).volcano.coordinate, expected, code);
    }
    const warning = { volcano: { code: "306", kind: "13" } };
    const result = prepare(warning);
    result.volcano.coordinate[0] = 0;
    assert.deepEqual(prepare(warning).volcano.coordinate, [138.523, 36.406]);
    assert.equal(Object.hasOwn(warning.volcano, "coordinate"), false);
});

test("explicit coordinates override defaults, while invalid supplied coordinates are rejected", () => {
    const warning = { volcano: { code: "306", kind: "13", coordinate: [139, 35] } };
    const result = prepare(warning);
    assert.deepEqual(result.volcano.coordinate, [139, 35]);
    result.volcano.coordinate[0] = 0;
    assert.deepEqual(warning.volcano.coordinate, [139, 35]);
    warning.volcano.coordinate = "+3624.38+13831.38+2568/";
    assert.deepEqual(prepare(warning).volcano.coordinate, coordinate(warning.volcano.coordinate));
    for (const value of [null, "", [], [181, 35], ["139", 35], "+3660+13830/"]) {
        warning.volcano.coordinate = value;
        assert.throws(() => prepare(warning), { name: "VolcanoInputError" });
    }
});

test("generic volcano codes require an explicit coordinate instead of inventing a location", () => {
    for (const code of ["900", "901", "902"]) {
        const warning = { volcano: { code, kind: "22" } };
        assert.throws(() => prepare(warning), { name: "VolcanoInputError", message: /volcano\.coordinate/ });
        warning.volcano.coordinate = [140, 30];
        assert.deepEqual(prepare(warning).volcano.coordinate, [140, 30]);
    }
});

test("all simulated rendering states validate, and cancellation keeps the telegram identity", () => {
    for (const fixture of fixtures) assert.doesNotThrow(() => prepare(fixture.warning), fixture.id);
    const input = structuredClone(samples[1].warning);
    input.infoType = "取消";
    const result = prepare(input);
    assert.equal(result.infoType, "取消");
    assert.equal(result.volcano.kind, "15");
    assert.equal(result.areas[0].ended, undefined);
});

test("unknown codes, conflicting municipality states and codes from other volcano products are rejected", () => {
    const base = samples[0].warning;
    const invalid = [null, [], "invalid", {}, { ...base, status: "通常状態" }, { ...base, infoType: "解除" },
        { ...base, volcano: { ...base.volcano, code: "000" } },
        { ...base, volcano: { ...base.volcano, kind: "06" } },
        { ...base, volcano: { ...base.volcano, kind: 13 } },
        { ...base, areas: [{ code: "1410011", kind: "02" }] },
        { ...base, areas: [{ code: "1438200", kind: "43" }] },
        { ...base, areas: [{ code: "1438200", kind: "02" },
            { code: "1438200", kind: "04" }] },
        { ...base, responses: [{ code: "1438200", kind: "02" }] },
        { ...base, responses: [{ code: "1438200", kind: "45", condition: "invalid" }] },
        { ...base, responses: {} }];
    for (const input of invalid) assert.throws(() => prepare(input), { name: "VolcanoInputError" });
    const duplicate = structuredClone(base);
    duplicate.areas.push(duplicate.areas[0]);
    assert.equal(prepare(duplicate).areas.length, 4);
});

test("every VFVO50 volcano keyword and response code is supported without inventing a numeric level", () => {
    const styles = require("../../data/jma_volcano_styles.json");
    for (const kind of Object.keys(styles.volcano)) {
        const warning = structuredClone(samples[0].warning);
        warning.volcano = { ...warning.volcano, kind };
        const result = prepare(warning).volcano;
        assert.equal(result.level, kind.startsWith("1") ? Number(kind[1]) : undefined);
    }
    for (const kind of Object.keys(styles.response)) {
        const warning = structuredClone(samples[0].warning);
        warning.responses = [{ code: "1042500", kind, condition: "発表" }];
        assert.equal(prepare(warning).responses[0].kind, kind);
    }
});
