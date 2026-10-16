import "ol/ol.css";
import { createBaseMapLayer, defaultMapStyle as defaultStyle } from "./base-map";

const ChinaMapVectorSource = new ol.source.Vector({
    url: "../data/gadm36_CHN_2.json",
    format: new ol.format.GeoJSON(),
});

const JapanMapVectorSource = new ol.source.Vector({
    url: "../data/gadm36_JPN_2.json",
    format: new ol.format.GeoJSON(),
});

const JMAEQVectorSource = new ol.source.Vector({
    url: "../data/jma_eq_area.json",
    format: new ol.format.GeoJSON(),
});

// -----

window.JapanDetailedMapLayer = new ol.layer.Vector({
    source: JapanMapVectorSource,
    style: defaultStyle,
});

window.JapanDetailedMapLayer.set("name", "japan_detailed_map");

window.JapanSimpleMapLayer = new ol.layer.Vector({
    source: JMAEQVectorSource,
    style: defaultStyle,
});

window.JapanSimpleMapLayer.set("name", "japan_simple_map");

const ChinaMapLayer = new ol.layer.Vector({
    source: ChinaMapVectorSource,
    style: defaultStyle,
});
ChinaMapLayer.set("name", "china_map");

const map = new ol.Map({
    target: "map",
    layers: [
        createBaseMapLayer(),
        ChinaMapLayer,
    ],
    view: new ol.View({
        center: ol.proj.fromLonLat([140.412029876442, 37.3914691547508]), // initial value
        zoom: 8,
    }),
    controls: [],
});

window.map = map;

map.addLayer(JapanSimpleMapLayer);
map.addLayer(JapanDetailedMapLayer);
map.once("postrender", () => {
    map.removeLayer(JapanSimpleMapLayer);
    map.removeLayer(JapanDetailedMapLayer);
});
