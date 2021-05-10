/* eslint-disable class-methods-use-this */

import { readFile } from "fs/promises";
import { SHA3 } from "sha3";
import got from "got";
import * as db from "./db.js";

const sessions = [];
const subs = {
    committees: [],
    users: [],
    votes: [],
    userVotes: [],
    mailUsage: []
};

const adminMethods = [
    "committees", "upsertCommittee", "deleteCommittee",
    "users", "upsertUser", "deleteUser", "generateKey", "mailKeyToUser",
    "votes", "addVote", "removeVote", "allVotes",
    "mailUsage"
];

let mailUsage = 0;
let htmlTemplate = null;

(async () => {
    // Set initial count
    mailUsage = await getMailUsage();

    // Read it here once so we don't have to re-read it on every mail
    htmlTemplate = await readFile("./server/mail-templates/key-mail.html", { encoding: "utf-8" });
})();

function getTokenFor(string) {
    const hash = new SHA3(256);

    hash.update(`${string}${Math.random()}`);

    return hash.digest("hex");
}

function verify(token, type) {
    return sessions.some(session => session.token === token && adminMethods.includes(type) === session.admin);
}

function propagateCommitteesAndUserVotes() {
    const data = db.getCommittees();

    for (const sub of subs.committees) {
        sub.send(JSON.stringify({ topic: "committees", data }));
    }

    propagateUserVotes();
}

function propagateUsers() {
    const data = db.getUsers();

    for (const sub of subs.users) {
        sub.send(JSON.stringify({ topic: "users", data }));
    }
}

function propagateUserVotes() {
    for (const { sub, userId, last } of subs.userVotes) {
        const data = db.getUserVotes(userId);
        const dataStringified = JSON.stringify(data);

        if (last === dataStringified) {
            continue;
        }

        subs.userVotes.find(vote => vote.userId === userId).last = dataStringified;

        sub.send(JSON.stringify({ topic: "userVotes", data }));
    }
}

function sendKeyMail(user) {
    const htmlMessage = htmlTemplate
        .replace("$EMAIL_TITLE", process.env.EMAIL_SUBJECT)
        .replace("$USER_NAME", user.name)
        .replace("$USER_KEY", user.key);

    return got.post("https://api.mailjet.com/v3.1/send", {
        username: process.env.MAILJET_API_KEY,
        password: process.env.MAILJET_SECRET_KEY,
        headers: {
            "Content-Type": "application/json"
        },
        json: {
            Messages: [
                {
                    From: {
                        Email: process.env.EMAIL_SENDER_MAIL,
                        Name: process.env.EMAIL_SENDER_NAME
                    },
                    To: [
                        {
                            Email: user.email,
                            Name: user.name
                        }
                    ],
                    Subject: "IEEE THKÜ Seçim Anahtarı",
                    HTMLPart: htmlMessage
                }
            ]
        }
    });
}

async function getMailUsage() {
    const { body } = await got("https://api.mailjet.com/v3/REST/statcounters", {
        username: process.env.MAILJET_API_KEY,
        password: process.env.MAILJET_SECRET_KEY,
        responseType: "json",
        searchParams: {
            CounterSource: "APIKey",
            CounterResolution: "Day",
            CounterTiming: "Message",
            FromTS: new Date().toISOString()
        }
    });

    return body.Count === 0 ? 0 : body.Data[0].MessageSentCount;
}

class Endpoint {
    constructor(ws) {
        this.ws = ws;

        this.ws.addEventListener("close", this._onDisconnect);
        this.ws.addEventListener("error", this._onDisconnect);
    }

    _onDisconnect() {
        for (const topic of [subs.committees, subs.users, subs.votes, subs.mailUsage]) {
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

    auth({ key }) {
        const user = db.getUser(key);

        if (user) {
            const token = getTokenFor(key);

            // Remove duplicate sessions
            const index = sessions.findIndex(s => s.userId === user.id);

            if (index !== -1) {
                sessions.splice(index, 1);
            }

            sessions.push({ token, admin: false, userId: user.id });

            return { ok: true, token };
        } else {
            return { ok: false };
        }
    }

    adminAuth({ username, password }) {
        if (db.hasAdmin(username, password)) {
            const token = getTokenFor(password);

            sessions.push({ token, admin: true });

            return { ok: true, token };
        } else {
            return { ok: false };
        }
    }

    signOut(_, token) {
        const index = sessions.findIndex(s => s.token === token);

        if (index !== -1) {
            sessions.splice(index, 1);
        }
    }

    userVotes(_, token) {
        const { userId } = sessions.find(s => s.token === token);

        const index = subs.userVotes.findIndex(vote => vote.userId === userId);

        if (index !== -1) {
            subs.userVotes.splice(index, 1);
        }

        subs.userVotes.push({ sub: this.ws, userId, last: "" });

        return db.getUserVotes(userId);
    }

    committees() {
        subs.committees.push(this.ws);

        return db.getCommittees();
    }

    async upsertCommittee(committee) {
        await db.upsertCommittee(committee);

        propagateCommitteesAndUserVotes();

        return {};
    }

    async deleteCommittee({ id }) {
        await db.deleteCommittee(id);

        propagateCommitteesAndUserVotes();

        return {};
    }

    users() {
        subs.users.push(this.ws);

        return db.getUsers();
    }

    async upsertUser(user) {
        await db.upsertUser(user);

        propagateUsers();

        return {};
    }

    async deleteUser({ id }) {
        await db.deleteUser(id);

        propagateUsers();

        return {};
    }

    generateKey() {
        const keyParts = [];

        for (let i = 0; i < 3; i++) {
            const index = Math.floor(Math.random() * 57);

            keyParts.push(getTokenFor(Math.random()).slice(index, index + 8));
        }

        return keyParts.join("-").toUpperCase();
    }

    async mailKeyToUser(user) {
        // Mark emailSent
        await db.upsertUser({ ...user, emailSent: true });

        propagateUsers();

        await sendKeyMail(user);

        const data = await getMailUsage();

        if (data !== mailUsage) {
            mailUsage = data;

            for (const sub of subs.mailUsage) {
                sub.send(JSON.stringify({ topic: "mailUsage", data }));
            }
        }

        return {};
    }

    votes() {
        subs.votes.push(this.ws);

        return { vote: { userId: null, committeeId: null } };
    }

    async addVote(vote) {
        await db.addVote(vote);

        for (const sub of subs.votes) {
            if (sub !== this.ws) {
                sub.send(JSON.stringify({ topic: "votes", data: { add: true, vote } }));
            }
        }

        propagateUserVotes();
    }

    async removeVote(vote) {
        await db.removeVote(vote);

        for (const sub of subs.votes) {
            if (sub !== this.ws) {
                sub.send(JSON.stringify({ topic: "votes", data: { remove: true, vote } }));
            }
        }

        propagateUserVotes();
    }

    allVotes() {
        return db.getVotes();
    }

    mailUsage() {
        subs.mailUsage.push(this.ws);

        return mailUsage;
    }

    async castVote({ committeeId, candidateName }, token) {
        const { userId } = sessions.find(s => s.token === token);
        const castSuccess = await db.castVote(committeeId, candidateName, userId);

        if (castSuccess) {
            await db.log(`Vote cast for ${candidateName} in ${committeeId}`);

            for (const sub of subs.votes) {
                sub.send(JSON.stringify({ topic: "votes", data: { change: true, vote: { committeeId, userId } } }));
            }

            propagateCommitteesAndUserVotes();
        }

        return {};
    }
}

export { Endpoint, verify };
