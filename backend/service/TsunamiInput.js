const areas = require("../../data/jma_tsunami_areas.json");
const coastlines = require("../definition/jma_tsunami_area.json");

// JMA TsunamiWarning table (sheet 14). Duplicate coasts keep the highest
// severity, regardless of the order of groups in the request.
const groups = {
    "00": null, "50": null, "60": null,
    forecast: "forecast", "71": "forecast", "72": "forecast", "73": "forecast",
    notice: "notice", "62": "notice",
    warning: "warning", "51": "warning",
    alert: "alert", "52": "alert", "53": "alert",
};
const levels = ["forecast", "notice", "warning", "alert"];
const areaCodes = new Map();
for (const [code, area] of Object.entries(areas)) {
    for (const name of [code, area.name, ...(area.aliases || [])]) areaCodes.set(name, code);
}

function invalid(message) {
    const error = new Error(message);
    error.name = "TsunamiInputError";
    throw error;
}

function prepare(raw, cancel = false) {
    let data = raw;
    if (typeof data === "string") {
        try {
            data = JSON.parse(data);
        } catch (error) {
            if (!cancel) invalid("无法解析 warning JSON");
            data = {};
        }
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        if (!cancel) invalid("warning 需要为对象");
        data = {};
    }
    const areaLevelMap = {};
    for (const [group, entries] of Object.entries(data)) {
        if (cancel && groups[group] !== "forecast") continue;
        if (!Object.hasOwn(groups, group)) invalid("不支持的海啸等级：" + group);
        if (!Array.isArray(entries)) invalid(group + " 需要为区域数组");
        const level = groups[group];
        if (!level) continue; // No tsunami, or a release without a residual forecast.
        for (const entry of entries) {
            if (typeof entry !== "string" && typeof entry !== "number") invalid("津波预报区需要为名称或代码");
            const code = areaCodes.get(String(entry));
            if (!code) invalid("不支持的津波预报区：" + entry);
            if (!areaLevelMap[code] || levels.indexOf(level) > levels.indexOf(areaLevelMap[code])) {
                areaLevelMap[code] = level;
            }
        }
    }
    const activeLevels = Object.values(areaLevelMap);
    return {
        areaLevelMap,
        areaData: {
            type: "FeatureCollection",
            features: coastlines.features.filter((feature) => Object.hasOwn(areaLevelMap, feature.properties.code)),
        },
        hasForecast: activeLevels.includes("forecast"),
        hasWarning: activeLevels.some((level) => level !== "forecast"),
    };
}

module.exports = { prepare };
