const Lock = require("../utils/lock");

const pages = new WeakMap();
const timeoutMs = 10000;

function stateFor(page) {
    const state = page && pages.get(page);
    if (!state) throw new Error("Map page has not been initialized.");
    return state;
}

function observeResources(page, url) {
    const state = { url, pending: new Set(), errors: [], listeners: new Set(), version: 0, dirty: true };
    pages.set(page, state);
    const origin = new URL(url).origin;
    const changed = () => {
        state.version++;
        for (const listener of state.listeners) listener();
    };
    page.on("request", (request) => {
        if (new URL(request.url()).origin === origin) {
            state.pending.add(request);
            changed();
        }
    });
    page.on("requestfinished", (request) => {
        if (state.pending.delete(request)) changed();
    });
    page.on("requestfailed", (request) => {
        if (!state.pending.delete(request)) return;
        state.errors.push("Resource failed: " + request.url() + " (" + request.failure()?.errorText + ")");
        changed();
    });
    page.on("response", (response) => {
        if (state.pending.has(response.request()) && response.status() >= 400) {
            state.errors.push("Resource failed: HTTP " + response.status() + " " + response.url());
            changed();
        }
    });
    page.on("pageerror", (error) => {
        state.errors.push("Page script failed: " + error.message);
        changed();
    });
    page.on("console", (message) => {
        if (message.args().length) console.log(message.text());
    });
    return state;
}

async function waitForResources(page, timeout) {
    const state = stateFor(page);
    await new Promise((resolve, reject) => {
        let timer;
        const finish = (error) => {
            clearTimeout(timer);
            state.listeners.delete(check);
            if (error) reject(error);
            else resolve();
        };
        const check = () => {
            if (state.errors.length) finish(new Error(state.errors.join("\n")));
            else if (!state.pending.size) finish();
        };
        timer = setTimeout(() => {
            finish(new Error("Resource loading timed out: " +
                [...state.pending].map((request) => request.url()).join(", ")));
        }, timeout);
        state.listeners.add(check);
        check();
    });
}

async function waitForPaint(page, timeout) {
    await page.evaluate((timeout) => new Promise((resolve, reject) => {
        if (!window.map) {
            reject(new Error("Map template did not initialize."));
            return;
        }
        const imageStates = { idle: 0, loading: 1, error: 3 };
        let settled = false;
        const finish = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            map.un("postrender", completed);
            if (error) reject(error);
            else resolve();
        };
        const completed = (event) => {
            try {
                let loading = map.getView().getAnimating() || event.frameState.animate;
                for (const layer of map.getLayers().getArray()) {
                    if (!layer.getVisible()) continue;
                    const source = layer.getSource();
                    if (typeof source?.getFeatures !== "function") continue;
                    for (const feature of source.getFeatures()) {
                        const styleFunction = feature.getStyleFunction() || layer.getStyleFunction();
                        const styles = styleFunction?.(feature, map.getView().getResolution());
                        for (const style of Array.isArray(styles) ? styles : styles ? [styles] : []) {
                            const image = style.getImage();
                            if (image) {
                                const state = image.getImageState();
                                if (state === imageStates.error) throw new Error("Map icon failed: " + image.getSrc());
                                if (state === imageStates.idle) image.load();
                                if (state === imageStates.idle || state === imageStates.loading) loading = true;
                            }
                        }
                    }
                }
                if (loading) map.render();
                else finish();
            } catch (error) {
                finish(error);
            }
        };
        const timer = setTimeout(() => finish(new Error("Map rendering or fonts timed out.")), timeout);
        document.fonts.ready.then(() => {
            if (settled) return;
            // The bundled global OpenLayers build predates rendercomplete.
            map.on("postrender", completed);
            try {
                map.renderSync();
            } catch (error) {
                finish(error);
            }
        }, finish);
    }), timeout);
}

async function waitForReady(page) {
    const state = stateFor(page);
    const deadline = Date.now() + timeoutMs;
    const remaining = () => {
        const timeout = deadline - Date.now();
        if (timeout <= 0) throw new Error("Map readiness timed out.");
        return timeout;
    };
    // Rendering may start additional local data/icon requests. Repaint after those
    // finish, instead of treating an empty request counter as a completed map.
    while (true) {
        await waitForResources(page, remaining());
        const version = state.version;
        await waitForPaint(page, remaining());
        await waitForResources(page, remaining());
        if (state.version === version) return;
    }
}

async function loadPage(page) {
    const state = stateFor(page);
    state.dirty = true;
    state.errors = [];
    state.pending.clear();
    await page.goto(state.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await waitForReady(page);
    state.dirty = false;
}

async function createPage(browser, template) {
    const page = await browser.newPage();
    try {
        await page.setViewport({ width: 1920, height: 1080 });
        observeResources(page, "http://localhost:3000/template/" + template);
        await loadPage(page);
        return page;
    } catch (error) {
        await page.close();
        throw error;
    }
}

function withPage(lockName, pageName, operation) {
    return async (...args) => {
        const lock = Lock.get(lockName);
        await lock.acquire();
        const page = global[pageName];
        try {
            if (stateFor(page).dirty) await loadPage(page);
            return await operation(page, ...args);
        } catch (error) {
            const state = page && pages.get(page);
            if (state) state.dirty = true;
            const failure = new Error("Map rendering failed on " + pageName + ": " + error.message);
            failure.name = "MapRenderError";
            failure.cause = error;
            throw failure;
        } finally {
            lock.release();
        }
    };
}

module.exports = { createPage, waitForReady, withPage };
