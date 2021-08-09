class Exception extends Error{
    constructor(errorCode, message) {
        super(message); // (1)
        this.error = {
            code: errorCode
        };
    }
}

module.exports = Exception;
