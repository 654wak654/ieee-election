/* eslint-env node */

const FileAsync = require("lowdb/adapters/FileAsync");
const low = require("lowdb");
const shortid = require("shortid");

const adapter = new FileAsync("db.json", {
    defaultValue: {
        // TODO: The system would start with no election at all, this is just to define the structure
        elections: [
            {
                id: 0, // TODO: Use shortid for this
                name: "IEEE THKÜ Test Seçimi",
                status: 0, // 0: created, 1: inprogress, 2: finished
                active: true,
                categories: [
                    {
                        name: "XYZ committee",
                        candidates: [
                            {
                                id: 0, // TODO: Use shortid for this
                                name: "Candidate Abc",
                                votes: 0 // TODO: Move this to a separate array called results
                            }
                        ]
                    }
                ],
                // TODO: Need a way to check if key voted in category
                // TODO: Don't keep key on db, keep hash of key on db
                keys: [
                    "26a07bd8860a7832f6c35f344a7f14b353d36b4b74e5d40fd4ad892349280985"
                ]
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

console.info("DB is initializing");
let db = null;

low(adapter).then(_db => {
    console.info("DB has been initialized");
    db = _db;
});

module.exports = {
    // TODO: Writes will be async
    activeElectionHasKey(key) {
        return db.get("elections").find({active: true}).get("keys").includes(key).value();
    },

    adminSomething(username, password) {
        return db.get("admins").some({"username": username, "password": password}).value();
    }
};
