/* eslint-env node */

const {xxHash32} = require("js-xxhash");
const keys = require("./idk");

const connections = [];

class Endpoint {
    constructor(ws) {
        this.ws = ws;

        // TODO: Remove key on disconnect
    }

    // noinspection JSUnusedGlobalSymbols
    auth({key}) {
        if (connections.includes(key)) {
            ws.close(4000, "Already connected");
        } else if (!keys.includes(key)) {
            return {ok: false};
        } else {
            this.token = xxHash32(key + "padpadpad123");

            return {ok: true, token: this.token};
        }
    }

    verify(token) {
        return token === this.token;
    }
}

module.exports = Endpoint;
