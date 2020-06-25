import "alpinejs";
import {SHA3} from "sha3";
import Tagsfield from "./tagsfield";

// noinspection JSUnusedGlobalSymbols
window.app = () => ({
    loginError: false,

    _page: null,
    _queue: {},
    _queueId: 1,

    // Admin panel variables
    modalElection: null,
    modal: null,
    savingElection: false,
    elections: [],

    init() {
        this.ws = new WebSocket("ws://127.0.0.1:5050");

        this.ws.addEventListener("open", () => {
            // TODO: Don't show page until this event

            this.$watch("page", page => this.pageInits[page](this));
            window.addEventListener("popstate", e => this.page = e.state);

            // Some initial route handing
            this.page = window.location.pathname.slice(1);
        });
        this.ws.addEventListener("message", event => {
            const message = JSON.parse(event.data);

            // TODO: We're going to have non-queued messages too

            this._queue[message.id](message.data);

            delete this._queue[message.id];
        });
        this.ws.addEventListener("close", event => {
            console.error(event);
        });
        this.ws.addEventListener("error", event => {
            console.error(event);
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

    get token() {
        return sessionStorage.getItem("token");
    },

    set token(token) {
        sessionStorage.setItem("token", token);
    },

    pageInits: {
        "login": t => t,
        "admin-login": t => t,
        "home": t => t,
        "admin-panel": async t => {
            t.elections = await t.sendMessage("getElections");
        }
    },

    sendMessage(type, data = {}) {
        return new Promise(resolve => {
            // noinspection JSUnresolvedVariable
            this.ws.send(JSON.stringify({id: this._queueId, token: this.token, type, data}));

            this._queue[this._queueId] = resolve;

            this._queueId++;
        });
    },

    showModal(title, text, onAccept = null) {
        this.modal = {title, text, onAccept};
    },

    async login() {
        const hash = new SHA3(256);
        hash.update(this.$refs.key.value);

        const {ok, token} = await this.sendMessage("auth", {key: hash.digest("hex")});

        if (ok) {
            this.token = token;
            this.page = "home";
        } else {
            this.loginError = true;
        }
    },

    async adminLogin() {
        const hash = new SHA3(256);
        hash.update(this.$refs.password.value);

        const {ok, token} = await this.sendMessage("adminAuth", {
            username: this.$refs.username.value,
            password: hash.digest("hex")
        });

        if (ok) {
            this.token = token;
            this.page = "admin-panel";
        } else {
            this.loginError = true;
        }
    },

    manageElection(election) {
        // TODO
    },

    editElection(election) {
        this.modalElection = election;

        this.$nextTick(() => {
            for (const tagsfield of document.querySelectorAll(".tagsfield")) {
                new Tagsfield(tagsfield);
            }
        });
    },

    async saveElection() {
        if (this.savingElection) {
            return;
        }
        this.savingElection = true;

        const index = this.elections.indexOf(this.modalElection);
        if (index === -1) {
            this.modalElection.id = await this.sendMessage("createElection", this.modalElection);
            this.elections.push(this.modalElection);
        } else {
            await this.sendMessage("updateElection", this.modalElection);
        }

        this.modalElection = null;
        this.savingElection = false;
    },

    deleteElection(election) {
        this.showModal("Seçimi Sil", `"${election.name}" isimli seçimi silmek istediğinize emin misiniz?`, () => {
            // noinspection JSUnresolvedVariable
            this.sendMessage("deleteElection", {id: election.id});

            const index = this.elections.indexOf(election);
            if (index !== -1) {
                this.elections.splice(index, 1);
            }
        });
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
