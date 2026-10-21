const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { prepare } = require("../../backend/service/FloodInput");
const rivers = require("../../data/jma_flood_rivers.json");
const kinds = require("../../data/jma_flood_kinds.json");
const samples = require("./official-samples.json");
const fixtures = require("./fixtures");
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

test("flood GIS, forecast areas and original official samples match recorded provenance", () => {
    const meta = require("../../data/jma_flood_areas.sources.json");
    for (const [file, key] of [["data/jma_flood_areas.json", "outputSha256"],
        ["data/jma_flood_rivers.json", "riversOutputSha256"], ["data/jma_flood_kinds.json", "kindsOutputSha256"],
        ["tests/flood/official-samples.json", "samplesOutputSha256"]]) assert.equal(hash(file), meta[key]);
    const features = require("../../data/jma_flood_areas.json").features;
    const codes = new Set(features.map((item) => item.properties.code));
    assert.equal(features.length, 1741);
    assert.equal(codes.size, features.length);
    assert.equal(codes.has("1410011"), false);
    assert.equal(codes.has("1410000"), true);
    assert.equal(Object.keys(rivers).length, 338);
    for (const [code, river] of Object.entries(rivers)) {
        assert.match(code, /^\d{12}$/);
        assert.ok(river.areas.length && river.areas.every((city) => codes.has(city)), code);
        assert.equal(prepare({ rivers: [{ code, kind: "20" }] }).rivers[0].name, river.name);
    }
    for (const sample of samples) assert.equal(hash("tests/flood/official/" + sample.file), sample.sha256);
});

test("official XML forecast codes and body city lists are kept distinct from river and station codes", () => {
    for (const sample of samples) {
        const xml = fs.readFileSync("tests/flood/official/" + sample.file, "utf8");
        const information = xml.match(/<Information type="指定河川洪水予報（予報区域）">([\s\S]*?)<\/Information>/)[1];
        const code = information.match(/<Area>\s*<Name>[^<]*<\/Name>\s*<Code>(\d+)<\/Code>/)[1];
        const kind = information.match(/<Kind>[\s\S]*?<Code>(\d+)<\/Code>/)[1];
        assert.equal(sample.warning.rivers[0].code, code);
        assert.equal(sample.warning.rivers[0].kind, kind);
        const expected = { "1": new Set(), "2": new Set() };
        const body = xml.split(/<Body\b/)[1];
        for (const item of body.matchAll(/<Item>([\s\S]*?)<\/Item>/g)) {
            const type = item[1].match(/<Kind>[\s\S]*?<Code>([12])<\/Code>/)?.[1];
            if (type) for (const city of item[1].matchAll(/<CityCode>(\d+)<\/CityCode>/g)) expected[type].add(city[1]);
        }
        const result = prepare(sample.warning);
        if (expected["1"].size) {
            assert.deepEqual(result.rivers[0].areas, [...new Set([...expected["1"], ...expected["2"]])].sort());
        } else assert.deepEqual(result.rivers[0].areas, [...new Set([...rivers[code].areas, ...expected["2"]])].sort());
        assert.deepEqual(result.rivers[0].occurredAreas, [...expected["2"]].sort());
        assert.deepEqual(prepare(JSON.stringify(sample.warning)), result);
    }
});

test("all ten JMA kinds validate; 22 is active L2, 10 is released, 51 alone does not imply confirmed flooding", () => {
    assert.deepEqual(Object.keys(kinds).sort(), ["10", "20", "21", "22", "30", "31", "40", "41", "51", "53"]);
    const byKind = (kind) => prepare({ rivers: [{ code: "840410000100", kind }] });
    for (const code of Object.keys(kinds)) assert.ok(byKind(code).areas.length);
    assert.ok(byKind("22").areas.every((area) => !area.ended && area.level === 2 && area.color === "#faf500"));
    assert.ok(byKind("10").areas.every((area) => area.ended && area.color === "#9da7b1"));
    assert.ok(byKind("51").areas.every((area) => !area.occurred));
    assert.ok(prepare(samples[7].warning).areas.some((area) => area.occurred));
});

test("shared municipalities use highest active warning and retain an explicit occurrence marker", () => {
    const input = { rivers: [
        { code: "830303000101", kind: "10", areas: ["1121000", "1123200"] },
        { code: "830303000103", kind: "51", areas: ["1121000"], occurredAreas: ["1121000"] },
        { code: "830303000102", kind: "22", areas: ["1121000", "1123200"] },
    ] };
    const states = Object.fromEntries(prepare(input).areas.map((area) => [area.code, area]));
    assert.equal(states["1121000"].level, 5);
    assert.equal(states["1121000"].occurred, true);
    assert.equal(states["1123200"].level, 2);
    assert.equal(states["1123200"].ended, false);
    const reverse = prepare({ rivers: [...input.rivers].reverse() });
    for (const area of reverse.areas) assert.deepEqual(area, states[area.code]);
    const cancelled = prepare({ ...input, infoType: "取消" });
    assert.ok(cancelled.areas.every((area) => area.ended && !area.occurred && area.color === "#9da7b1"));
});

test("duplicate values normalize without mutating the caller or default lookup", () => {
    const input = { rivers: [{ code: "840410000100", kind: "20", areas: ["1620200", "1620200"] }] };
    const original = structuredClone(input);
    input.rivers.push(structuredClone(input.rivers[0]));
    const result = prepare(input);
    assert.equal(result.rivers.length, 1);
    assert.deepEqual(result.rivers[0].areas, ["1620200"]);
    result.rivers[0].areas.push("1621000");
    assert.deepEqual(input.rivers[0], original.rivers[0]);
    const defaulted = prepare({ rivers: [{ code: "840410000100", kind: "20" }] });
    defaulted.rivers[0].areas.length = 0;
    assert.ok(rivers["840410000100"].areas.length);
});

test("reject malformed input, wrong code domains, ambiguous states and invalid occurrence lists", () => {
    const river = { code: "840410000100", kind: "20" };
    const badRivers = [null, [], {}, { code: "8404100001", kind: "20" }, { code: "000000000000", kind: "20" },
        { ...river, code: 840410000100 }, { ...river, kind: 20 }, { ...river, kind: "50" },
        { ...river, kind: "52" }, { ...river, kind: "toString" }, { ...river, areas: [] },
        { ...river, areas: null }, { ...river, areas: "1620200" }, { ...river, areas: [1620200] },
        { ...river, areas: ["1410011"] }, { ...river, occurredAreas: ["1620200"] },
        { ...river, kind: "51", occurredAreas: ["0000000"] },
        { ...river, kind: "51", occurredAreas: "1620200" }];
    for (const value of [undefined, null, [], "{", "[]", {}, { rivers: [] }, { rivers: {} },
        { rivers: [river], status: "normal" }, { rivers: [river], infoType: "解除" },
        { rivers: [river, { ...river, kind: "40" }] }, ...badRivers.map((item) => ({ rivers: [item] }))]) {
        assert.throws(() => prepare(value), { name: "FloodInputError" }, JSON.stringify(value));
    }
});

test("all rendering fixtures validate", () => {
    for (const fixture of fixtures) assert.doesNotThrow(() => prepare(fixture.warning), fixture.id);
});
