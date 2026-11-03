import ol from "./openlayers";

export const defaultMapStyle = new ol.style.Style({
    fill: new ol.style.Fill({ color: "#F5F5F5" }),
    stroke: new ol.style.Stroke({ color: "#aaa", width: 1 }),
});

export function createBaseMapLayer() {
    const layer = new ol.layer.Vector({
        // Static polygons need only their one-pixel outline beyond the viewport.
        renderBuffer: 2,
        source: new ol.source.Vector({
            overlaps: false,
            url: "../data/world_base.json",
            format: new ol.format.GeoJSON(),
        }),
        style: defaultMapStyle,
    });
    layer.set("name", "world_base");
    return layer;
}
