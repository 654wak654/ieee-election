/* eslint-env node */

const FileAsync = require("lowdb/adapters/FileAsync");
const low = require("lowdb");
const shortid = require("shortid");

const adapter = new FileAsync("db.json", {
    defaultValue: {
        committees: [],
        users: [],
        votes: [],
        logs: [],
        admins: [
            {
                username: "ozan.egitmen",
                password: "cd73e66742b83f629e0f700b6bc3e0b4bd1f6db776b2abc93c18b0f5d055d6b8"
            }
        ]
    }
});

/* DB Structure:
committees[order, name, visible, candidates[name, votes]]
users[name, key]
votes[userId, committeeId, isCast]
logs[timestamp, message]
admins[username, password]
*/

console.info("DB is initializing");
let db = null;

low(adapter).then(_db => {
    console.info("DB has been initialized");
    db = _db;
});

module.exports = {
    getUser(key) {
        return db.get("users").find({key}).value();
    },

    hasAdmin(username, password) {
        return db.get("admins").some({username, password}).value();
    },

    getUserVotes(userId) {
        const votes = db.get("votes").filter({userId}).value();

        return db.get("committees").filter(committee => committee.visible && votes.map(v => v.committeeId).includes(committee.id)).map(committee => {
            const response = (({id, name, order}) => ({id, name, order}))(committee);

            if (votes.find(v => v.committeeId === committee.id).isCast) {
                response.isCast = true;
            } else {
                response.candidateNames = committee.candidates.map(candidate => candidate.name);
            }

            return response;
        }).value();
    },

    getCommittees() {
        return db.get("committees").value();
    },

    upsertCommittee(committee) {
        if (committee.id) {
            return db.get("committees").find({id: committee.id}).assign(committee).write();
        } else {
            return db.get("committees").push({id: shortid.generate(), ...committee}).write();
        }
    },

    async deleteCommittee(id) {
        await db.get("votes").remove({committeeId: id}).write();
        await db.get("committees").remove({id}).write();
    },

    getUsers() {
        return db.get("users").value();
    },

    upsertUser(user) {
        if (user.id) {
            return db.get("users").find({id: user.id}).assign(user).write();
        } else {
            return db.get("users").push({id: shortid.generate(), ...user}).write();
        }
    },

    async deleteUser(id) {
        await db.get("votes").remove({userId: id}).write();
        await db.get("users").remove({id}).write();
    },

    getVotes() {
        return db.get("votes").value();
    },

    addVote(vote) {
        return db.get("votes").push(vote).write();
    },

    removeVote(vote) {
        return db.get("votes").remove(vote).write();
    },

    async castVote(committeeId, candidateName, userId) {
        if (db.get("votes").some({committeeId, userId, isCast: false}).value()) {
            await db.get("votes").find({committeeId, userId}).assign({isCast: true}).write();
            await db.get("committees").find({id: committeeId}).get("candidates").find({name: candidateName}).update("votes", v => v + 1).write();

            return true;
        }

        return false;
    }
};
