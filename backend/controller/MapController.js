const APIResponse = require('../response/APIResponse');

class MapController {
    constructor() {

    }
    /**
     * 中国大陆地区市级指定高亮
     * @param {*} request 
     * @param {*} response 
     */
    async highlight(request, response) {
        if (!global.isBrowserLoaded) {
            return response.status(500).json(APIResponse.error('try_again_later', '人家还没准备好'));
        }

        let needHighlight;
        // 参数验证
        try {
            needHighlight = JSON.parse(request.query.cities);
        } catch (e) {
            return response.status(400).json(APIResponse.error('bad_json', '无法解析 JSON'));
        }
        if (!Array.isArray(needHighlight)) {
            return response.status(400).json(APIResponse.error('need_array', 'cities 需要为数组'));
        }

        const center = request.query.center;

        if (!center) {
            return response.status(400).json(APIResponse.error('missing_parameters', '缺少 center 参数'));
        }

        const provinceData = require('../definition/china_provinces');

        if (!Object.keys(provinceData).includes(center)) {
            return response.status(400).json(APIResponse.error('missing_parameters', '不支持的省份'));
        }

        if (["云南省", "西藏自治区"].includes(center)) {
            return response.status(451).json(APIResponse.error('missing_parameters', '不支持的省份'));
        }

        const page = global.page;

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

        await page.screenshot({
            path: "test.png"
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

        response.json(APIResponse.success({
            status: "success"
        }));
    }
}

module.exports = new MapController();

const result = {};
map.getLayers().getArray()[1].getSource().forEachFeature(feature => {
    if (feature.getProperties()['NL_NAME_2']) {
        result[feature.getProperties()['NL_NAME_2']] = {
            parent: feature.getProperties()['NL_NAME_1'],
            coordinates: ol.extent.getCenter(ol.proj.transformExtent(feature.getGeometry().getExtent(), 'EPSG:3857', 'EPSG:4326'))
        }
    }
});