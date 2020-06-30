/* eslint-env node */

const {SHA3} = require("sha3");
const db = require("./db");

const sessions = [];
const subs = {
    committees: [],
    users: [],
    votes: [],
    userVotes: []
};

class Endpoint {
    constructor(ws) {
        this.ws = ws;

        this.ws.addEventListener("close", this._onDisconnect);
        this.ws.addEventListener("error", this._onDisconnect);
    }

    _onDisconnect() {
        for (const topic of [subs.committees, subs.users, subs.votes]) {
            const index = topic.indexOf(this.ws);

            if (index !== -1) {
                topic.splice(index, 1);
            }
        }

        const index = subs.userVotes.findIndex(vote => vote.sub === this.ws);

        if (index !== -1) {
            subs.userVotes.splice(index, 1);
        }
    }

    _getTokenFor(string) {
        const hash = new SHA3(256);
        hash.update(`${string}${Math.random()}`);

        return hash.digest("hex");
    }

    _verify(token, type) {
        return sessions.some(session =>
            session.token === token &&
            [
                "committees", "upsertCommittee", "deleteCommittee",
                "users", "upsertUser", "deleteUser", "generateKey",
                "votes", "addVote", "removeVote", "allVotes"
            ].includes(type) === session.admin
        );
    }

    auth({key}) {
        const user = db.getUser(key);

        if (user) {
            const token = this._getTokenFor(key);

            // Remove duplicate sessions
            const index = sessions.findIndex(s => s.userId === user.id);
            if (index !== -1) {
                sessions.splice(index, 1);
            }

            sessions.push({token, admin: false, userId: user.id});

            return {ok: true, token};
        } else {
            return {ok: false};
        }
    }

    adminAuth({username, password}) {
        if (db.hasAdmin(username, password)) {
            const token = this._getTokenFor(password);

            sessions.push({token, admin: true});

            return {ok: true, token};
        } else {
            return {ok: false};
        }
    }

    signOut(_, token) {
        const index = sessions.findIndex(s => s.token === token);
        if (index !== -1) {
            sessions.splice(index, 1);
        }
    }

    userVotes(_, token) {
        const userId = sessions.find(s => s.token === token).userId;

        subs.userVotes.push({sub: this.ws, userId, last: ""});

        return db.getUserVotes(userId);
    }

    committees() {
        subs.committees.push(this.ws);

        return db.getCommittees();
    }

    async upsertCommittee(committee) {
        await db.upsertCommittee(committee);

        this.propagateCommitteesAndUserVotes();

        return {};
    }

    async deleteCommittee({id}) {
        await db.deleteCommittee(id);

        this.propagateCommitteesAndUserVotes();
    }

    propagateCommitteesAndUserVotes() {
        for (const sub of subs.committees) {
            sub.send(JSON.stringify({topic: "committees", data: db.getCommittees()}));
        }

        this.propagateUserVotes();
    }

    users() {
        subs.users.push(this.ws);

        return db.getUsers();
    }

    async upsertUser(user) {
        await db.upsertUser(user);

        for (const sub of subs.users) {
            sub.send(JSON.stringify({topic: "users", data: db.getUsers()}));
        }

        return {};
    }

    async deleteUser({id}) {
        await db.deleteUser(id);

        for (const sub of subs.users) {
            sub.send(JSON.stringify({topic: "users", data: db.getUsers()}));
        }
    }

    generateKey() {
        let keyParts = [];
        for (let i = 0; i < 3; i++) {
            const index = Math.floor(Math.random() * 57);
            keyParts.push(this._getTokenFor(Math.random()).slice(index, index + 8));
        }

        return keyParts.join("-").toUpperCase();
    }

    votes() {
        subs.votes.push(this.ws);

        return {vote: {userId: null, committeeId: null}};
    }

    async addVote(vote) {
        await db.addVote(vote);

        for (const sub of subs.votes) {
            if (sub !== this.ws) {
                sub.send(JSON.stringify({topic: "votes", data: {add: true, vote}}));
            }
        }

        this.propagateUserVotes();
    }

    async removeVote(vote) {
        await db.removeVote(vote);

        for (const sub of subs.votes) {
            if (sub !== this.ws) {
                sub.send(JSON.stringify({topic: "votes", data: {remove: true, vote}}));
            }
        }

        this.propagateUserVotes();
    }

    propagateUserVotes() {
        for (const {sub, userId, last} of subs.userVotes) {
            const data = db.getUserVotes(userId);
            const dataStringified = JSON.stringify(data);

            if (last === dataStringified) {
                continue;
            }

            subs.userVotes.find(vote => vote.userId === userId).last = dataStringified;

            sub.send(JSON.stringify({topic: "userVotes", data}));
        }
    }

    allVotes() {
        return db.getVotes();
    }

    async castVote({committeeId, candidateName}, token) {
        const userId = sessions.find(s => s.token === token).userId;

        if (await db.castVote(committeeId, candidateName, userId)) {
            for (const sub of subs.votes) {
                sub.send(JSON.stringify({topic: "votes", data: {change: true, vote: {committeeId, userId}}}));
            }

            this.propagateCommitteesAndUserVotes();
        }
    }
}

module.exports = Endpoint;
