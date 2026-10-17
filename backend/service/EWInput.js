const kinds = require("../../data/jma_ew_kinds.json");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function invalid(message) {
    const error = new Error(message);
    error.name = "EWInputError";
    throw error;
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
    const areas = new Map(require("../../data/jma_weather_areas.json").features
        .map((feature) => [feature.properties.code, feature.properties.name]));
    const items = new Map();
    for (const [field, state] of [["active", "active"], ["ended", "ended"]]) {
        const groups = input[field] ?? {};
        if (!object(groups)) invalid(field + " 需要为警报种类到区域代码数组的对象");
        for (const [code, areaCodes] of Object.entries(groups)) {
            if (!Object.hasOwn(kinds, code)) invalid("未知特别警报种类代码：" + code);
            if (!Array.isArray(areaCodes)) invalid(field + "." + code + " 需要为区域代码数组");
            for (const areaCode of new Set(areaCodes)) {
                if (typeof areaCode !== "string" || !areas.has(areaCode)) {
                    invalid("未知气象警报区域代码：" + String(areaCode));
                }
                if (!items.has(areaCode)) items.set(areaCode, { areaCode, name: areas.get(areaCode), kinds: [] });
                items.get(areaCode).kinds.push({ code, state });
            }
        }
    }
    return {
        status, infoType, items: [...items.values()],
    };
}

module.exports = { prepare, kinds };
