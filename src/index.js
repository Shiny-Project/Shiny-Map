import 'ol/ol.css';
import { Map, View } from 'ol'
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON.js';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { Fill, Stroke, Style } from 'ol/style.js';
const style1 = new Style({
    fill: new Fill({
        color: '#444444'
    }),
    stroke: new Stroke({
        color: '#aaa',
        width: 1
    }),
});
const style2 = new Style({
    fill: new Fill({
        color: 'red'
    }),
    stroke: new Stroke({
        color: '#aaa',
        width: 1
    }),
});
const map = new Map({
    target: 'map',
    layers: [
        new VectorLayer({
            source: new VectorSource({
                url: '../data/gadm36_CHN_2.json',
                format: new GeoJSON(),

            }),
            style: feature => {
                if (feature.values_['NL_NAME_2'] === "杭州市") {
                    return style2;
                } else {
                    return style1;
                }
            }
        })
    ],
    view: new View({
        center: fromLonLat([119.7889, 29.1416]),
        zoom: 8
    }),
    controls: []
});