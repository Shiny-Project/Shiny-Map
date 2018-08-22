const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const MapController = require('./controller/MapController');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

// Load Browser
global.isBrowserLoaded = false;
const puppeteer = require('puppeteer');
puppeteer.launch({
    args: ['--no-sandbox']
}).then(async browser => {
    const page = await browser.newPage();
    page.setViewport({
        width: 1920,
        height: 1080
    });
    page.on('console', msg => {
        for (let i = 0; i < msg.args().length; ++i)
          console.log(`${i}: ${msg.args()[i]}`);
      });
    await page.goto(`http://localhost:3000/template/index.html`, {
        waitUntil: 'networkidle0'
    });

    global.isBrowserLoaded = true;
    global.browser = browser;
    global.page = page;
    console.log('Browser Loaded.');
})

// 静态文件服务目录
app.use('/data', express.static(path.join(__dirname, '../data')));
app.use('/template', express.static(path.join(__dirname, '../dist')));

app.use('/map/highlight', MapController.highlight);
app.use('/map/shindo_early_report', MapController.shindoEarlyReport);
app.use('/map/shindo_report', MapController.shindoReport);

app.listen(3000, () => console.log('Example app listening on port 3000!'));