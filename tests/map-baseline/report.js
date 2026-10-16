const fs = require("node:fs");
const path = require("node:path");

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
}

async function writeReport(directory, report, page) {
    fs.writeFileSync(path.join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
    const rows = report.cases.map((item) => {
        const timings = item.timing;
        return (
            "<tr><td>" + escapeHtml(item.label) + "</td><td>" +
            (item.passed ? "通过" : item.samples.length < report.runs ? "未完成" : "失败") +
            "</td><td>" + (timings ? timings.medianMs.toFixed(1) : "—") +
            "</td><td>" + (timings ? timings.p95Ms.toFixed(1) : "—") +
            "</td><td>" + (100 * (item.maxDiffRatio || 0)).toFixed(4) + "%</td></tr>"
        );
    });
    const cards = report.cases.filter((item) => fs.existsSync(path.join(directory, "actual", item.id + ".png")))
        .map((item) => {
            const actual = "actual/" + item.id + ".png";
            const expected = "expected/" + item.id + ".png";
            const diff = "diff/" + item.id + ".png";
            return (
                "<article><h2>" + escapeHtml(item.label) + "</h2><a href='" + actual +
                "'><img src='" + actual + "' alt='" + escapeHtml(item.label) + "'></a><p>" +
                (fs.existsSync(path.join(directory, expected)) ? "<a href='" + expected + "'>参考图</a> · " : "") +
                (fs.existsSync(path.join(directory, diff)) ? "<a href='" + diff + "'>差异图</a> · " : "") +
                escapeHtml(item.id) + "</p></article>"
            );
        });
    const html = [
        "<!doctype html><html lang='zh-CN'><meta charset='utf-8'><title>Shiny-Map 出图基准</title>",
        "<style>body{font:16px system-ui,sans-serif;margin:32px;background:#f3f5f8;color:#182332}",
        "h1{margin-bottom:8px}small,p{color:#526074}table{border-collapse:collapse;width:100%;",
        "background:white;margin:24px 0}th,td{text-align:left;padding:10px 16px;border-bottom:1px solid #e2e7ee}",
        ".gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}article{background:white;",
        "border-radius:12px;padding:16px}h2{font-size:18px;margin:0 0 12px}img{width:100%;display:block}",
        "a{color:#245bd6}li{margin:6px 0}</style><h1>Shiny-Map 出图基准 · ",
        report.passed ? "通过" : "失败", "</h1><small>",
        escapeHtml(report.mode), " · ", escapeHtml(report.environment?.browser || ""), " · ",
        escapeHtml(report.environment?.platform || ""), " · ", String(report.runs),
        " 次测量 / 场景</small><p>固定样例为合成测试数据。耗时包含接口处理与截图，不含启动、构建和预热。",
        "少量样本的 P95 仅供观察；差异图中的粉色表示变化像素。</p><ul>",
        [...report.warnings, ...report.failures].map((message) => "<li>" + escapeHtml(message) + "</li>").join(""),
        "</ul><table><thead><tr><th>场景</th><th>结果</th><th>中位数 ms</th><th>P95 ms</th>",
        "<th>最大像素差异</th></tr></thead><tbody>", rows.join(""),
        "</tbody></table><div class='gallery'>", cards.join(""), "</div></html>",
    ].join("");
    const reportPath = path.join(directory, "report.html");
    fs.writeFileSync(reportPath, html);
    if (page) {
        // Inline images for the preview so it does not depend on a running local server.
        const preview = html.replace(/src='(actual\/[^']+)'/g, (_, relativePath) => {
            return "src='data:image/png;base64," +
                fs.readFileSync(path.join(directory, relativePath)).toString("base64") + "'";
        });
        await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
        await page.setContent(preview, { waitUntil: "load" });
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(Array.from(document.images, (image) => image.decode()));
        });
        await page.screenshot({ path: path.join(directory, "preview.png"), fullPage: true });
    }
}

module.exports = { writeReport };
