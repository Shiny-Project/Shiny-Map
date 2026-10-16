const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const puppeteer = require("puppeteer");
const { compareImages } = require("./image-diff");

let browser;
let page;

before(async () => {
    browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    page = await browser.newPage();
});

after(async () => {
    if (browser) await browser.close();
});

async function png(width, height, background = "#fff", marker = false) {
    const base64 = await page.evaluate(({ width, height, background, marker }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
        if (marker) {
            context.fillStyle = "#f00";
            context.fillRect(900, 500, 20, 20);
        }
        return canvas.toDataURL("image/png").split(",")[1];
    }, { width, height, background, marker });
    return Buffer.from(base64, "base64");
}

test("identical PNGs have zero changed pixels", async () => {
    const image = await png(64, 64);
    const result = await compareImages(page, image, image);
    assert.equal(result.passed, true);
    assert.equal(result.changedPixels, 0);
});

test("a missing 20×20 marker in a full HD map fails comparison", async () => {
    const expected = await png(1920, 1080, "#fff", true);
    const actual = await png(1920, 1080);
    const result = await compareImages(page, expected, actual);
    assert.equal(result.passed, false);
    assert.equal(result.changedPixels, 400);
});

test("small per-channel antialiasing differences stay within tolerance", async () => {
    const result = await compareImages(page, await png(64, 64, "#fff"), await png(64, 64, "#fafafa"));
    assert.equal(result.passed, true);
    assert.equal(result.changedPixels, 0);
});

test("image dimensions must match", async () => {
    const result = await compareImages(page, await png(64, 64), await png(32, 64));
    assert.equal(result.passed, false);
    assert.equal(result.sameDimensions, false);
    assert.deepEqual(result.actualSize, [32, 64]);
});
