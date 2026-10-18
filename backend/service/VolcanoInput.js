const codes = require("../../data/jma_volcano_codes.json");
const styles = require("../../data/jma_volcano_styles.json");
const areas = new Set(require("../../data/jma_volcano_areas.json").features
    .map((feature) => feature.properties.code));
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const responseConditions = ["発表", "引上げ", "切替", "継続", "引下げ", "解除"];

function invalid(message) {
    const error = new Error(message);
    error.name = "VolcanoInputError";
    throw error;
}

function coordinate(input) {
    let result = input;
    if (typeof input === "string") {
        // VFVO50 uses ISO 6709 degrees/minutes, unlike earthquake decimal degrees.
        const match = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?\/$/.exec(input);
        if (!match) invalid("无法解析火山 Coordinate");
        const lengths = match.slice(1, 3).map((part) => part.slice(1).split(".")[0].length);
        const minutes = lengths[0] === 4 && lengths[1] === 5;
        if (!minutes && !(lengths[0] === 2 && lengths[1] === 3)) invalid("火山 Coordinate 的度分格式错误");
        const degrees = match.slice(1, 3).map((part) => {
            const value = Math.abs(Number(part));
            const remainder = value % 100;
            if (minutes && remainder >= 60) invalid("火山 Coordinate 的分值必须小于 60");
            return Math.sign(Number(part)) * (minutes ? Math.floor(value / 100) + remainder / 60 : value);
        });
        result = [degrees[1], degrees[0]];
    }
    if (!Array.isArray(result) || result.length !== 2 || !result.every(Number.isFinite) ||
        Math.abs(result[0]) > 180 || Math.abs(result[1]) > 85) invalid("coordinate 需要为有效的 [经度, 纬度] 或 JMA Coordinate");
    return [...result];
}

function kind(item, type) {
    if (!object(item) || !Object.hasOwn(styles[type], item.kind)) invalid("未知 " + type + " 种类代码");
    if (typeof item.kind !== "string") invalid("种类代码需要为字符串");
    const result = { kind: item.kind, ...styles[type][item.kind] };
    // Response condition still distinguishes a released area from a continuing forecast.
    if (type === "response" && item.condition !== undefined) {
        if (!responseConditions.includes(item.condition)) invalid("无效的 response Condition");
        result.condition = item.condition;
    }
    return result;
}

function cityItems(input, field, type) {
    const values = input[field] ?? [];
    if (!Array.isArray(values)) invalid(field + " 需要为数组");
    const result = new Map();
    for (const item of values) {
        const state = kind(item, type);
        if (typeof item.code !== "string" || !areas.has(item.code)) invalid("未知火山市町村代码：" + item.code);
        const value = { ...state, code: item.code };
        if (result.has(item.code) && JSON.stringify(result.get(item.code)) !== JSON.stringify(value)) {
            invalid(field + " 中同一市町村存在冲突状态：" + item.code);
        }
        result.set(item.code, value);
    }
    return [...result.values()];
}

function prepare(input) {
    if (typeof input === "string") {
        try { input = JSON.parse(input); }
        catch { invalid("warning 无法解析为 JSON"); }
    }
    if (!object(input)) invalid("warning 需要为对象");
    const status = input.status ?? "通常";
    const infoType = input.infoType ?? "発表";
    if (!["通常", "試験", "訓練"].includes(status)) invalid("status 仅支持 通常、試験、訓練");
    if (!["発表", "訂正", "取消"].includes(infoType)) invalid("infoType 仅支持 発表、訂正、取消");
    const state = kind(input.volcano, "volcano");
    const code = input.volcano.code;
    if (typeof code !== "string" || !Object.hasOwn(codes.volcanoes, code)) invalid("未知火山代码：" + code);
    const volcano = codes.volcanoes[code];
    const position = input.volcano.coordinate === undefined ? volcano.coordinate : input.volcano.coordinate;
    if (position === undefined) invalid("火山代码 " + code + " 没有固定位置，请提供 volcano.coordinate");
    return {
        status, infoType,
        volcano: { ...state, code, volcanoName: volcano.name, coordinate: coordinate(position) },
        areas: cityItems(input, "areas", "area"),
        responses: cityItems(input, "responses", "response"),
    };
}

module.exports = { prepare, coordinate };
