export const defaultMapStyle = new ol.style.Style({
    fill: new ol.style.Fill({ color: "#F5F5F5" }),
    stroke: new ol.style.Stroke({ color: "#aaa", width: 1 }),
});

export function createBaseMapLayer() {
    const layer = new ol.layer.Vector({
        source: new ol.source.Vector({
            url: "../data/world_base.json",
            format: new ol.format.GeoJSON(),
        }),
        style: defaultMapStyle,
    });
    layer.set("name", "world_base");
    return layer;
}
