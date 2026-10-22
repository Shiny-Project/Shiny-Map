// First two payloads match the public significant_week.atom feed captured on 2026-10-22.
// location is GeoRSS latitude/longitude; depth is georss:elev in metres.
module.exports = [
    { id: "china", label: "USGS 样例 · 中国", earthquake: {
        content: "M 7.0 - 191 km ENE of Nagqu, China", location: "32.3805 93.7797", depth: "-18000", source: "USGS",
    } },
    { id: "vanuatu", label: "USGS 样例 · 瓦努阿图", earthquake: {
        content: "M 6.3 - 197 km NW of Port-Olry, Vanuatu", location: "-13.9906 165.5892", depth: "-16000", source: "USGS",
    } },
    { id: "alaska", label: "模拟 · 阿拉斯加与西经", earthquake: {
        content: "M 6.1 - 80 km WSW of Sand Point, Alaska", location: "55.1 -161.8", depth: "-35000", source: "示例机构",
    } },
    { id: "ocean", label: "模拟 · 无距离方向的海域名称", earthquake: {
        content: "M 6.5 - South Sandwich Islands region", location: "-58.6 -25.3", depth: "-10000",
    } },
    { id: "dateline-east", label: "模拟 · 日期变更线东侧", earthquake: {
        content: "M 7.2 - Fiji region", location: "-18.1 179.8", depth: "-600000",
    } },
    { id: "dateline-west", label: "模拟 · 日期变更线西侧", earthquake: {
        content: "M 5.9 - Tonga", location: "-20.3 -179.9", depth: "-120000",
    } },
    { id: "region-only", label: "模拟 · 仅国家名与零深度", earthquake: {
        content: "M 5.5 - Japan", location: "35 139", depth: "0",
    } },
    { id: "polar", label: "模拟 · 极区", earthquake: {
        content: "M 5.0 - Arctic Ocean", location: "89 30", depth: "-10000",
    } },
    { id: "long-place", label: "模拟 · 较长地名", earthquake: {
        content: "M 6.0 - 100 km NNE of San Sebastián de La Gomera, Canary Islands, Spain",
        location: "29 -17", depth: "-12500.5",
    } },
];
