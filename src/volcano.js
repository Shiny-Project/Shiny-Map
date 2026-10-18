import "ol/ol.css";
import ol from "./openlayers";
import { createBaseMapLayer, defaultMapStyle } from "./base-map";

const source = new ol.source.Vector({
    overlaps: false,
    url: "../data/jma_volcano_areas.json",
    format: new ol.format.GeoJSON(),
});
const cities = new ol.layer.Vector({ source, style: defaultMapStyle, renderBuffer: 2 });
cities.set("name", "jma_volcano_areas");
const volcanoes = new ol.source.Vector();
const volcanoLayer = new ol.layer.Vector({ source: volcanoes });
volcanoLayer.set("name", "volcano");
const map = new ol.Map({
    target: "map",
    layers: [createBaseMapLayer(), cities, volcanoLayer],
    view: new ol.View({ center: ol.proj.fromLonLat([136, 36]), zoom: 5 }),
    controls: [],
});
window.map = map;
window.setFooter = (text) => { document.getElementById("footer").textContent = text; };
const element = (id) => document.getElementById(id);

function setText(id, text) {
    element(id).textContent = text;
    element(id).style.display = text ? "" : "none";
}

function legendRow(label, color, ended = false) {
    const row = document.createElement("div");
    const swatch = document.createElement("i");
    swatch.className = "map-legend-swatch";
    swatch.style.background = color;
    if (ended) swatch.style.borderStyle = "dashed";
    row.append(swatch, document.createTextNode(label));
    element("legend").append(row);
}

window.drawVolcano = (warning) => {
    const { volcano } = warning;
    const cancelled = warning.infoType === "取消";
    const color = cancelled ? "#9da7b1" : volcano.color;
    const released = warning.areas.some((area) => area.ended);
    let title = cancelled ? "喷火警报电文取消" : volcano.forecast ?
        (released ? "喷火预报 · 警报解除" : "喷火预报") : volcano.special ? "喷火特别警报" : "喷火警报";
    if (warning.infoType === "訂正") title += "（订正）";
    setText("title", title);
    element("title").style.background = color;
    element("title").style.color = color === "#faf500" ? "#222" : "white";
    setText("badge", { 試験: "试验", 訓練: "训练" }[warning.status] || "");
    element("badge").style.display = warning.status === "通常" ? "none" : "inline-block";
    setText("volcano-name", volcano.volcanoName);
    setText("summary", cancelled ? "本次电文已取消" : volcano.label);

    // Warning type and municipality response describe different things. Keep both.
    const responses = new Map(warning.responses.map((item) => [item.code, item]));
    const areaItems = new Map(warning.areas.map((item) => [item.code, item]));
    const states = new Map();
    for (const item of [...warning.areas, ...warning.responses]) {
        const area = areaItems.get(item.code);
        const response = responses.get(item.code);
        const state = response || area;
        const ended = cancelled || !!area?.ended || (response?.kind === "45" && response.condition === "解除");
        states.set(item.code, { code: item.code,
            color: ended ? "#9da7b1" : state.color, ended,
            areaKind: area?.kind ?? null, responseKind: response?.kind ?? null });
    }
    const styles = new Map([...states].map(([code, state]) => [code, new ol.style.Style({
        fill: new ol.style.Fill({ color: state.color }),
        stroke: new ol.style.Stroke({ color: "#fff", width: 1.5, lineDash: state.ended ? [6, 4] : undefined }),
    })]));
    cities.setStyle((feature) => styles.get(feature.get("code")) || defaultMapStyle);

    element("legend").replaceChildren();
    const markerRow = document.createElement("div");
    const marker = document.createElement("i");
    marker.className = "volcano-icon";
    marker.style.borderBottomColor = color;
    markerRow.append(marker, document.createTextNode("火山位置"));
    element("legend").append(markerRow);
    const legendStyles = new Map();
    for (const state of states.values()) legendStyles.set(state.color + state.ended, state);
    for (const state of legendStyles.values()) {
        const label = cancelled ? "取消电文涉及市町村" : state.ended ? "警报解除涉及市町村" : {
            "#9900CC": "喷火警报涉及市町村", "#ff2800": "火口周边等警报涉及市町村",
            "#faf500": "火口周边警戒涉及市町村", "#9da7b1": "喷火预报涉及市町村",
        }[state.color];
        legendRow(label, state.color, state.ended);
    }

    volcanoes.clear();
    const point = ol.proj.fromLonLat(volcano.coordinate);
    const feature = new ol.Feature({ geometry: new ol.geom.Point(point) });
    const label = volcano.volcanoName.length > 20 ? volcano.volcanoName.replace("（", "\n（") : volcano.volcanoName;
    feature.setStyle(new ol.style.Style({
        image: new ol.style.RegularShape({ points: 3, radius: 22,
            fill: new ol.style.Fill({ color }), stroke: new ol.style.Stroke({ color: "#222", width: 2.5 }) }),
        text: new ol.style.Text({ text: label, offsetY: 40, font: '500 26px "Microsoft YaHei", sans-serif',
            fill: new ol.style.Fill({ color: "#222" }), stroke: new ol.style.Stroke({ color: "white", width: 5 }) }),
    }));
    volcanoes.addFeature(feature);
    const extent = [point[0], point[1], point[0], point[1]];
    for (const selected of source.getFeatures().filter((item) => states.has(item.get("code")))) {
        const bounds = selected.getGeometry().getExtent();
        extent[0] = Math.min(extent[0], bounds[0]);
        extent[1] = Math.min(extent[1], bounds[1]);
        extent[2] = Math.max(extent[2], bounds[2]);
        extent[3] = Math.max(extent[3], bounds[3]);
    }
    map.getView().fit(extent, { padding: [180, 500, 180, 130], maxZoom: 9 });
    window.volcanoState = { code: volcano.code, coordinate: volcano.coordinate, kind: volcano.kind,
        cancelled, areaStates: Object.fromEntries(states), extent };
};
