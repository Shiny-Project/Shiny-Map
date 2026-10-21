const rivers = require("../../data/jma_flood_rivers.json");
const kinds = require("../../data/jma_flood_kinds.json");
const cityCodes = new Set(require("../../data/jma_flood_areas.json").features
    .map((feature) => feature.properties.code));
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function invalid(message) {
    const error = new Error(message);
    error.name = "FloodInputError";
    throw error;
}

function cities(value, field) {
    if (!Array.isArray(value)) invalid(field + " 需要为市町村代码数组");
    for (const code of value) {
        if (typeof code !== "string" || !cityCodes.has(code)) invalid("未知洪水预报市町村代码：" + code);
    }
    return [...new Set(value)].sort();
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
    if (!Array.isArray(input.rivers) || !input.rivers.length) invalid("rivers 需要为非空数组");
    const selected = new Map();
    for (const item of input.rivers) {
        if (!object(item)) invalid("rivers 中每一项需要为对象");
        if (typeof item.code !== "string" || !Object.hasOwn(rivers, item.code)) {
            invalid("未知河川预报区代码：" + item.code);
        }
        if (typeof item.kind !== "string" || !Object.hasOwn(kinds, item.kind)) invalid("未知洪水情报种类代码：" + item.kind);
        const river = rivers[item.code];
        const baseAreas = cities(item.areas === undefined ? river.areas : item.areas, "areas");
        const occurredAreas = cities(item.occurredAreas ?? [], "occurredAreas");
        if (occurredAreas.length && kinds[item.kind].level !== 5) invalid("occurredAreas 仅用于 L5 泛滥发生信息");
        // Floodwater may reach municipalities outside the river's normal forecast area.
        const areas = [...new Set([...baseAreas, ...occurredAreas])].sort();
        if (!areas.length) invalid("每个河川至少需要一个涉及市町村");
        const value = { code: item.code, kind: item.kind, name: river.name, ...kinds[item.kind], areas, occurredAreas };
        if (selected.has(item.code) && JSON.stringify(selected.get(item.code)) !== JSON.stringify(value)) {
            invalid("同一河川预报区存在冲突状态：" + item.code);
        }
        selected.set(item.code, value);
    }
    const cancelled = infoType === "取消";
    const areas = new Map();
    for (const river of selected.values()) {
        for (const code of river.areas) {
            const ended = cancelled || river.ended;
            const occurred = !cancelled && river.occurredAreas.includes(code);
            const previous = areas.get(code);
            // A continuing warning takes precedence over another river's release.
            if (!previous || (!ended && (previous.ended || river.level > previous.level))) {
                areas.set(code, { code, level: river.level, color: ended ? "#9da7b1" : river.color,
                    ended, occurred: occurred || !!previous?.occurred });
            } else if (occurred) previous.occurred = true;
        }
    }
    return { status, infoType, rivers: [...selected.values()], areas: [...areas.values()] };
}

module.exports = { prepare };
