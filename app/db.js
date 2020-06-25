/* eslint-env node */

const lodashId = require("lodash-id");
const FileAsync = require("lowdb/adapters/FileAsync");
const low = require("lowdb");
const shortid = require("shortid");

const adapter = new FileAsync("db.json", {
    defaultValue: {
        // TODO: The system would start with no election at all, this is just to define the structure
        elections: [
            {
                id: "0",
                name: "General election",
                // TODO: Keep status?
                status: 0, // 0: created, 1: inprogress, 2: finished
                active: true,
                categories: [
                    {
                        name: "Alpha Committee",
                        candidates: [
                            {
                                id: 0, // TODO: Use shortid for this
                                name: "Candidate Abcc",
                                votes: 0 // TODO: Move this to a separate array called results
                            },
                            {
                                id: 1, // TODO: Use shortid for this
                                name: "Candidate Xyzz",
                                votes: 0 // TODO: Move this to a separate array called results
                            }
                        ]
                    },
                    {
                        name: "Bravo Committee",
                        candidates: []
                    }
                ],
                keys: [] // TODO: ?
            },
            {
                id: "1",
                name: "Waaat",
                status: 0, // 0: created, 1: inprogress, 2: finished
                active: false,
                categories: [],
                keys: [] // TODO: ?
            }
        ],
        admins: [
            {
                username: "ozan.egitmen",
                password: "cd73e66742b83f629e0f700b6bc3e0b4bd1f6db776b2abc93c18b0f5d055d6b8"
            }
        ],
        logs: [
            {
                timestamp: "",
                message: ""
            }
        ]
    }
});

// Make lodash-id use shortid
lodashId.createId = shortid.generate;

console.info("DB is initializing");
let db = null;

low(adapter).then(_db => {
    console.info("DB has been initialized");
    db = _db;
    db._.mixin(lodashId); // Look at that cute face
});

module.exports = {
    activeElectionHasKey(key) {
        return db.get("elections").find({active: true}).get("keys").includes(key).value();
    },

    hasAdmin(username, password) {
        return db.get("admins").some({"username": username, "password": password}).value();
    },

    getElections() {
        return db.get("elections").value();
    },

    async upsertElection(election) {
        const {id} = await db.get("elections").upsert(election).write();

        return id;
    },

    async deleteElection(id) {
        await db.get("elections").removeById(id).write();
    }
};
