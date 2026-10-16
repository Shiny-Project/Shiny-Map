const fs = require("node:fs");

const comparison = { channelThreshold: 16, maxDiffRatio: 0.0001 };

async function compareImages(page, expected, actual, diffPath) {
    const result = await page.evaluate(
        async ({ expected, actual, channelThreshold }) => {
            async function decode(data) {
                const image = new Image();
                image.src = "data:image/png;base64," + data;
                await image.decode();
                const canvas = document.createElement("canvas");
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                const context = canvas.getContext("2d");
                context.drawImage(image, 0, 0);
                return {
                    width: canvas.width,
                    height: canvas.height,
                    pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
                };
            }

            const left = await decode(expected);
            const right = await decode(actual);
            if (left.width !== right.width || left.height !== right.height) {
                return {
                    sameDimensions: false,
                    expectedSize: [left.width, left.height],
                    actualSize: [right.width, right.height],
                    diffRatio: 1,
                };
            }

            const canvas = document.createElement("canvas");
            canvas.width = right.width;
            canvas.height = right.height;
            const context = canvas.getContext("2d");
            const diff = context.createImageData(right.width, right.height);
            let changedPixels = 0;
            for (let offset = 0; offset < right.pixels.length; offset += 4) {
                let changed = false;
                for (let channel = 0; channel < 4; channel++) {
                    if (Math.abs(left.pixels[offset + channel] - right.pixels[offset + channel]) > channelThreshold) {
                        changed = true;
                    }
                }
                if (changed) {
                    changedPixels++;
                    diff.data.set([255, 0, 80, 255], offset);
                } else {
                    const gray = Math.round(
                        (right.pixels[offset] + right.pixels[offset + 1] + right.pixels[offset + 2]) / 3
                    );
                    diff.data.set([gray, gray, gray, 90], offset);
                }
            }
            context.putImageData(diff, 0, 0);
            return {
                sameDimensions: true,
                width: right.width,
                height: right.height,
                changedPixels,
                diffRatio: changedPixels / (right.width * right.height),
                diffImage: changedPixels ? canvas.toDataURL("image/png").split(",")[1] : null,
            };
        },
        {
            expected: expected.toString("base64"),
            actual: actual.toString("base64"),
            channelThreshold: comparison.channelThreshold,
        }
    );
    if (result.diffImage && diffPath) {
        fs.writeFileSync(diffPath, Buffer.from(result.diffImage, "base64"));
    }
    delete result.diffImage;
    return {
        ...result,
        passed: result.sameDimensions && result.diffRatio <= comparison.maxDiffRatio,
    };
}

module.exports = { compareImages, comparison };
