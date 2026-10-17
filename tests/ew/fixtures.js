const warning = (active = {}, ended = {}, extra = {}) => ({
    status: "訓練",
    active,
    ...(Object.keys(ended).length ? { ended } : {}),
    ...extra,
});

module.exports = [
    { id: "rain", label: "大雨特别警报", warning: warning({ "33": ["2920101", "2920102", "2920701", "2920702"] }) },
    { id: "blizzard", label: "暴风雪特别警报", warning: warning({ "32": ["0121400", "0151100"] }) },
    { id: "wind", label: "暴风特别警报（冲绳离岛）", warning: warning({ "35": ["4721400", "4737500"] }) },
    { id: "snow", label: "大雪特别警报", warning: warning({ "36": ["0120400", "0120700"] }) },
    { id: "waves", label: "波浪特别警报", warning: warning({ "37": ["1220200", "1223500"] }) },
    { id: "surge", label: "高潮特别警报", warning: warning({ "38": ["4013000", "4023000"] }) },
    { id: "landslide", label: "土砂灾害特别警报", warning: warning({ "39": ["2920102", "2920702"] }) },
    { id: "multiple-kinds", label: "同一区域多种特别警报", warning: warning({
        "33": ["4721400"], "35": ["4721400", "4737500"], "37": ["4721400", "4737500"], "38": ["4721400"],
    }) },
    { id: "partial-release", label: "部分解除，部分生效", warning: warning({ "33": ["2610000"] }, { "33": ["2620400"] }) },
    { id: "overlap-release", label: "同一区域一种解除，另一种生效", warning: warning({ "37": ["4721400"] }, { "35": ["4721400"] }) },
    { id: "all-released", label: "所列特别警报解除 / 降级", warning: warning({}, { "33": ["2920101", "2920102"] }) },
    { id: "corrected", label: "订正标记", warning: warning({ "33": ["2610000"] }, {}, { infoType: "訂正" }) },
    { id: "telegram-cancelled", label: "取消标记", warning: warning({}, { "33": ["2610000"] }, { infoType: "取消" }) },
    { id: "empty", label: "无特别警报", warning: warning() },
    { id: "test", label: "试验标记", warning: warning({ "33": ["2610000"] }, {}, { status: "試験" }) },
    { id: "normal", label: "无训练 / 试验标记", warning: warning({ "33": ["2610000"] }, {}, { status: "通常" }) },
    { id: "split-2026", label: "横滨北部生效、南部解除", warning: warning({ "33": ["1410011"] }, { "33": ["1410012"] }) },
    { id: "wide-area", label: "北海道至冲绳的广域分布", warning: warning({ "32": ["0121400"], "33": ["2610000"], "35": ["4721400"] }) },
];
