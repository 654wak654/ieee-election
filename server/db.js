/* eslint-disable no-console */

import Redis from "ioredis";
import { nanoid } from "nanoid";

/* DB Structure:
committees[id, order, name, visible, candidates[name, votes]]
users[id, name, key]
votes[userId, committeeId, isCast]
logs[timestamp, message]
admins[username, password]
*/

const db = {
    committees: [],
    users: [],
    votes: [],
    logs: [],
    admins: []
};
const redis = new Redis();

// Pushes item both into mem and redis
async function push(list, item) {
    db[list].push(item);

    await redis.rpush(list, JSON.stringify(item));
}

// Updates item both in mem and redis
async function set(list, index, item) {
    db[list][index] = item;

    await redis.lset(list, index, JSON.stringify(item));
}

// Overrides entire list in redis
async function update(list, lambda) {
    // Apply filter and update db
    db[list] = db[list].filter(x => lambda(x));

    // Empty redis list
    await redis.ltrim(list, 1, 0);

    // Push everything to redis back in a batch
    await redis.multi(db[list].map(item => ["rpush", list, JSON.stringify(item)])).exec();
}

// Fill values from redis
(async () => {
    for (const key in db) {
        if (Object.prototype.hasOwnProperty.call(db, key)) {
            const list = await redis.lrange(key, 0, -1);

            console.log(`Read ${list.length} items for db.${key}`);

            db[key] = list.map(x => JSON.parse(x));
        }
    }
})();

export async function log(message) {
    console.log(message);

    await push("logs", { timestamp: new Date(), message });
}

export function getUser(key) {
    return db.users.find(user => user.key === key);
}

export function hasAdmin(username, password) {
    return db.admins.some(admin => admin.username === username && admin.password === password);
}

export function getUserVotes(userId) {
    const votes = db.votes.filter(vote => vote.userId === userId);

    return db.committees.filter(committee => committee.visible && votes.some(vote => vote.committeeId === committee.id)).map(committee => {
        const response = (({ id, name, order }) => ({ id, name, order }))(committee);

        response.isCast = votes.find(vote => vote.committeeId === committee.id).isCast;
        response.candidateNames = committee.candidates.map(candidate => candidate.name);

        return response;
    });
}

export function getCommittees() {
    return db.committees;
}

export async function upsertCommittee(committee) {
    if (committee.id) {
        const index = db.committees.findIndex(c => c.id === committee.id);

        await set("committees", index, committee);
    } else {
        await push("committees", { id: nanoid(), ...committee });
    }
}

export async function deleteCommittee(id) {
    await update("votes", vote => vote.committeeId !== id);
    await update("committees", committee => committee.id !== id);
}

export function getUsers() {
    return db.users;
}

export async function upsertUser(user) {
    if (user.id) {
        const index = db.users.findIndex(u => u.id === user.id);

        await set("users", index, user);
    } else {
        await push("users", { id: nanoid(), ...user });
    }
}

export async function deleteUser(id) {
    await update("votes", vote => vote.userId !== id);
    await update("users", user => user.id !== id);
}

export function getVotes() {
    return db.votes;
}

export async function addVote(vote) {
    await push("votes", vote);
}

export async function removeVote(vote) {
    await update("votes", v => JSON.stringify(v) !== JSON.stringify(vote));
}

export async function castVote(committeeId, candidateName, userId) {
    const voteIndex = db.votes.findIndex(vote => vote.committeeId === committeeId && vote.userId === userId);

    if (voteIndex === -1 || db.votes[voteIndex].isCast) {
        return false;
    }

    // Mark vote as having been cast
    db.votes[voteIndex].isCast = true;
    await redis.lset("votes", voteIndex, JSON.stringify(db.votes[voteIndex]));

    const committeeIndex = db.committees.find(committee => committee.id === committeeId);

    // Add a vote to candidate in committee
    db.committees[committeeIndex].candidates = db.committees[committeeIndex].candidates.map(candidate => (
        { name: candidate.name, votes: candidate.votes + (candidate.name === candidateName ? 1 : 0) }
    ));
    await redis.lset("committees", committeeIndex, JSON.stringify(db.committees[committeeIndex]));

    return true;
}
