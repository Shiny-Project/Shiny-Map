const samples = require("./official-samples.json");
const clone = (value) => JSON.parse(JSON.stringify(value));
const official = (index) => ({ ...clone(samples[index].warning), status: "試験" });
const sample = (kind, extra = {}) => ({
    status: "訓練",
    volcano: { code: "306", kind },
    areas: [{ code: "1042500", kind: "02" }], ...extra,
});

module.exports = [
    { id: "asama", label: "官方样例 · 浅间山等级 3", warning: official(0) },
    { id: "hakone", label: "官方样例 · 箱根山等级 5", warning: official(1) },
    { id: "released", label: "官方样例 · 白根山警报解除", warning: official(2) },
    { id: "level-2", label: "模拟 · 等级 2 火口周边管制", warning: sample("12", {
        responses: [{ code: "1042500", kind: "49", condition: "発表" }],
    }) },
    { id: "level-4", label: "模拟 · 等级 4 老年人等避难", warning: sample("14", {
        areas: [{ code: "1042500", kind: "01" }],
        responses: [{ code: "1042500", kind: "41" }],
    }) },
    { id: "crater-warning", label: "模拟 · 等级 2 仍有火口周边警报", warning: sample("12") },
    { id: "mixed", label: "模拟 · 市町村应对不同，部分解除", warning: sample("13", {
        areas: [{ code: "1042500", kind: "02" },
            { code: "2020800", kind: "04" }],
        responses: [{ code: "1042500", kind: "43", condition: "継続" },
            { code: "2020800", kind: "45", condition: "解除" }],
    }) },
    { id: "keyword", label: "模拟 · 无数字等级火山", warning: sample("22", {
        volcano: { code: "326", kind: "22" },
        areas: [],
    }) },
    { id: "submarine", label: "模拟 · 海底火山周边海域警戒", warning: sample("36", {
        volcano: { code: "331", kind: "36" },
        areas: [],
    }) },
    { id: "corrected", label: "模拟 · 订正", warning: { ...official(0), infoType: "訂正" } },
    { id: "cancelled", label: "模拟 · 电文取消", warning: { ...official(1), infoType: "取消" } },
    { id: "forecast", label: "模拟 · 等级 1 预报", warning: sample("11", {
        areas: [{ code: "1042500", kind: "05" }],
    }) },
    { id: "normal", label: "模拟 · 正常状态无试验标记", warning: { ...sample("13"), status: "通常" } },
    { id: "different-responses", label: "模拟 · 同一火山的不同市町村应对", warning: sample("15", {
        areas: [{ code: "1042500", kind: "01" },
            { code: "2020800", kind: "02" },
            { code: "2032100", kind: "02" }],
        responses: [{ code: "1042500", kind: "41", condition: "発表" },
            { code: "2020800", kind: "43", condition: "発表" },
            { code: "2032100", kind: "49", condition: "発表" }],
    }) },
    { id: "shirane-default", label: "模拟 · 白根山分区默认定位", warning: sample("12", {
        volcano: { code: "350", kind: "12" }, areas: [],
    }) },
    { id: "ebino-default", label: "模拟 · 硫黄山分区默认定位", warning: sample("12", {
        volcano: { code: "552", kind: "12" }, areas: [],
    }) },
];
