const assert = require("node:assert/strict");

async function captureMapState(page) {
    return page.evaluate(() => {
        const view = map.getView();
        const stroke = (value) => value && ({
            color: value.getColor(),
            width: value.getWidth(),
            dash: value.getLineDash() || null,
        });
        const fill = (value) => value && value.getColor();
        const style = (value) => {
            const image = value.getImage();
            return {
                fill: fill(value.getFill()),
                stroke: stroke(value.getStroke()),
                zIndex: value.getZIndex() || 0,
                image: image && {
                    src: typeof image.getSrc === "function" && !/^\d+$/.test(image.getSrc())
                        ? image.getSrc() : null,
                    radius: typeof image.getRadius === "function" ? image.getRadius() : null,
                    scale: image.getScale(),
                    opacity: image.getOpacity(),
                },
            };
        };
        return {
            center: view.getCenter(),
            zoom: view.getZoom(),
            resolution: view.getResolution(),
            extent: view.calculateExtent(map.getSize()),
            layers: map.getLayers().getArray().map((layer) => ({
                name: layer.get("name"),
                visible: layer.getVisible(),
                opacity: layer.getOpacity(),
                features: layer.getSource().getFeatures().map((feature) => {
                    const geometry = feature.getGeometry();
                    const properties = feature.getProperties();
                    delete properties.geometry;
                    const styles = (feature.getStyleFunction() || layer.getStyleFunction())(
                        feature, view.getResolution()
                    );
                    return {
                        properties,
                        geometry: geometry.getType(),
                        extent: geometry.getExtent(),
                        pixel: geometry.getType() === "Point"
                            ? map.getPixelFromCoordinate(geometry.getCoordinates()) : null,
                        styles: (Array.isArray(styles) ? styles : [styles]).map(style),
                    };
                }).sort((left, right) => JSON.stringify(left.properties).localeCompare(JSON.stringify(right.properties))),
            })),
        };
    });
}

function assertMapStateMatches(actual, expected, location = "map") {
    if (typeof actual === "number" && typeof expected === "number") {
        assert.ok(Math.abs(actual - expected) <= 1e-6, location + ": " + actual + " != " + expected);
    } else if (actual && expected && typeof actual === "object" && typeof expected === "object") {
        assert.equal(Array.isArray(actual), Array.isArray(expected), location);
        assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), location);
        for (const key of Object.keys(expected)) {
            assertMapStateMatches(actual[key], expected[key], location + "." + key);
        }
    } else {
        assert.equal(actual, expected, location);
    }
}

module.exports = { captureMapState, assertMapStateMatches };
