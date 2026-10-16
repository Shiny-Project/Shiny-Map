import Map from "ol/Map.js";
import View from "ol/View.js";
import Feature from "ol/Feature.js";
import GeoJSON from "ol/format/GeoJSON.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import VectorLayer from "ol/layer/Vector.js";
import { fromLonLat, get as getProjection } from "ol/proj.js";
import VectorSource from "ol/source/Vector.js";
import Circle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Icon from "ol/style/Icon.js";
import { shared as iconImageCache } from "ol/style/IconImageCache.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import { VERSION } from "ol/util.js";

// Wind circles are generated canvases. Retain the old cache bound rather than
// keeping hundreds of past requests' canvases in the newer, larger cache.
iconImageCache.setSize(32);

// v5 fitted extents to integer zoom levels, but allowed fractional setZoom().
// Apply the constraint only during our synchronous fits, then restore it before
// the next request reuses the view.
class StaticMapView extends View {
    getState() {
        const state = super.getState();
        // The v5 map renderer aligned its drawing center to device pixels.
        const pixelResolution = state.resolution / window.devicePixelRatio;
        state.center = state.center.map((value) => Math.round(value / pixelResolution) * pixelResolution);
        return state;
    }

    fit(extent, options) {
        const constrained = this.getConstrainResolution();
        this.setConstrainResolution(true);
        try {
            super.fit(extent, options);
        } finally {
            this.setConstrainResolution(constrained);
        }
    }
}

class MapGeoJSON extends GeoJSON {
    readFeatures(source, options) {
        const features = super.readFeatures(source, options);
        if (getProjection(options?.featureProjection)?.getCode() !== "EPSG:3857") return features;
        const limit = getProjection("EPSG:3857").getExtent()[3];
        for (const feature of features) {
            const geometry = feature.getGeometry();
            if (!geometry) continue;
            const extent = geometry.getExtent();
            // v5 limited Mercator northings to the projected world's extent.
            // Apply this only to polar geometries, leaving the source data intact.
            if (extent[1] < -limit || extent[3] > limit) {
                geometry.applyTransform((input, output, dimension, stride = dimension) => {
                    for (let index = 1; index < input.length; index += stride) {
                        output[index] = Math.max(-limit, Math.min(limit, input[index]));
                    }
                    return output;
                });
            }
        }
        return features;
    }
}

// MapService runs in Puppeteer's page.evaluate(), where module imports are not
// available. Keep only the API it uses on window while bundling from npm.
const ol = {
    Map,
    View: StaticMapView,
    Feature,
    VERSION,
    format: { GeoJSON: MapGeoJSON },
    geom: { LineString, Point },
    layer: { Vector: VectorLayer },
    proj: { fromLonLat },
    source: { Vector: VectorSource },
    style: { Circle, Fill, Icon, Stroke, Style },
};

window.ol = ol;

export default ol;
