const APIResponse = require('../response/APIResponse');

class MapController {
    async highlight(request, response) {
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();
        page.setViewport({
            width: 1920,
            height: 1080
        });
        await page.goto("http://localhost:3000/template/index.html", {"waitUntil" : "networkidle0"});
        await page.screenshot({
            path: "test.png"
        });
        await browser.close();
        response.json(APIResponse.success({
            status: "success"
        }));
    }
}

module.exports = new MapController();