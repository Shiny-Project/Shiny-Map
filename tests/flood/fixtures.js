const samples = require("./official-samples.json");
const kinds = require("../../data/jma_flood_kinds.json");
const rivers = require("../../data/jma_flood_rivers.json");

const officialIds = ["oyabe", "kurobe", "ushizu", "mogami-warning", "midori", "midori-continued",
    "mogami-imminent", "mogami-occurred", "mogami-continued", "tone-floodwater", "tone-warning",
    "tokoro-released", "tone-downgraded", "tone-released"];
const warning = (entries, extra = {}) => ({ rivers: entries, status: "試験", ...extra });
module.exports = [
    ...samples.map((sample, i) => ({ id: officialIds[i], label: sample.title, warning: sample.warning })),
    { id: "default-areas", label: "自动查找涉及市町村", warning: warning([{ code: "840410000100", kind: "20" }]) },
    { id: "attention-continued", label: "注意报继续", warning: warning([{ code: "840410000100", kind: "21" }], { status: "通常" }) },
    { id: "corrected", label: "订正", warning: { ...samples[4].warning, infoType: "訂正" } },
    { id: "cancelled", label: "电文取消", warning: { ...samples[7].warning, infoType: "取消" } },
    { id: "mixed", label: "多个河川及重叠区域", warning: warning([
        { code: "830303000101", kind: "10", areas: ["1121000", "1123200"] },
        { code: "830303000103", kind: "22", areas: ["1121000", "1123200"] },
        { code: "830303000102", kind: "41", areas: ["1121000"] },
    ], { status: "訓練" }) },
    { id: "all-levels", label: "各等级与解除区域", warning: warning([
        { code: "830303000101", kind: "51", areas: ["1121000"], occurredAreas: ["1121000"] },
        { code: "830303000103", kind: "40", areas: ["1123200"] },
        { code: "830303000102", kind: "30", areas: ["1120600"] },
        { code: "830303015200", kind: "20", areas: ["1120700"] },
        { code: "830303030400", kind: "10", areas: ["1121800"] },
    ]) },
    { id: "many-rivers", label: "多个长名称河川预报区", warning: warning(Object.entries(rivers)
        .sort((a, b) => b[1].name.length - a[1].name.length).slice(0, 12)
        .map(([code], i) => ({ code, kind: Object.keys(kinds)[i % 10] }))) },
];
