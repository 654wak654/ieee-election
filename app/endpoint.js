/* eslint-env node */

const {SHA3} = require("sha3");

const db = require("./db");

const connections = {};
const adminConnections = {};

// TODO: We're keeping tokens in both endpoint.token + connection objects. Fix that?

class Endpoint {
    constructor(ws) {
        this.ws = ws;
    }

    auth({key}) {
        if (connections[key]) {
            // TODO: Already connected shouldn't be this harsh, just send an error message
            this.ws.close(4000, "Already connected");
        } else if (!db.activeElectionHasKey(key)) {
            // TODO: Add error message this this too
            return {ok: false};
        } else {
            const token = this.getTokenFor(key);
            connections[key] = token;

            this.ws.on("close", () => connections[key] = null);

            return token;
        }
    }

    adminAuth({username, password}) {
        if (adminConnections[username]) {
            // TODO: Same as above, send proper error message
            this.ws.close(4000, "Already connected");
        } else if (!db.adminSomething(username, password)) {
            // TODO: Send error message too
            return {ok: false};
        } else {
            const token = this.getTokenFor(password); // TODO: Is just the password enough?
            adminConnections[username] = token;

            this.ws.on("close", () => adminConnections[username] = null);

            return token;
        }
    }

    getTokenFor(string) {
        const hash = new SHA3(256);
        hash.update(`${string}${Math.random()}`);

        this.token = hash.digest("hex");

        return {ok: true, token: this.token};
    }

    verify(token) {
        return token === this.token;
    }

    signout() {
        // TODO
    }
}

module.exports = Endpoint;
