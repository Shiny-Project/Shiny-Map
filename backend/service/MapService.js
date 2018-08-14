module.exports = {
    /**
     * 中国大陆地区市级指定高亮
     * @param {*} needHighlight 需要高亮的市级区划 
     * @param {*} center 中心省份
     * @return {Promise<string>} 图片路径
     */
    highlight: async (needHighlight, center) => {
        const page = global.page;
        const provinceData = require('../definition/china_provinces');

        try {
            await page.evaluate((needHighlight, provinceData, center) => {
                map.getView().setCenter(ol.proj.fromLonLat([provinceData[center].longitude, provinceData[center].latitude]));
                map.getView().setZoom(provinceData[center].zoom);
                map.getLayers().getArray()[0].getSource().forEachFeature(feature => {
                    if (needHighlight.includes(feature.getProperties()['NL_NAME_2'])) {
                        feature.setStyle(new ol.style.Style({
                            fill: new ol.style.Fill({
                                color: 'red'
                            }),
                            stroke: new ol.style.Stroke({
                                color: '#aaa',
                                width: 2
                            }),
                        }))
                    }
                });
            }, needHighlight, provinceData, center)
        } catch (e) {
            console.log('Navigation failed: ' + e.message);
        }

        const path = 'test.png';

        await page.screenshot({
            path
        });

        await page.evaluate(() => {
            // Clean
            map.getLayers().getArray()[0].getSource().forEachFeature(feature => {
                feature.setStyle(new ol.style.Style({
                    fill: new ol.style.Fill({
                        color: '#444444'
                    }),
                    stroke: new ol.style.Stroke({
                        color: '#aaa',
                        width: 1
                    }),
                }))
            });
        })

        return path;
    },
    /**
     * 震度速报图
     * @param shindo 震度数据
     */
    shindoEarlyReport: async (epicenter, shindo) => {
        const page = global.page;
        const areaData = require('../definition/jma_area');
        const shindoGeoJson = {
            "type": "FeatureCollection",
            "features": []
        };

        // 震中

        shindoGeoJson.features.push({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": epicenter
            },
            "properties": {
                "intensity": 'x'
            }
        })

        // 各地震度
        for (const intensity of ["1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"]) {
            if (shindo[intensity]) {
                for (const area of shindo[intensity]) {
                    if (areaData[area]) {
                        shindoGeoJson.features.push({
                            "type": "Feature",
                            "geometry": {
                                "type": "Point",
                                "coordinates": areaData[area].coordinates
                            },
                            "properties": {
                                "intensity": intensity
                            }
                        })
                    }
                }
            }
        }

        try {
            await page.evaluate((shindoGeoJson) => {
                const shindoStyle = {
                    "x": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.075,
                            src: '../data/images/epicenter.png'
                        })
                    }),
                    "1": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_1.png'
                        })
                    }),
                    "2": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_2.png'
                        })
                    }),
                    "3": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_3.png'
                        })
                    }),
                    "4": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_4.png'
                        })
                    }),
                    "5-": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_5-.png'
                        })
                    }),
                    "5+": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_5+.png'
                        })
                    }),
                    "6-": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_6-.png'
                        })
                    }),
                    "6+": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_6+.png'
                        })
                    }),
                    "7": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_7.png'
                        })
                    }),
                }
                const styleFunction = (feature) => {
                    return shindoStyle[feature.getProperties()['intensity']];
                }
                const shindoLayer = new ol.layer.Vector({
                    source: new ol.source.Vector({
                        features: (new ol.format.GeoJSON()).readFeatures(shindoGeoJson, {
                            featureProjection: "EPSG:3857"
                        }),
                    }),
                    style: styleFunction,
                });
                shindoLayer.set('name', 'shindo');
                map.addLayer(
                    shindoLayer
                );
                map.getView().fit(map.getLayers().getArray()[2].getSource().getExtent());
            }, shindoGeoJson)
        } catch (e) {
            console.log('Navigation failed: ' + e.message);
        }

        const path = 'test.png';

        await page.screenshot({
            path
        });

        // Clean
        await page.evaluate(() => {
            map.getLayers().forEach(layer => {
                if (layer.get('name') === 'shindo') {
                    map.removeLayer(layer);
                }
            });
        });

        return path;
    },
    shindoReport: async (epicenter, shindo) => {
        const page = global.page;
        const areaData = require('../definition/jma_city');
        const shindoGeoJson = {
            "type": "FeatureCollection",
            "features": []
        };

        // 震中

        shindoGeoJson.features.push({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": epicenter
            },
            "properties": {
                "intensity": 'x'
            }
        })

        // 震度

        for (const intensity of ["1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"]) {
            if (shindo[intensity]) {
                for (const area of shindo[intensity]) {
                    if (areaData[area]) {
                        shindoGeoJson.features.push({
                            "type": "Feature",
                            "geometry": {
                                "type": "Point",
                                "coordinates": areaData[area].coordinates
                            },
                            "properties": {
                                "intensity": intensity
                            }
                        })
                    }
                }
            }
        }

        try {
            await page.evaluate((shindoGeoJson) => {
                const shindoStyle = {
                    "x": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.075,
                            src: '../data/images/epicenter.png'
                        })
                    }),
                    "1": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_1.png'
                        })
                    }),
                    "2": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_2.png'
                        })
                    }),
                    "3": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_3.png'
                        })
                    }),
                    "4": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_4.png'
                        })
                    }),
                    "5-": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_5-.png'
                        })
                    }),
                    "5+": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_5+.png'
                        })
                    }),
                    "6-": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_6-.png'
                        })
                    }),
                    "6+": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_6+.png'
                        })
                    }),
                    "7": new ol.style.Style({
                        image: new ol.style.Icon({
                            scale: 0.05,
                            src: '../data/images/is_7.png'
                        })
                    }),
                }
                const styleFunction = (feature) => {
                    return shindoStyle[feature.getProperties()['intensity']];
                }
                const shindoLayer = new ol.layer.Vector({
                    source: new ol.source.Vector({
                        features: (new ol.format.GeoJSON()).readFeatures(shindoGeoJson, {
                            featureProjection: "EPSG:3857"
                        }),
                    }),
                    style: styleFunction,
                });
                shindoLayer.set('name', 'shindo');
                map.addLayer(
                    shindoLayer
                );
                map.getView().fit(map.getLayers().getArray()[2].getSource().getExtent());
            }, shindoGeoJson)
        } catch (e) {
            console.log('Navigation failed: ' + e.message);
        }

        const path = 'test.png';

        await page.screenshot({
            path
        });

        // Clean
        await page.evaluate(() => {
            map.getLayers().forEach(layer => {
                if (layer.get('name') === 'shindo') {
                    map.removeLayer(layer);
                }
            });
        });

        return path;
    }
}