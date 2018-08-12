const APIResponse = require('../response/APIResponse');

class MapController {
    constructor() {

    }
    async highlight(request, response) {
        if (!global.isBrowserLoaded) {
            response.json(APIResponse.error('try_again_later', '人家还没准备好'));
        }
        const page = global.page;
        const needHighlight = ["温州市"];
        try {
            await page.evaluate((needHighlight) => {
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
            }, needHighlight)
        } catch (e) {
            console.log('Navigation failed: ' + e.message);
        }

        await page.screenshot({
            path: "test.png"
        });

        response.json(APIResponse.success({
            status: "success"
        }));
    }
}

module.exports = new MapController();