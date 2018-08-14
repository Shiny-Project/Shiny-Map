import 'ol/ol.css';

const defaultStyle = new ol.style.Style({
    fill: new ol.style.Fill({
        color: '#444444'
    }),
    stroke: new ol.style.Stroke({
        color: '#aaa',
        width: 1
    }),
});

const ChinaMapVectorSource = new ol.source.Vector({
    url: '../data/gadm36_CHN_2.json',
    format: new ol.format.GeoJSON(),
});

const JapanMapVectorSource = new ol.source.Vector({
    url: '../data/gadm36_JPN_2.json',
    format: new ol.format.GeoJSON(),
});

const map = new ol.Map({
    target: 'map',
    layers: [
        new ol.layer.Vector({
            source: ChinaMapVectorSource,
            style: defaultStyle
        }),
        new ol.layer.Vector({
            source: JapanMapVectorSource,
            style: defaultStyle
        }),
    ],
    view: new ol.View({
        center: ol.proj.fromLonLat([140.412029876442, 37.3914691547508]), // initial value
        zoom: 8
    }),
    controls: [],
});

window.map = map;