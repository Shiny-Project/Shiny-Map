class APIResponse {
    /**
     * 错误 返回
     * @param name 错误名
     * @param message 错误信息
     */
    static error(name = "unknown_error", message = "") {
        return {
            error: {
                name,
                message,
            },
        };
    }
    /**
     * 成功 返回
     * @param data 返回数据
     */
    static success(data) {
        return data;
    }
}

module.exports = APIResponse;