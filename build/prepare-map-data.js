const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const polygonClipping = require("polygon-clipping");

const root = path.resolve(__dirname, "..");
const sourceUrl = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/" +
    "9380cca83db5f9aef52d5e762765100745f84b27/geojson/ne_50m_admin_0_countries.geojson";
const sourceSha256 = "3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb";
const regionalFiles = {
    CHN: "gadm36_CHN_2.json",
    JPN: "gadm36_JPN_2.json",
    PRK: "gadm36_PRK_0.json",
    KOR: "gadm36_KOR_0.json",
    TWN: "gadm36_TWN_0.json",
};
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

async function prepareMapData() {
    let sourceBuffer;
    if (process.argv[2]) {
        sourceBuffer = fs.readFileSync(path.resolve(process.argv[2]));
    } else {
        const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error("World data download failed: HTTP " + response.status);
        sourceBuffer = Buffer.from(await response.arrayBuffer());
    }
    if (sha256(sourceBuffer) !== sourceSha256) {
        throw new Error("World source checksum differs from the pinned Natural Earth dataset.");
    }
    const source = JSON.parse(sourceBuffer.toString("utf8"));
    const sourceRegions = new Map(source.features.map((feature) => [feature.properties.ADM0_A3, feature]));
    const features = source.features
        .filter((feature) => !Object.hasOwn(regionalFiles, feature.properties.ADM0_A3))
        .map((feature) => ({
            type: "Feature",
            properties: { code: feature.properties.ADM0_A3, detail: "world" },
            geometry: feature.geometry,
        }));
    const inputs = {};
    for (const [code, file] of Object.entries(regionalFiles)) {
        if (!sourceRegions.has(code)) throw new Error("World source is missing region " + code);
        const buffer = fs.readFileSync(path.join(root, "data", file));
        const region = JSON.parse(buffer.toString("utf8"));
        // Dissolve administrative borders without simplifying the original coastline.
        const coordinates = polygonClipping.union(...region.features.map((feature) => feature.geometry.coordinates));
        features.push({
            type: "Feature",
            properties: { code, detail: "regional" },
            geometry: { type: "MultiPolygon", coordinates },
        });
        inputs[file] = sha256(buffer);
        console.log("Preserved high-detail outline: " + code);
    }
    const map = JSON.stringify({ type: "FeatureCollection", features }) + "\n";
    const metadata = {
        world: {
            sourceUrl,
            sha256: sourceSha256,
            scale: "1:50,000,000",
            license: "Public domain",
            licenseUrl: "https://www.naturalearthdata.com/about/terms-of-use/",
        },
        regionalInputs: inputs,
        processing: "Replace world regions with unions of their original GADM geometries; no regional simplification.",
        outputSha256: sha256(map),
    };
    fs.writeFileSync(path.join(root, "data/world_base.json"), map);
    fs.writeFileSync(path.join(root, "data/world_base.sources.json"), JSON.stringify(metadata, null, 2) + "\n");
    console.log("World base map: " + features.length + " regions, " + Buffer.byteLength(map) + " bytes");
}

prepareMapData().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
