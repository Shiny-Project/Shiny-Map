import 'ol/ol.css';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { Fill, Stroke, Style, Text } from 'ol/style.js';
const style1 = new Style({
    fill: new Fill({
        color: 'rgba(255, 255, 255, 0.6)'
    }),
    stroke: new Stroke({
        color: '#319FD3',
        width: 1
    }),
    text: new Text({
        font: '12px Calibri,sans-serif',
        fill: new Fill({
            color: '#000'
        }),
        stroke: new Stroke({
            color: '#fff',
            width: 3
        })
    })
});
const style2 = new Style({
    fill: new Fill({
        color: 'red'
    }),
    stroke: new Stroke({
        color: '#319FD3',
        width: 1
    }),
    text: new Text({
        font: '12px Calibri,sans-serif',
        fill: new Fill({
            color: '#000'
        }),
        stroke: new Stroke({
            color: '#fff',
            width: 3
        })
    })
});
console.log(style1);
const map = new Map({
    target: 'map',
    layers: [
        new VectorLayer({
            source: new VectorSource({
                url: '../data/gadm36_CHN_2.json',
                format: new GeoJSON()
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
    })
});