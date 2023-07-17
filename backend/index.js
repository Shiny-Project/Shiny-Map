const express = require("express");
require("dotenv").config();
const Sentry = require("@sentry/node");
const Tracing = require("@sentry/tracing");
const path = require("path");
const bodyParser = require("body-parser");
const MapController = require("./controller/MapController");

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

app.use(bodyParser.json());
app.use(
    bodyParser.urlencoded({
        extended: true,
    })
);
// RequestHandler creates a separate execution context using domains, so that every
// transaction/span/breadcrumb is attached to its own Hub instance
app.use(Sentry.Handlers.requestHandler());
// TracingHandler creates a trace for every incoming request
app.use(Sentry.Handlers.tracingHandler());

// Load Browser
global.isBrowserLoaded = false;

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
        // Earthquake Page
        const page = await browser.newPage();
        page.setViewport({
            width: 1920,
            height: 1080,
        });
        page.on("console", (msg) => {
            for (let i = 0; i < msg.args().length; ++i) console.log(`${i}: ${msg.args()[i]}`);
        });
        try {
            await page.goto(`http://localhost:3000/template/index.html`, {
                waitUntil: "networkidle0",
            });
        } catch (e) {
            Sentry.captureException(e);
        }
        console.log("Earthquake page ready.");

        // Tsunami Page
        const tsunamiPage = await browser.newPage();
        tsunamiPage.setViewport({
            width: 1920,
            height: 1080,
        });
        tsunamiPage.on("console", (msg) => {
            for (let i = 0; i < msg.args().length; ++i) console.log(`${i}: ${msg.args()[i]}`);
        });
        try {
            await tsunamiPage.goto(`http://localhost:3000/template/index.html`, {
                waitUntil: "networkidle0",
            });
        } catch (e) {
            Sentry.captureException(e);
        }
        console.log("Tsunami page ready.");

        // Typhoon Page
        const typhoonPage = await browser.newPage();
        typhoonPage.setViewport({
            width: 1920,
            height: 1080,
        });
        typhoonPage.on("console", (msg) => {
            for (let i = 0; i < msg.args().length; ++i) console.log(`${i}: ${msg.args()[i]}`);
        });
        try {
            await typhoonPage.goto(`http://localhost:3000/template/typhoon.html`, {
                waitUntil: "networkidle0",
            });
        } catch (e) {
            Sentry.captureException(e);
        }
        console.log("Typhoon page ready.");

        global.isBrowserLoaded = true;
        global.browser = browser;
        global.page = page;
        global.tsunamiPage = tsunamiPage;
        global.typhoonPage = typhoonPage;
        console.log("Browser Loaded.");
    });

// 静态文件服务目录
app.use("/data", express.static(path.join(__dirname, "../data")));
app.use("/template", express.static(path.join(__dirname, "../dist")));

app.use("/map/highlight", MapController.highlight);
app.use("/map/shindo_early_report", MapController.shindoEarlyReport);
app.use("/map/shindo_report", MapController.shindoReport);
app.use("/map/tsunami_warning", MapController.tsunamiWarning);
app.use("/map/typhoon_info", MapController.typhoonInfo);

// The error handler must be before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

app.listen(3000, () => console.log("Example app listening on port 3000!"));
