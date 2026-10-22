import "ol/ol.css";
import ol from "./openlayers";
import { createBaseMapLayer } from "./base-map";

const landLayer = createBaseMapLayer({ landOnly: true });

const epicenters = new ol.source.Vector({ wrapX: false });
const epicenterLayer = new ol.layer.Vector({
    source: epicenters,
    style: new ol.style.Style({
        image: new ol.style.Icon({ scale: 0.1, src: "../data/images/epicenter.png" }),
    }),
});
epicenterLayer.set("name", "epicenter");
const map = new ol.Map({
    target: "map", layers: [landLayer, epicenterLayer],
    view: new ol.View({ center: ol.proj.fromLonLat([136, 36]), zoom: 5, multiWorld: true }), controls: [],
});
window.map = map;
window.setFooter = (text) => { document.getElementById("footer").textContent = text; };
const element = (id) => document.getElementById(id);
const number = (value) => String(Number(value.toFixed(4)));

window.drawEarthquake = (earthquake) => {
    element("title").textContent = (earthquake.source ? earthquake.source + " " : "") + "地震速报";
    element("region").textContent = earthquake.region;
    element("description").textContent = earthquake.description;
    element("description").style.display = earthquake.description ? "" : "none";
    element("magnitude").textContent = "M " + earthquake.magnitude.toFixed(1);
    const [longitude, latitude] = earthquake.coordinate;
    element("epicenter").textContent = `${latitude < 0 ? "南纬" : "北纬"} ${number(Math.abs(latitude))}°\n` +
        `${longitude < 0 ? "西经" : "东经"} ${number(Math.abs(longitude))}°`;
    element("epicenter").style.whiteSpace = "pre-line";
    element("depth").textContent = number(earthquake.depthKm) + " 千米";
    // Preserve polar coordinates in the text while bounding Mercator's latitude.
    const point = ol.proj.fromLonLat([longitude, Math.max(-85.05112878, Math.min(85.05112878, latitude))]);
    epicenters.clear();
    epicenters.addFeature(new ol.Feature({ geometry: new ol.geom.Point(point) }));
    // Show surrounding countries and seas; bound polar extents to avoid repeated worlds.
    const radius = Math.min(4000000, 1400000 / Math.cos(Math.min(85, Math.abs(latitude)) * Math.PI / 180));
    map.getView().fit([point[0] - radius, point[1] - radius, point[0] + radius, point[1] + radius], {
        padding: [160, 500, 160, 100], maxZoom: 6,
    });
};
