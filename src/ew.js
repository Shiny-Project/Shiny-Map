import "ol/ol.css";
import ol from "./openlayers";
import { createBaseMapLayer, defaultMapStyle } from "./base-map";
import kinds from "../data/jma_ew_kinds.json";

const source = new ol.source.Vector({
    overlaps: false,
    url: "../data/jma_weather_areas.json",
    format: new ol.format.GeoJSON(),
});
const styles = {
    active: new ol.style.Style({
        fill: new ol.style.Fill({ color: "#9900CC" }),
        stroke: new ol.style.Stroke({ color: "#fff", width: 1.2 }),
        zIndex: 2,
    }),
    ended: new ol.style.Style({
        fill: new ol.style.Fill({ color: "#9da7b1" }),
        stroke: new ol.style.Stroke({ color: "#fff", width: 1.5, lineDash: [6, 4] }),
        zIndex: 1,
    }),
};
const layer = new ol.layer.Vector({ source, style: defaultMapStyle, renderBuffer: 2 });
layer.set("name", "jma_weather_areas");
const map = new ol.Map({
    target: "map",
    layers: [createBaseMapLayer(), layer],
    view: new ol.View({ center: ol.proj.fromLonLat([136, 36]), zoom: 5 }),
    controls: [],
});
window.map = map;
window.setFooter = (text) => { document.getElementById("footer").textContent = text; };

const element = (id) => document.getElementById(id);
function setText(id, text) {
    const node = element(id);
    node.textContent = text;
    node.style.display = text ? "" : "none";
}
function regionList(items) {
    const names = items.slice(0, 8).map((item) => item.name);
    return names.join("、") + (items.length > 8 ? ` 等 ${items.length} 个区域` : "");
}

window.drawEW = (warning) => {
    const cancelled = warning.infoType === "取消";
    const relevant = warning.items.filter((item) => item.kinds.length);
    const active = cancelled ? [] : relevant.filter((item) => item.kinds.some((kind) => kind.state === "active"));
    const ended = relevant.filter((item) => cancelled || item.kinds.some((kind) => kind.state === "ended"));
    const states = new Map(ended.map((item) => [item.areaCode, "ended"]));
    for (const item of active) states.set(item.areaCode, "active");
    layer.setStyle((feature) => styles[states.get(feature.get("code"))] || defaultMapStyle);

    const activeCodes = new Set(active.flatMap((item) => item.kinds.filter((kind) => kind.state === "active").map((kind) => kind.code)));
    const endedCodes = new Set(ended.flatMap((item) => item.kinds.filter((kind) => cancelled || kind.state === "ended").map((kind) => kind.code)));
    const codes = [...new Set([...activeCodes, ...endedCodes])].sort();
    const label = codes.length === 1 ? kinds[codes[0]].label : "特别警报";
    setText("title", cancelled ? "特别警报电文取消" : label + (active.length ? "" : ended.length ? "解除 / 降级" : "信息"));
    if (warning.infoType === "訂正") element("title").textContent += "（订正）";
    setText("badge", { 試験: "试验", 訓練: "训练" }[warning.status] || "");
    element("badge").style.display = warning.status === "通常" ? "none" : "inline-block";
    setText("summary", cancelled ? "本次电文已取消" : active.length ?
        "特别警报生效中" : ended.length ? "所列特别警报已解除或降级" : "本次范围无特别警报信息");
    element("summary").classList.toggle("muted", !active.length);
    element("kinds").replaceChildren();
    for (const code of codes) {
        const row = document.createElement("div");
        row.className = "kind";
        row.textContent = kinds[code].label;
        element("kinds").append(row);
    }
    setText("area-list", regionList(active));
    setText("ended-list", regionList(ended));
    element("active-section").style.display = active.length ? "" : "none";
    element("ended-section").style.display = ended.length ? "" : "none";
    element("ended-section").querySelector("h2").textContent = cancelled ? "取消电文涉及区域" : "解除 / 降级区域";
    setText("ended-legend", cancelled ? "取消电文涉及区域" : "特别警报解除 / 降级");

    const fittedCodes = new Set((relevant.length ? relevant : warning.items).map((item) => item.areaCode));
    const selected = source.getFeatures().filter((feature) => fittedCodes.has(feature.get("code")));
    if (selected.length) {
        const extent = [Infinity, Infinity, -Infinity, -Infinity];
        for (const feature of selected) {
            const bounds = feature.getGeometry().getExtent();
            extent[0] = Math.min(extent[0], bounds[0]);
            extent[1] = Math.min(extent[1], bounds[1]);
            extent[2] = Math.max(extent[2], bounds[2]);
            extent[3] = Math.max(extent[3], bounds[3]);
        }
        map.getView().fit(extent, { padding: [160, 470, 130, 80], maxZoom: 9 });
    } else {
        map.getView().setCenter(ol.proj.fromLonLat([136, 36]));
        map.getView().setZoom(5);
    }
    window.ewState = {
        activeCodes: [...activeCodes].sort(), endedCodes: [...endedCodes].sort(),
        activeAreas: active.map((item) => item.areaCode), endedAreas: ended.map((item) => item.areaCode),
        areaStates: Object.fromEntries(states),
    };
};
