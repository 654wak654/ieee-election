/* eslint-env node */

const fs = require("fs").promises;
const FileAsync = require("lowdb/adapters/FileAsync");
const low = require("lowdb");
const shortid = require("shortid");

/* DB Structure:
committees[id, order, name, visible, candidates[name, votes]]
users[id, name, key]
votes[userId, committeeId, isCast]
logs[timestamp, message]
admins[username, password]
*/

const db = {
    committees: null,
    users: null,
    votes: null,
    logs: null,
    admins: null
};

(async () => {
    try {
        await fs.access("./db");
    } catch {
        await fs.mkdir("./db");
    }

    for (const key in db) {
        const adapter = new FileAsync(`./db/${key}.json`, {defaultValue: []});
        db[key] = await low(adapter);
    }
})();

module.exports = {
    log(message) {
        console.log(message);

        return db.logs.push({timestamp: new Date(), message}).write();
    },

    getUser(key) {
        return db.users.find({key}).value();
    },

    hasAdmin(username, password) {
        return db.admins.some({username, password}).value();
    },

    getUserVotes(userId) {
        const votes = db.votes.filter({userId}).value();

        return db.committees.filter(committee => committee.visible && votes.map(v => v.committeeId).includes(committee.id)).map(committee => {
            const response = (({id, name, order}) => ({id, name, order}))(committee);
            response.isCast = votes.find(v => v.committeeId === committee.id).isCast;
            response.candidateNames = committee.candidates.map(candidate => candidate.name);

            return response;
        }).value();
    },

    getCommittees() {
        return db.committees.value();
    },

    upsertCommittee(committee) {
        if (committee.id) {
            return db.committees.find({id: committee.id}).assign(committee).write();
        } else {
            return db.committees.push({id: shortid.generate(), ...committee}).write();
        }
    },

    async deleteCommittee(id) {
        await db.votes.remove({committeeId: id}).write();
        await db.committees.remove({id}).write();
    },

    getUsers() {
        return db.users.value();
    },

    upsertUser(user) {
        if (user.id) {
            return db.users.find({id: user.id}).assign(user).write();
        } else {
            return db.users.push({id: shortid.generate(), ...user}).write();
        }
    },

    async deleteUser(id) {
        await db.votes.remove({userId: id}).write();
        await db.users.remove({id}).write();
    },

    getVotes() {
        return db.votes.value();
    },

    addVote(vote) {
        return db.votes.push(vote).write();
    },

    removeVote(vote) {
        return db.votes.remove(vote).write();
    },

    async castVote(committeeId, candidateName, userId) {
        if (db.votes.some({committeeId, userId, isCast: false}).value()) {
            await db.votes.find({committeeId, userId}).assign({isCast: true}).write();
            await db.committees.find({id: committeeId}).get("candidates").find({name: candidateName}).update("votes", v => v + 1).write();

            return true;
        }

        return false;
    }
};
