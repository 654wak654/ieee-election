/* eslint-env node */

const {SHA3} = require("sha3");
const db = require("./db");

const sessions = [];

class Endpoint {
    constructor(ws) {
        this.ws = ws;
    }

    auth({key}) {
        if (db.activeElectionHasKey(key)) {
            const token = this.getTokenFor(key);

            sessions.push({token, admin: false});

            return {ok: true, token};
        } else {
            return {ok: false};
        }
    }

    adminAuth({username, password}) {
        if (db.hasAdmin(username, password)) {
            const token = this.getTokenFor(password);

            sessions.push({token, admin: true});

            return {ok: true, token};
        } else {
            return {ok: false};
        }
    }

    getTokenFor(string) {
        const hash = new SHA3(256);
        hash.update(`${string}${Math.random()}`);

        return hash.digest("hex");
    }

    verify(token, type) {
        return sessions.some(session =>
            session.token === token &&
            [
                "getElections", "createElection", "updateElection", "deleteElection"
            ].includes(type) === session.admin
        );
    }

    signout(token) {
        const index = sessions.findIndex(session => session.token === token);
        if (index !== -1) {
            sessions.splice(index, 1);
        }
    }

    getElections() {
        return db.getElections();
    }

    createElection({election}) {
        return db.upsertElection(election);
    }

    updateElection({election}) {
        return db.upsertElection(election);
    }

    deleteElection({id}) {
        return db.deleteElection(id);
    }
}

module.exports = Endpoint;
