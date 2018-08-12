import base64 from 'base64-utf8';
module.exports = {
    getParameters: () => {
        const parameters = {};
        const urlHash = base64.decode(location.hash.slice(1));
        try {
            const payload = JSON.parse(urlHash);
            if (typeof payload === 'object') {
                return {
                    ...parameters,
                    ...payload
                }
            } else {
                return parameters;
            }
        } catch (e) {
            return parameters;
        }
    }
};