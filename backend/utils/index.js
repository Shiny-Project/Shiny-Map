class Utils {
    static encodeParameters(parameters) {
        const base64 = require("base64-utf8");
        return base64.encode(JSON.stringify(parameters));
    }
    static getTimestamp() {
        const time = new Date();
        return `${time.getFullYear()}-${
            time.getMonth() + 1
        }-${time.getDate()}-${time.getHours()}${time.getMinutes()}${time.getSeconds()}${time.getMilliseconds()}`;
    }
    static sleep(delay) {
        return new Promise((resolve) => setTimeout(resolve, delay));
    }
}

module.exports = Utils;
