module.exports = {
    encodeParameters: (parameters) => {
        const base64 = require('base64-utf8');
        return base64.encode(JSON.stringify(parameters));
    }
}