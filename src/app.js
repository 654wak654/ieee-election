import "alpinejs";
import {SHA3} from "sha3";
import Tagsfield from "./tagsfield";

// noinspection JSUnusedGlobalSymbols
window.app = () => ({
    loginError: false,

    _page: null,
    _token: null, // TODO: Keep token in sessionStorage
    _queue: {},
    _queueId: 1,

    // Admin panel variables
    modalElection: null,
    elections: [
        {
            id: "0",
            name: "General election",
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
            ]
        }
    ],

    init() {
        this.$watch("page", page => this.pageInits[page](this));
        window.addEventListener("popstate", e => this.page = e.state);

        // Some initial route handing
        this.page = window.location.pathname.slice(1);

        this.ws = new WebSocket("ws://127.0.0.1:5050");

        this.ws.addEventListener("message", event => {
            const message = JSON.parse(event.data);

            // TODO: We're going to have non-queued messages too

            this._queue[message.id](message.data);

            delete this._queue[message.id];
        });
    },

    get page() {
        return this._page;
    },

    set page(page) {
        // TODO: Handle security here
        if (!this.pageInits[page]) {
            page = "login";
        }

        this._page = page;

        if (page !== history.state) {
            history.pushState(page, "", page);
        }

        // Reset some ui stuff between pages
        this.loginError = false;
    },

    pageInits: {
        "login": t => t,
        "admin-login": t => t,
        "home": t => t,
        "admin-panel": t => {
            // TODO: Fill elections
        }
    },

    sendMessage(type, data, callback) {
        this.ws.send(JSON.stringify({id: this._queueId, token: this._token, type, data}));

        this._queue[this._queueId] = callback;

        this._queueId++;
    },

    login() {
        const hash = new SHA3(256);
        hash.update(this.$refs.key.value);

        this.sendMessage("auth", {key: hash.digest("hex")}, ({ok, token}) => {
            if (ok) {
                this._token = token;
                this.page = "home";
            } else {
                this.loginError = true;
            }
        });
    },

    adminLogin() {
        const hash = new SHA3(256);
        hash.update(this.$refs.password.value);

        this.sendMessage("adminAuth", {
            username: this.$refs.username.value,
            password: hash.digest("hex")
        }, ({ok, token}) => {
            if (ok) {
                this._token = token;
                this.page = "admin-panel";
            } else {
                this.loginError = true;
            }
        });
    },

    editElection(election) {
        this.modalElection = election;

        this.$nextTick(() => {
            for (const tagsfield of document.querySelectorAll(".tagsfield")) {
                new Tagsfield(tagsfield);
            }
        });
    },

    saveElection() {
        // TODO: Send this.election to server
    },

    createCategory() {
        this.modalElection.categories.push({name: "", candidates: []});

        this.$nextTick(() => {
            new Tagsfield(document.querySelector(".tagsfield:not(.ready)"));
            document.querySelector("input[autofocus=\"autofocus\"]").focus();
        });
    },

    moveCategory(index, moveTo) {
        const categories = this.modalElection.categories;

        if (moveTo < 0 || moveTo > categories.length - 1) {
            return;
        }

        [categories[index], categories[moveTo]] = [categories[moveTo], categories[index]];
    },

    removeCategory(index) {
        this.modalElection.categories.splice(index, 1);
    }
});
