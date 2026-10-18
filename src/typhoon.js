import "ol/ol.css";
import { circular } from "ol/geom/Polygon.js";
import { extend } from "ol/extent.js";
import ol from "./openlayers";
import { createBaseMapLayer, defaultMapStyle as defaultStyle } from "./base-map";

// -----

const map = new ol.Map({
    target: "map",
    layers: [createBaseMapLayer()],
    view: new ol.View({
        center: ol.proj.fromLonLat([135, 30]), // initial value
        zoom: 5,
    }),
    controls: [],
});

window.map = map;

const drawTyphoonInfo = (info) => {
    clearTyphoonInfo();
    if (info.remark) {
        window.setFullscreenTip(info.remark);
        window.showFullscreenTip();
        return;
    }
    if (!info.points?.length) {
        return;
    }

    // Keep tracks crossing the date line in the same world copy.
    let previousLongitude = info.points[0].coordinate[0];
    const typhoonPoints = info.points.map((point) => {
        const longitude = point.coordinate[0] + 360 * Math.round((previousLongitude - point.coordinate[0]) / 360);
        previousLongitude = longitude;
        return { ...point, coordinate: [longitude, point.coordinate[1]] };
    });

    const typhoonVector = new ol.source.Vector({});

    const TyphoonInfoLayer = new ol.layer.Vector({
        source: typhoonVector,
        style: defaultStyle,
    });

    window.TyphoonInfoLayer = TyphoonInfoLayer;

    TyphoonInfoLayer.set("name", "typhoon_info");

    map.addLayer(TyphoonInfoLayer);

    // 绘制坐标点

    const IntensityColorMap = {
        1: "#65B516",
        2: "#FFE616",
        3: "#EDAB16",
        4: "#CC16ED",
        5: "#6F1681",
    };

    /** @type {import("ol/style/Style.js").StyleFunction} */
    const typhoonPointFeatureStyleFunction = (feature) => {
        const properties = feature.getProperties();
        const forecast = properties.type === 3;
        const color = IntensityColorMap[properties.intensity] || "#000000";
        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: properties.type === 2 ? 5 : forecast ? 4 : 3,
                fill: new ol.style.Fill({
                    color: forecast ? "#ffffff" : color,
                }),
                stroke: forecast ? new ol.style.Stroke({ color, width: 2 }) : undefined,
            }),
            zIndex: properties.type === 2 ? 5 : 4,
        });
    };

    typhoonVector.addFeatures(
        typhoonPoints.map((item) => {
            const feature = new ol.Feature({
                geometry: new ol.geom.Point(item.coordinate).transform("EPSG:4326", "EPSG:3857"),
            });
            feature.setProperties({ ...item });
            feature.setStyle(typhoonPointFeatureStyleFunction);
            return feature;
        })
    );

    // 绘制坐标点连线

    /** @type {import("ol/style/Style.js").StyleFunction} */
    const typhoonLineFeatureStyleFunction = (feature) => {
        const properties = feature.getProperties();
        const forecast = properties.next.type === 3;
        return new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: forecast ? "rgba(96, 107, 122, 0.4)" : "#aaaaaa",
                width: 2,
                lineDash: forecast ? [8, 6] : undefined,
            }),
            zIndex: 3,
        });
    };

    for (let i = 0; i <= typhoonPoints.length - 2; i++) {
        const [now, next] = [typhoonPoints[i], typhoonPoints[i + 1]];
        const feature = new ol.Feature({
            geometry: new ol.geom.LineString([now.coordinate, next.coordinate]).transform("EPSG:4326", "EPSG:3857"),
        });
        feature.setProperties({ now, next });
        feature.setStyle(typhoonLineFeatureStyleFunction);
        typhoonVector.addFeature(feature);
    }

    // Use geodesic polygons so radii in meters remain correct at every latitude.
    const forecastCircleStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({ color: "rgba(96, 107, 122, 0.4)", width: 1.5, lineDash: [8, 6] }),
        zIndex: 0,
    });
    for (const point of typhoonPoints.filter((point) => point.type === 3)) {
        for (const circle of point.circles || []) {
            if (circle.type !== 3 || !Number.isFinite(circle.radius) || circle.radius <= 0) continue;
            const feature = new ol.Feature({
                geometry: circular(point.coordinate, circle.radius, 128).transform("EPSG:4326", "EPSG:3857"),
                circle,
                point,
            });
            feature.setStyle(forecastCircleStyle);
            typhoonVector.addFeature(feature);
        }
    }

    // 绘制风圈

    const CircleDirectionAngleMap = {
        1: [0, Math.PI * 2],
        2: [Math.PI, 0],
        3: [(5 / 4) * Math.PI, (1 / 4) * Math.PI],
        4: [-Math.PI / 2, Math.PI / 2],
        5: [(-1 / 4) * Math.PI, (3 / 4) * Math.PI],
        6: [Math.PI * 2, Math.PI],
        7: [(1 / 4) * Math.PI, (5 / 4) * Math.PI],
        8: [Math.PI / 2, (Math.PI / 2) * 3],
        9: [(3 / 4) * Math.PI, (-1 / 4) * Math.PI],
    };

    const CircleTypeColorMap = {
        1: [255, 230, 0],
        2: [243, 115, 43],
    };

    const CircleTypeZIndexMap = {
        1: 1,
        2: 2,
    };

    const fitExtent = typhoonVector.getExtent().slice();
    const currentPoint = typhoonPoints.find((p) => p.type === 2);

    if (currentPoint) {
        /** @type {import("ol/style/Style.js").StyleFunction} */
        const styleFunction = (feature, resolution) => {
            const properties = feature.getProperties();
            const { circle } = properties;

            const radius = circle.radius / resolution; // 地理距离 / 分辨率 = 圆半径(px)

            const canvas = document.createElement("canvas");
            canvas.width = radius * 2;
            canvas.height = radius * 2;
            const context = canvas.getContext("2d");
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const startingAngle = CircleDirectionAngleMap[circle.direction][0];
            const endingAngle = CircleDirectionAngleMap[circle.direction][1];

            context.beginPath();
            context.moveTo(centerX, centerY);
            context.arc(
                centerX,
                centerY,
                radius,
                startingAngle,
                endingAngle,
                !!CircleDirectionAngleMap[circle.direction][2]
            );
            context.fillStyle = `rgba(${CircleTypeColorMap[circle.type].join(",")}, 0.2)`;
            context.fill();

            context.beginPath();
            context.arc(
                centerX,
                centerY,
                Math.max(0, radius - 2),
                startingAngle,
                endingAngle,
                !!CircleDirectionAngleMap[circle.direction][2]
            );
            context.lineWidth = 2;
            context.strokeStyle = `rgba(${CircleTypeColorMap[circle.type].join(",")}, 0.5)`;
            context.stroke();

            return new ol.style.Style({
                image: new ol.style.Icon({
                    img: canvas,
                    size: [radius * 2, radius * 2],
                }),
                zIndex: CircleTypeZIndexMap[circle.type],
            });
        };
        if (currentPoint.circles?.length > 0) {
            for (const circle of currentPoint.circles) {
                if (![1, 2].includes(circle.type) || !Number.isFinite(circle.radius) || circle.radius <= 0) continue;
                const direction = CircleDirectionAngleMap[circle.direction] ? circle.direction : 1;
                const feature = new ol.Feature({
                    geometry: new ol.geom.Point(currentPoint.coordinate).transform("EPSG:4326", "EPSG:3857"),
                });
                feature.setProperties({ circle: { ...circle, direction } });
                feature.setStyle(styleFunction);
                typhoonVector.addFeature(feature);
                const [x, y] = feature.getGeometry().getCoordinates();
                extend(fitExtent, [x - circle.radius, y - circle.radius, x + circle.radius, y + circle.radius]);
            }
        }
    }
    map.getView().fit(fitExtent, { maxZoom: 6, padding: [100, 200, 100, 100] });
};

window.drawTyphoonInfo = drawTyphoonInfo;

const clearTyphoonInfo = () => {
    const typhoonLayer = getLayerByName("typhoon_info");
    window.hideFullscreenTip();
    if (typhoonLayer) {
        map.removeLayer(typhoonLayer);
    }
    window.TyphoonInfoLayer = null;
};

window.clearTyphoonInfo = clearTyphoonInfo;
