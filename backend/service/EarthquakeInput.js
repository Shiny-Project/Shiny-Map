const regions = require("../../data/earthquake_regions.json");
const directions = {
    N: "北", NNE: "东北偏北", NE: "东北", ENE: "东北偏东",
    E: "东", ESE: "东南偏东", SE: "东南", SSE: "东南偏南",
    S: "南", SSW: "西南偏南", SW: "西南", WSW: "西南偏西",
    W: "西", WNW: "西北偏西", NW: "西北", NNW: "西北偏北",
};

function invalid(message) {
    const error = new Error(message);
    error.name = "EarthquakeInputError";
    throw error;
}

function prepare(input) {
    if (typeof input === "string") {
        try { input = JSON.parse(input); }
        catch { invalid("earthquake 无法解析为 JSON"); }
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) invalid("earthquake 需要为对象");
    if (typeof input.content !== "string" || input.content.length > 500) invalid("content 需要为地震标题");
    const title = /^M\s+(-?\d+(?:\.\d+)?)\s*[-–]\s*(\S.*)$/u.exec(input.content.trim());
    if (!title) invalid("content 需要包含震级和地点，例如 M 6.3 - Vanuatu");
    const magnitude = Number(title[1]);
    if (!Number.isFinite(magnitude) || magnitude < -10 || magnitude > 10) invalid("震级超出有效范围");
    if (typeof input.location !== "string" || !input.location.trim()) invalid("location 需要为纬度和经度");
    const point = input.location.trim().split(/\s+/).map(Number);
    if (point.length !== 2 || !point.every(Number.isFinite) ||
        Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) invalid("location 需要为有效的 纬度 经度");
    if (!["string", "number"].includes(typeof input.depth) || String(input.depth).trim() === "" ||
        !Number.isFinite(Number(input.depth))) invalid("depth 需要为 GeoRSS 海拔值（米）");
    const source = input.source ?? "";
    if (typeof source !== "string" || source.length > 32) invalid("source 需要为不超过 32 个字符的字符串");

    const place = title[2].trim();
    // A region-only title (e.g. "South Sandwich Islands region") is valid too.
    const comma = place.lastIndexOf(",");
    const region = comma < 0 ? place : place.slice(comma + 1).trim();
    const locality = comma < 0 ? place : place.slice(0, comma).trim();
    const relative = /^(\d+(?:\.\d+)?)\s*km\s+([A-Z]+)\s+of\s+(.+)$/u.exec(locality);
    const description = relative && Object.hasOwn(directions, relative[2]) ?
        `${relative[3]} ${directions[relative[2]]}方 ${relative[1]} 千米` : locality;
    return {
        content: input.content.trim(), magnitude, place, source: source.trim(),
        region: Object.hasOwn(regions, region) ? regions[region] : region,
        description: description === region ? "" : description,
        coordinate: [point[1], point[0]],
        // georss:elev is elevation in metres; earthquake depth is positive down.
        depthKm: -Number(input.depth) / 1000 || 0,
    };
}

module.exports = { prepare };
