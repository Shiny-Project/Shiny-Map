const APIResponse = require('../response/APIResponse');

class DataController {
    get(request, response) {
        const fs = require('fs');
        if (!request.params.path || request.params.path.startsWith('.')) {
            response.json(APIResponse.error('invalid_path', '非法路径'));
        }
        if (fs.existsSync(`../../data/${path}`)) {
            
        } else {
            response.json(APIResponse.error('file_not_find', '文件不存在'));
        }
    }
}

module.exports = new DataController();