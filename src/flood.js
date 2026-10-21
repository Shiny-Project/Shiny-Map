import "ol/ol.css";
import ol from "./openlayers";
import { createBaseMapLayer, defaultMapStyle } from "./base-map";

const source = new ol.source.Vector({
    overlaps: false,
    url: "../data/jma_flood_areas.json",
    format: new ol.format.GeoJSON(),
});
const cities = new ol.layer.Vector({ source, style: defaultMapStyle, renderBuffer: 2 });
cities.set("name", "jma_flood_areas");
const map = new ol.Map({
    target: "map",
    layers: [createBaseMapLayer(), cities],
    view: new ol.View({ center: ol.proj.fromLonLat([136, 36]), zoom: 5 }),
    controls: [],
});
window.map = map;
const element = (id) => document.getElementById(id);
window.setFooter = (text) => { element("footer").textContent = text; };

function text(tag, className, value) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = value;
    return node;
}

function legendRow(label, color, ended = false, occurred = false) {
    const row = document.createElement("div");
    const swatch = document.createElement("i");
    swatch.className = "map-legend-swatch" + (occurred ? " occurred" : "");
    swatch.style.background = color;
    if (ended) swatch.style.borderStyle = "dashed";
    row.append(swatch, document.createTextNode(label));
    element("legend").append(row);
}

window.drawFlood = (warning) => {
    const cancelled = warning.infoType === "取消";
    const sorted = [...warning.rivers].sort((a, b) =>
        Number(a.ended) - Number(b.ended) || b.level - a.level || a.code.localeCompare(b.code));
    const highest = sorted[0];
    const color = cancelled ? "#9da7b1" : highest.color;
    let title = cancelled ? "洪水情报电文取消" : highest.label;
    if (warning.infoType === "訂正") title += "（订正）";
    element("title").textContent = title;
    element("title").style.background = color;
    element("title").style.color = color === "#faf500" ? "#222" : "white";
    element("badge").textContent = { 試験: "试验", 訓練: "训练" }[warning.status] || "";
    element("badge").style.display = warning.status === "通常" ? "none" : "inline-block";
    const panel = element("panel");
    panel.replaceChildren();
    panel.className = sorted.length > 1 ? "multiple" : "";
    // Keep the summary clear when a request contains several forecast areas.
    for (const river of sorted.slice(0, 5)) {
        const row = text("section", "river", "");
        row.append(text("h2", "river-name", river.name), text("p", "river-summary",
            cancelled ? "本次电文已取消" : river.label));
        panel.append(row);
    }
    if (sorted.length > 5) {
        const remaining = text("p", "", `另 ${sorted.length - 5} 个河川预报区`);
        remaining.id = "remaining";
        panel.append(remaining);
    }
    // Long official names wrap; reduce the visible list before it meets the legend.
    const states = new Map(warning.areas.map((area) => [area.code, area]));
    const styles = new Map(warning.areas.map((area) => [area.code, new ol.style.Style({
        fill: new ol.style.Fill({ color: area.color }),
        stroke: new ol.style.Stroke({ color: area.occurred ? "#ff9f00" : "#fff",
            width: area.occurred ? 3 : 1.5, lineDash: area.ended ? [6, 4] : undefined }),
        zIndex: area.occurred ? 2 : 1,
    })]));
    cities.setStyle((feature) => styles.get(feature.get("code")) || defaultMapStyle);
    element("legend").replaceChildren();
    const levels = new Map();
    for (const area of warning.areas) if (!area.ended) levels.set(area.level, area.color);
    for (const [level, fill] of [...levels].sort((a, b) => b[0] - a[0])) {
        legendRow({ 2: "注意报", 3: "警报", 4: "危险警报", 5: "特别警报" }[level], fill);
    }
    if (warning.areas.some((area) => area.ended)) {
        legendRow(cancelled ? "取消电文" : "注意报解除", "#9da7b1", true);
    }
    if (warning.areas.some((area) => area.occurred)) legendRow("泛滥发生信息", "#0c000c", false, true);
    while (panel.getBoundingClientRect().bottom > element("legend").getBoundingClientRect().top - 24 &&
        panel.querySelectorAll(".river").length > 1) {
        panel.querySelectorAll(".river")[panel.querySelectorAll(".river").length - 1].remove();
        let remaining = element("remaining");
        if (!remaining) { remaining = text("p", "", ""); remaining.id = "remaining"; panel.append(remaining); }
        remaining.textContent = `另 ${sorted.length - panel.querySelectorAll(".river").length} 个河川预报区`;
    }
    const extent = [Infinity, Infinity, -Infinity, -Infinity];
    for (const feature of source.getFeatures()) {
        if (!states.has(feature.get("code"))) continue;
        const bounds = feature.getGeometry().getExtent();
        extent[0] = Math.min(extent[0], bounds[0]);
        extent[1] = Math.min(extent[1], bounds[1]);
        extent[2] = Math.max(extent[2], bounds[2]);
        extent[3] = Math.max(extent[3], bounds[3]);
    }
    map.getView().fit(extent, { padding: [170, 500, 150, 100], maxZoom: 9 });
    window.floodState = { cancelled, areaStates: Object.fromEntries(states), extent };
};
