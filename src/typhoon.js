import "ol/ol.css";

const defaultStyle = new ol.style.Style({
    fill: new ol.style.Fill({
        color: "#F5F5F5",
    }),
    stroke: new ol.style.Stroke({
        color: "#aaa",
        width: 1,
    }),
});

const WorldMapVectorSource = new ol.source.Vector({
    url: "../data/world_simplified.json",
    format: new ol.format.GeoJSON(),
});

// -----

const map = new ol.Map({
    target: "map",
    layers: [
        new ol.layer.Vector({
            source: WorldMapVectorSource,
            style: defaultStyle,
        }),
    ],
    view: new ol.View({
        center: ol.proj.fromLonLat([135, 30]), // initial value
        zoom: 5,
    }),
    //controls: [],
});

window.map = map;

// 台风信息

const typhoonPoints = [
    {
        // 1: previous, 2: current, 3: estimation
        type: 1,
        coordinate: [127.5, 19.4],
        // 1: TS, 2: STS, 3: TY, 4: 強いTY, 5: 非常に強いTY, 6: 猛烈なTY
        intensity: 1,
    },
    {
        type: 1,
        coordinate: [126.5, 19.4],
        intensity: 1,
    },
    {
        type: 2,
        coordinate: [126.2, 19.2],
        intensity: 2,
        circles: [
            {
                // 1: 强风, 2: 暴风
                type: 1,
                radius: 200000,
                // 1: 全域, 2: 北, 3: 东北, 4: 东, 5: 东南, 6: 南, 7: 西南, 8: 西, 9: 西北
                // 1 为整圆 2/4/6/8 为半圆 其余为1/4圆
                direction: 9,
            },
            {
                type: 2,
                radius: 50000,
                direction: 1,
            },
        ],
    },
    {
        type: 3,
        coordinate: [125.9, 19.0],
        intensity: 3,
    },
    {
        type: 3,
        coordinate: [124.0, 18.7],
        intensity: 3,
    },
    {
        type: 3,
        coordinate: [123.4, 18.5],
        intensity: 4,
    },
];

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
    1: "#65B500",
    2: "#FFE600",
    3: "#EDAB00",
    4: "#ED5500",
    5: "#CC00ED",
    6: "#CC00ED",
};

/** @type {ol.StyleFunction} */
const typhoonPointFeatureStyleFunction = (feature) => {
    const properties = feature.getProperties();
    return new ol.style.Style({
        image: new ol.style.Circle({
            radius: properties?.["type"] === 2 ? 5 : 3,
            fill: new ol.style.Fill({
                color: IntensityColorMap[properties?.["intensity"]] || "#000000",
            }),
        }),
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

map.getView().fit(getLayerByName("typhoon_info").getSource().getExtent(), {
    maxZoom: 7,
});

// 绘制坐标点连线

/** @type {ol.StyleFunction} */
const typhoonLineFeatureStyleFunction = (feature, resolution) => {
    const properties = feature.getProperties();
    return new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: "#aaaaaa",
            width: 2,
            lineDash: properties.next.type === 3 ? [20000 / resolution, 15000 / resolution] : undefined,
        }),
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

// 绘制风圈

const CircleDirectionAngleMap = {
    1: [0, Math.PI * 2],
    2: [Math.PI, 0],
    3: [(Math.PI / 2) * 3, 0],
    4: [-Math.PI / 2, Math.PI / 2],
    5: [0, Math.PI / 2],
    6: [Math.PI * 2, Math.PI],
    7: [Math.PI / 2, Math.PI],
    8: [Math.PI / 2, (Math.PI / 2) * 3],
    9: [Math.PI, (Math.PI / 2) * 3],
};

const CircleTypeColorMap = {
    1: [255, 230, 0],
    2: [243, 115, 43],
};

const CircleTypeZIndexMap = {
    1: 1,
    2: 2,
};

const currentPoint = typhoonPoints.find((p) => p.type === 2);

if (currentPoint) {
    /** @type {ol.StyleFunction} */
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
            radius - 2,
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
                imgSize: [radius * 2, radius * 2],
            }),
            zIndex: CircleTypeZIndexMap[circle.type],
        });
    };
    if (currentPoint.circles?.length > 0) {
        for (const circle of currentPoint.circles) {
            const feature = new ol.Feature({
                geometry: new ol.geom.Point(currentPoint.coordinate).transform("EPSG:4326", "EPSG:3857"),
            });
            feature.setProperties({ circle });
            feature.setStyle(styleFunction);
            typhoonVector.addFeature(feature);
        }
    }
}

import * as Sentry from "@sentry/browser";
import { BrowserTracing } from "@sentry/tracing";

Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // Alternatively, use `process.env.npm_package_version` for a dynamic release version
    // if your build tool supports it.
    release: "1.0.0",
    integrations: [new BrowserTracing()],

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
});
