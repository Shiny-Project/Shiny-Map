import 'ol/ol.css';
import utils from './utils';

const defaultStyle = new ol.style.Style({
    fill: new ol.style.Fill({
        color: '#444444'
    }),
    stroke: new ol.style.Stroke({
        color: '#aaa',
        width: 1
    }),
});

const MapVectorSource = new ol.source.Vector({
    url: '../data/gadm36_CHN_2.json',
    format: new ol.format.GeoJSON(),
});

const map = new ol.Map({
    target: 'map',
    layers: [
        new ol.layer.Vector({
            source: MapVectorSource,
            style: defaultStyle
        })
    ],
    view: new ol.View({
        center: ol.proj.fromLonLat([119.7889, 29.1416]),
        zoom: 8
    }),
    controls: [],
});

map.on('postrender', () => {
    map.on('postrender', draw)
});

window.map = map;