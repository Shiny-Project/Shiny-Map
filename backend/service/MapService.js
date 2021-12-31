const path = require("path");
const fs = require("fs");
const Sentry = require("@sentry/node");
const utils = require("../utils");

module.exports = {
    /**
     * 中国大陆地区市级指定高亮
     * @param {*} needHighlight 需要高亮的市级区划
     * @param {*} center 中心省份
     * @return {Promise<string>} 图片路径
     */
    highlight: async (needHighlight, center) => {
        await utils.waitBrowserAvailable();
        utils.lockBrowser();
        const page = global.page;
        const provinceData = require("../definition/china_provinces");
        try {
            await page.evaluate(
                (needHighlight, provinceData, center) => {
                    map.getView().setCenter(
                        ol.proj.fromLonLat([provinceData[center].longitude, provinceData[center].latitude])
                    );
                    map.getView().setZoom(provinceData[center].zoom);
                    map.getLayers()
                        .getArray()[0]
                        .getSource()
                        .forEachFeature((feature) => {
                            if (needHighlight.includes(feature.getProperties()["NL_NAME_2"])) {
                                feature.setStyle(
                                    new ol.style.Style({
                                        fill: new ol.style.Fill({
                                            color: "red",
                                        }),
                                        stroke: new ol.style.Stroke({
                                            color: "#aaa",
                                            width: 2,
                                        }),
                                    })
                                );
                            }
                        });
                },
                needHighlight,
                provinceData,
                center
            );
            setFooter(`Generated by Shiny-Map @ ${new Date().toISOString()} / ©2022 Shiny Project`);
        } catch (e) {
            Sentry.captureException(e);
            console.log("Navigation failed: " + e.message);
        }

        const outputPath = `./output/highlight_${new Date().toISOString()}.png`;

        await page.screenshot({
            path: outputPath,
        });

        await page.evaluate(() => {
            // Clean
            map.getLayers()
                .getArray()[0]
                .getSource()
                .forEachFeature((feature) => {
                    feature.setStyle(
                        new ol.style.Style({
                            fill: new ol.style.Fill({
                                color: "#444444",
                            }),
                            stroke: new ol.style.Stroke({
                                color: "#aaa",
                                width: 1,
                            }),
                        })
                    );
                });
        });
        utils.unlockBrowser();
        return path.resolve(process.cwd(), outputPath);
    },
    /**
     * 震度速报图
     * @param shindo 震度数据
     */
    shindoEarlyReport: async (shindo) => {
        await utils.waitBrowserAvailable();
        utils.lockBrowser();
        const page = global.page;
        const areaData = require("../definition/jma_area");
        const shindoGeoJson = {
            type: "FeatureCollection",
            features: [],
        };
        // 各地震度
        for (const intensity of ["1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"]) {
            if (shindo[intensity]) {
                for (const area of shindo[intensity]) {
                    if (areaData[area]) {
                        shindoGeoJson.features.push({
                            type: "Feature",
                            geometry: {
                                type: "Point",
                                coordinates: areaData[area].coordinates,
                            },
                            properties: {
                                intensity: intensity,
                            },
                        });
                    }
                }
            }
        }
        try {
            await page.evaluate((shindoGeoJson) => {
                map.addLayer(JapanSimpleMapLayer);
                const shindoStyle = {
                    x: new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.1,
                            src: "../data/images/epicenter.png",
                        }),
                    }),
                    1: new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_1.png",
                        }),
                    }),
                    2: new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_2.png",
                        }),
                    }),
                    3: new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_3.png",
                        }),
                    }),
                    4: new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_4.png",
                        }),
                    }),
                    "5-": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_5-.png",
                        }),
                    }),
                    "5+": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_5+.png",
                        }),
                    }),
                    "6-": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_6-.png",
                        }),
                    }),
                    "6+": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_6+.png",
                        }),
                    }),
                    7: new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_7.png",
                        }),
                    }),
                };
                const styleFunction = (feature) => {
                    return shindoStyle[feature.getProperties()["intensity"]];
                };
                const shindoLayer = new ol.layer.Vector({
                    source: new ol.source.Vector({
                        features: new ol.format.GeoJSON().readFeatures(shindoGeoJson, {
                            featureProjection: "EPSG:3857",
                        }),
                    }),
                    style: styleFunction,
                });
                shindoLayer.set("name", "shindo");
                map.addLayer(shindoLayer);
                map.getView().fit(getLayerByName("shindo").getSource().getExtent(), {
                    maxZoom: 9,
                });
                setFooter(
                    `Generated by Shiny-Map @ ${new Date().toISOString()} / ©2022 Shiny Project / Data Source: 気象庁`
                );
                setTitle(`震度速报`);
            }, shindoGeoJson);
        } catch (e) {
            Sentry.captureException(e);
            console.log("Navigation failed: " + e.message);
        }

        const outputPath = `./output/shindo_early_report_${utils.getTimestamp()}.png`;

        await page.screenshot({
            path: outputPath,
        });

        // Clean
        await page.evaluate(() => {
            map.removeLayer(getLayerByName("shindo"));
            map.removeLayer(JapanSimpleMapLayer);
        });
        utils.unlockBrowser();
        return path.resolve(process.cwd(), outputPath);
    },
    shindoReport: async (epicenter, shindo) => {
        const page = global.page;
        const areaData = require("../definition/jma_city");
        const shindoGeoJson = {
            type: "FeatureCollection",
            features: [],
        };

        // 震中

        shindoGeoJson.features.push({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: epicenter,
            },
            properties: {
                intensity: "x",
            },
        });

        // 震度

        for (const intensity of ["1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"]) {
            if (shindo[intensity]) {
                for (const area of shindo[intensity]) {
                    if (areaData[area]) {
                        shindoGeoJson.features.push({
                            type: "Feature",
                            geometry: {
                                type: "Point",
                                coordinates: areaData[area].coordinates,
                            },
                            properties: {
                                intensity: intensity,
                            },
                        });
                    }
                }
            }
        }
        while (global.isBrowserBusy) {
            await utils.sleep(200);
        }
        global.isBrowserBusy = true;
        try {
            await page.evaluate((shindoGeoJson) => {
                map.addLayer(JapanDetailedMapLayer);
                const shindoStyle = {
                    x: new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.1,
                            src: "../data/images/epicenter.png",
                        }),
                    }),
                    1: new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_1.png",
                        }),
                    }),
                    2: new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_2.png",
                        }),
                    }),
                    3: new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_3.png",
                        }),
                    }),
                    4: new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_4.png",
                        }),
                    }),
                    "5-": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_5-.png",
                        }),
                    }),
                    "5+": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_5+.png",
                        }),
                    }),
                    "6-": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_6-.png",
                        }),
                    }),
                    "6+": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_6+.png",
                        }),
                    }),
                    7: new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: "../data/images/is_7.png",
                        }),
                    }),
                };
                const styleFunction = (feature) => {
                    return shindoStyle[feature.getProperties()["intensity"]];
                };
                const shindoLayer = new ol.layer.Vector({
                    source: new ol.source.Vector({
                        features: new ol.format.GeoJSON().readFeatures(shindoGeoJson, {
                            featureProjection: "EPSG:3857",
                        }),
                    }),
                    style: styleFunction,
                });
                shindoLayer.set("name", "shindo");
                map.addLayer(shindoLayer);
                map.getView().fit(getLayerByName("shindo").getSource().getExtent(), {
                    maxZoom: 9,
                });
                setFooter(
                    `Generated by Shiny-Map @ ${new Date().toISOString()} / ©2022 Shiny Project / Data Source: 気象庁`
                );
                setTitle(`各地区震度信息`);
            }, shindoGeoJson);
        } catch (e) {
            Sentry.captureException(e);
            console.log("Navigation failed: " + e.message);
        }

        const outputPath = `./output/shindo_report_${utils.getTimestamp()}.png`;

        await page.screenshot({
            path: outputPath,
        });

        // Clean
        await page.evaluate(() => {
            map.removeLayer(getLayerByName("shindo"));
            map.removeLayer(JapanDetailedMapLayer);
        });

        global.isBrowserBusy = false;

        return path.resolve(process.cwd(), outputPath);
    },
    tsunamiWarning: async (tsunamiAreas) => {
        const page = global.tsunamiPage;
        const areaData = JSON.parse(
            fs.readFileSync(path.resolve(__dirname, "../definition/jma_tsunami_area.json")).toString()
        );
        const areaLevelMap = {};
        for (const key of ["notice", "warning", "alert"]) {
            if (tsunamiAreas[key] && tsunamiAreas[key].length > 0) {
                for (const name of tsunamiAreas[key]) {
                    areaLevelMap[name] = key;
                }
            }
        }
        const areaNames = Object.keys(areaLevelMap);
        areaData.features = areaData.features.filter((f) => {
            return areaNames.includes(f.properties.name);
        });
        while (global.isBrowserBusy) {
            await utils.sleep(200);
        }
        global.isBrowserBusy = true;
        try {
            await page.evaluate(
                (areaLevelMap, areaData) => {
                    showTsunamiLegend();
                    map.addLayer(JapanSimpleMapLayer);
                    const coastlineStyles = {
                        notice: new ol.style.Style({
                            stroke: new ol.style.Stroke({
                                color: "#faf500",
                                width: 3,
                            }),
                        }),
                        warning: new ol.style.Style({
                            stroke: new ol.style.Stroke({
                                color: "#ff2800",
                                width: 3,
                            }),
                        }),
                        alert: new ol.style.Style({
                            stroke: new ol.style.Stroke({
                                color: "#c800ff",
                                width: 3,
                            }),
                        }),
                    };
                    const coastlineStyleFunction = (feature) => {
                        return coastlineStyles[areaLevelMap[feature.getProperties()["name"]]];
                    };
                    const tsunamiWarningLayer = new ol.layer.Vector({
                        source: new ol.source.Vector({
                            features: new ol.format.GeoJSON().readFeatures(areaData, {
                                featureProjection: "EPSG:3857",
                            }),
                        }),
                        style: coastlineStyleFunction,
                    });
                    tsunamiWarningLayer.set("name", "tsunami_warning");
                    map.addLayer(tsunamiWarningLayer);
                    map.getView().fit(tsunamiWarningLayer.getSource().getExtent(), {
                        maxZoom: 9,
                    });
                    map.getView().setZoom(6);
                    setFooter(
                        `Generated by Shiny-Map @ ${new Date().toISOString()} / ©2022 Shiny Project / Data Source: 気象庁`
                    );
                    setTitle(`海啸警报`);
                },
                areaLevelMap,
                areaData
            );
        } catch (e) {
            Sentry.captureException(e);
            console.log("Navigation failed: " + e.message);
        }

        const outputPath = `./output/tsunami_warning_${utils.getTimestamp()}.png`;

        await page.screenshot({
            path: outputPath,
        });

        // Clean
        await page.evaluate(() => {
            hideTsunamiLegend();
            map.removeLayer(getLayerByName("tsunami_warning"));
            map.removeLayer(JapanSimpleMapLayer);
        });

        global.isBrowserBusy = false;

        return path.resolve(process.cwd(), outputPath);
    },
    tsunamiWarningCancel: async () => {
        const page = global.tsunamiPage;
        while (global.isBrowserBusy) {
            await utils.sleep(200);
        }
        global.isBrowserBusy = true;

        try {
            await page.evaluate(() => {
                showTsunamiLegend();
                setFullscreenTip("当前无海啸警报发表");
                showFullscreenTip();
                map.addLayer(JapanSimpleMapLayer);
                hideTitle();
                setFooter(
                    `Generated by Shiny-Map @ ${new Date().toISOString()} / ©2022 Shiny Project / Data Source: 気象庁`
                );
            });
        } catch (e) {
            Sentry.captureException(e);
            console.log("Navigation failed: " + e.message);
        }

        const outputPath = `./output/tsunami_warning_cancel_${utils.getTimestamp()}.png`;

        await page.screenshot({
            path: outputPath,
        });

        // Clean
        await page.evaluate(() => {
            hideTsunamiLegend();
            showTitle();
            hideFullscreenTip();
            map.removeLayer(JapanSimpleMapLayer);
        });

        global.isBrowserBusy = false;

        return path.resolve(process.cwd(), outputPath);
    },
};
