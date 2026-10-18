const APIResponse = require("../response/APIResponse");

class MapController {
    constructor() {}
    async volcanoWarning(request, response) {
        const { prepare } = require("../service/VolcanoInput");
        let warning;
        try {
            warning = prepare(request.body.warning);
        } catch (error) {
            if (error.name !== "VolcanoInputError") throw error;
            return response.status(400).json(APIResponse.error("bad_volcano", error.message));
        }
        if (!global.isBrowserLoaded) {
            return response.status(500).json(APIResponse.error("try_again_later", "人家还没准备好"));
        }
        const renderVolcano = require("../service/VolcanoService");
        response.json(APIResponse.success({ path: await renderVolcano(warning) }));
    }
    async emergencyWarning(request, response) {
        const EWInput = require("../service/EWInput");
        let warning;
        try {
            warning = EWInput.prepare(request.body.warning);
        } catch (error) {
            if (error.name !== "EWInputError") throw error;
            return response.status(400).json(APIResponse.error("bad_ew", error.message));
        }
        if (!global.isBrowserLoaded) {
            return response.status(500).json(APIResponse.error("try_again_later", "人家还没准备好"));
        }
        const renderEW = require("../service/EWService");
        response.json(APIResponse.success({ path: await renderEW(warning) }));
    }
    /**
     * 中国大陆地区市级指定高亮
     * @param {*} request
     * @param {*} response
     */
    async highlight(request, response) {
        const provinceData = require("../definition/china_provinces");

        if (!global.isBrowserLoaded) {
            return response.status(500).json(APIResponse.error("try_again_later", "人家还没准备好"));
        }

        let needHighlight;
        // 参数验证
        try {
            needHighlight = JSON.parse(request.query.cities);
        } catch (e) {
            return response.status(400).json(APIResponse.error("bad_json", "无法解析 JSON"));
        }
        if (!Array.isArray(needHighlight)) {
            return response.status(400).json(APIResponse.error("need_array", "cities 需要为数组"));
        }

        const center = request.query.center;

        if (!center) {
            return response.status(400).json(APIResponse.error("missing_parameters", "缺少 center 参数"));
        }

        if (!Object.keys(provinceData).includes(center)) {
            return response.status(400).json(APIResponse.error("missing_parameters", "不支持的省份"));
        }

        if (["云南省", "西藏自治区"].includes(center)) {
            return response.status(451).json(APIResponse.error("missing_parameters", "不支持的省份"));
        }

        const MapService = require("../service/MapService");

        const path = await MapService.highlight(needHighlight, center);

        response.json(
            APIResponse.success({
                status: "success",
                path,
            })
        );
    }
    /**
     * 震度速报
     * @param {*} request
     * @param {*} response
     */
    async shindoEarlyReport(request, response) {
        if (!global.isBrowserLoaded) {
            return response.status(500).json(APIResponse.error("try_again_later", "人家还没准备好"));
        }
        let shindoData;
        try {
            shindoData = JSON.parse(request.body.shindo);
        } catch (e) {
            return response.status(400).json(APIResponse.error("bad_json", "无法解析 JSON"));
        }

        const MapService = require("../service/MapService");
        const path = await MapService.shindoEarlyReport(shindoData);
        response.json(
            APIResponse.success({
                path,
            })
        );
    }
    /**
     * 各地区震度信息
     * @param {*} request
     * @param {*} response
     */
    async shindoReport(request, response) {
        if (!global.isBrowserLoaded) {
            return response.status(500).json(APIResponse.error("try_again_later", "人家还没准备好"));
        }
        let shindoData, epicenter;
        try {
            shindoData = JSON.parse(request.body.shindo);
            epicenter = JSON.parse(request.body.epicenter);
        } catch (e) {
            return response.status(400).json(APIResponse.error("bad_json", "无法解析 JSON"));
        }

        if (!Array.isArray(epicenter) || epicenter.length !== 2) {
            return response.status(400).json(APIResponse.error("bad_epicenter", "无法解析 Epicenter"));
        }

        const MapService = require("../service/MapService");
        const path = await MapService.shindoReport(epicenter, shindoData);
        response.json(
            APIResponse.success({
                path,
            })
        );
    }
    /**
     * 海啸警报
     * @param {*} request
     * @param {*} response
     */
    async tsunamiWarning(request, response) {
        const TsunamiInput = require("../service/TsunamiInput");
        let warning;
        try {
            warning = TsunamiInput.prepare(request.body.warning, request.body.type === "cancel");
        } catch (error) {
            if (error.name !== "TsunamiInputError") throw error;
            return response.status(400).json(APIResponse.error("bad_tsunami", error.message));
        }
        if (!global.isBrowserLoaded) {
            return response.status(500).json(APIResponse.error("try_again_later", "人家还没准备好"));
        }

        if (!warning.areaData.features.length) {
            const MapService = require("../service/MapService");
            const path = await MapService.tsunamiWarningCancel();
            response.json(
                APIResponse.success({
                    path,
                })
            );
            return;
        }

        const MapService = require("../service/MapService");
        const path = await MapService.tsunamiWarning(warning);
        response.json(
            APIResponse.success({
                path,
            })
        );
    }

    /**
     * 台风信息
     */
    async typhoonInfo(request, response) {
        if (!global.isBrowserLoaded) {
            return response.status(500).json(APIResponse.error("try_again_later", "人家还没准备好"));
        }

        let typhoonData;
        try {
            typhoonData = JSON.parse(request.body.typhoon_info);
        } catch (e) {
            return response.status(400).json(APIResponse.error("bad_json", "无法解析 JSON"));
        }

        if (!typhoonData.remark && !typhoonData.points?.length) {
            return response.status(400).json(APIResponse.error("bad_json", "台风消息至少需要提供提示信息或路径点"));
        }

        const MapService = require("../service/MapService");
        const path = await MapService.typhoonInfo(typhoonData);
        response.json(
            APIResponse.success({
                path,
            })
        );
    }
}

module.exports = new MapController();
