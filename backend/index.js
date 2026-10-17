const express = require("express");
require("dotenv").config();
const Sentry = require("@sentry/node");
const Tracing = require("@sentry/tracing");
const path = require("path");
const bodyParser = require("body-parser");
const MapController = require("./controller/MapController");
const Renderer = require("./service/MapRenderer");
const APIResponse = require("./response/APIResponse");

const app = express();

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
        // enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // enable Express.js middleware tracing
        new Tracing.Integrations.Express({ app }),
    ],

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
});

app.use(bodyParser.json({ limit: "1mb" }));
app.use(
    bodyParser.urlencoded({
        extended: true,
        limit: "1mb",
    })
);
// RequestHandler creates a separate execution context using domains, so that every
// transaction/span/breadcrumb is attached to its own Hub instance
app.use(Sentry.Handlers.requestHandler());
// TracingHandler creates a trace for every incoming request
app.use(Sentry.Handlers.tracingHandler());

// Load Browser
global.isBrowserLoaded = false;
global.browserInitializationError = null;

const puppeteer = require("puppeteer");
puppeteer
    .launch({
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--ignore-certificate-errors",
            "--no-first-run",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
        ],
        devtools: false,
    })
    .then(async (browser) => {
        global.browser = browser;
        try {
            global.page = await Renderer.createPage(browser, "index.html");
            global.tsunamiPage = await Renderer.createPage(browser, "index.html");
            global.typhoonPage = await Renderer.createPage(browser, "typhoon.html");
            global.ewPage = await Renderer.createPage(browser, "ew.html");
            global.isBrowserLoaded = true;
            console.log("Browser Loaded.");
        } catch (error) {
            await browser.close();
            global.browser = null;
            throw error;
        }
    })
    .catch((error) => {
        global.browserInitializationError = error;
        Sentry.captureException(error);
        console.error("Map browser initialization failed:", error);
    });

// 静态文件服务目录
app.use("/data", express.static(path.join(__dirname, "../data")));
app.use("/template", express.static(path.join(__dirname, "../dist")));

function handleMap(handler) {
    return (request, response, next) => {
        Promise.resolve().then(() => handler(request, response)).catch(next);
    };
}

app.use("/map/highlight", handleMap(MapController.highlight));
app.use("/map/shindo_early_report", handleMap(MapController.shindoEarlyReport));
app.use("/map/shindo_report", handleMap(MapController.shindoReport));
app.use("/map/tsunami_warning", handleMap(MapController.tsunamiWarning));
app.use("/map/typhoon_info", handleMap(MapController.typhoonInfo));
app.post(["/map/ew", "/map/emergency_warning"], handleMap(MapController.emergencyWarning));

// The error handler must be before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());
app.use((error, request, response, next) => {
    if (error.name !== "MapRenderError" || response.headersSent) return next(error);
    console.error(error.message);
    response.status(500).json(APIResponse.error("map_render_failed", "地图生成失败，请稍后重试"));
});

module.exports = app.listen(3000, () => console.log("Example app listening on port 3000!"));
