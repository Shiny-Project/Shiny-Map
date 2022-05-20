class Utils {
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
