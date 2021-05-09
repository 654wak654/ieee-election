import "alpinejs";
import tippy, { createSingleton, hideAll } from "tippy.js";
import { SHA3 } from "sha3";
import Tagsfield from "./tagsfield";

// TODO: Auto reconnect
// TODO: Scrollable tables' headers shouldn't scroll

// noinspection JSUnusedGlobalSymbols
window.app = () => ({
    loginError: 0,
    modal: null,
    modalIsLoading: false,
    notification: { show: false },
    _notificationTimeout: null,

    _page: null,
    _queue: {},
    _queueId: 1,
    _subs: {},
    _allTippyInstances: [],
    _allTippySingletons: {},

    // Ballot box variables
    userVotes: [],
    currentUserVote: null,
    selectedCandidateName: "",
    _firstTimeInHomePage: true,

    // Admin panel variables
    verifyError: new Set(),
    candidateDeleteError: false,
    userSearch: "",
    modalCommittee: null,
    modalCommitteeCandidatesTemp: [],
    modalUser: null,
    committees: [],
    users: [],
    votes: [],

    init() {
        window.addEventListener("popstate", e => {
            if (e.state) {
                this.page = e.state;
            }
        });

        this.ws = new WebSocket(process.env.NODE_ENV !== "development" ? `wss://${location.host}` : "ws://localhost:5452");

        this.ws.addEventListener("open", () => {
            // Some initial route handing
            const pathname = location.pathname.slice(1);

            if (pathname.length === 0) {
                history.replaceState("login", "", "login");

                this._page = "login";
            } else {
                this.page = pathname;
            }
        });
        this.ws.addEventListener("message", event => {
            const message = JSON.parse(event.data);

            if (message.topic && this._subs[message.topic]) {
                this._subs[message.topic](this, message.data);
            } else {
                this._queue[message.id](message.data);

                delete this._queue[message.id];
            }
        });
        this.ws.addEventListener("close", () => this.onDisconnect());
        this.ws.addEventListener("error", () => this.onDisconnect());
    },

    get page() {
        return this._page;
    },

    set page(page) {
        if (!["login", "admin-login", "home", "admin-panel"].includes(page) || (this.token === null && ["home", "admin-panel"].includes(page))) {
            this.page = "login";

            return;
        }

        this._page = page;

        if (page !== history.state) {
            history.pushState(page, "", page);
        }

        this.$nextTick(() => {
            if (page === "home") {
                this.initHome();
            }
            if (page === "admin-panel") {
                this.initAdminPanel();
            }
        });

        // Reset some ui stuff between pages
        this.loginError = 0;
    },

    get token() {
        return sessionStorage.getItem("token");
    },

    set token(token) {
        sessionStorage.setItem("token", token);
    },

    initHome() {
        this.initTippy();

        this._firstTimeInHomePage = true;

        this.subTo("userVotes", (t, data) => {
            const sortedData = data.sort((a, b) => a.order - b.order);

            // eslint-disable-next-line no-unused-vars
            const selfVote = JSON.stringify(sortedData.map(({ isCast, ...x }) => x)) === JSON.stringify(t.userVotes.map(({ isCast, ...x }) => x));

            t.userVotes = sortedData;
            const index = t.getCurrentUserVoteIndex();

            if ((t.modal || t.selectedCandidateName.length > 0) && index === -1) {
                t.modal = null;

                t.showNotification("😵 Oy vermek üzere olduğun kategori kaldırıldı");
            } else if (t._firstTimeInHomePage) {
                t._firstTimeInHomePage = false;
            } else if (!selfVote) {
                t.showNotification("Oy kullanabildiğin kategoriler güncellendi", "is-info");
            }

            if (data.length > 0) {
                t.currentUserVote = sortedData[index < 0 ? 0 : index].id;
            }
        });

        this.$watch("currentUserVote", () => this.selectedCandidateName = "");
    },

    initAdminPanel() {
        this.$watch("modalCommittee", () => this.userSearch = "");

        this.subTo("committees", (t, data) => {
            t.committees = data.sort((a, b) => a.order - b.order);

            const ids = t.committees.map(c => c.id);

            for (let i = t.votes.length - 1; i >= 0; i--) {
                if (!ids.includes(t.votes[i].committeeId)) {
                    t.votes.splice(i, 1);
                }
            }

            if (t.modalCommittee !== null && t.modalCommittee.id) {
                const index = t.committees.findIndex(c => c.id === t.modalCommittee.id);

                if (index === -1) {
                    t.modalCommittee = null;

                    t.showNotification("😵 Üzerinde çalıştığın komite silindi!");
                } else {
                    t.modalCommittee = t.committees[index];

                    t.updateCandidates();
                }
            }

            t.initTippy();
        });

        this.subTo("users", (t, data) => {
            if (t.modalUser !== null && t.modalUser.id) {
                const index = data.findIndex(u => u.id === t.modalUser.id);

                if (index === -1) {
                    t.modalUser = null;

                    t.showNotification("😵 Üzerinde çalıştığın kullanıcı silindi!");
                } else {
                    t.modalUser.name = data[index].name;
                    t.modalUser.email = data[index].email;
                }
            }

            t.users = data;

            t.initTippy();
        });

        this.sendMessage("allVotes").then(votes => {
            this.votes = votes;

            this.initTippy();

            this.subTo("votes", (t, data) => {
                const index = t.votes.findIndex(v => v.userId === data.vote.userId && v.committeeId === data.vote.committeeId);

                if (data.add && index === -1) {
                    t.votes.push(data.vote);
                }

                if (data.remove && index !== -1) {
                    t.votes.splice(index, 1);
                }

                if (data.change && index !== -1) {
                    t.votes[index].isCast = true;
                }

                t.initTippy();
            });
        }).then();
    },

    onDisconnect() {
        sessionStorage.removeItem("token");

        this.showNotification("✂️ Sunucuyla bağlantı kesildi! Devam edebilmek için lütfen sayfayı yenile", "is-danger", false);
    },

    sendMessage(type, data = {}) {
        return new Promise(resolve => {
            this.ws.send(JSON.stringify({ id: this._queueId, token: this.token, type, data }));

            this._queue[this._queueId] = resolve;

            this._queueId++;
        });
    },

    subTo(channel, callback) {
        this._subs[channel] = callback;

        this.sendMessage(channel).then(response => callback(this, response));
    },

    showModal(title, text, onAccept, acceptClass = "is-danger") {
        this.modal = { title, text, onAccept, acceptClass };
    },

    async onModalAccept() {
        if (this.modalIsLoading) {
            return;
        }
        this.modalIsLoading = true;

        await this.modal.onAccept();

        this.modal = null;
        this.modalIsLoading = false;
    },

    showNotification(message, type = "is-danger", dismissible = true) {
        if (this.notification.show) {
            this.notification.show = false;

            clearTimeout(this._notificationTimeout);

            setTimeout(() => this.showNotification(message, type, dismissible), 300);

            return;
        }

        this.notification = { show: true, message, type, dismissible };

        if (dismissible) {
            this._notificationTimeout = setTimeout(() => this.notification.show = false, 3300);
        }
    },

    async login() {
        if (this.loginError === 1) {
            return;
        }

        this.loginError = 1;
        const { ok, token } = await this.sendMessage("auth", { key: this.$refs.key.value });

        if (ok) {
            this.token = token;
            this.page = "home";
        } else {
            this.loginError = 2;
        }
    },

    async adminLogin() {
        if (this.loginError === 1) {
            return;
        }

        this.loginError = 1;
        const hash = new SHA3(256);

        hash.update(this.$refs.password.value);

        const { ok, token } = await this.sendMessage("adminAuth", {
            username: this.$refs.username.value,
            password: hash.digest("hex")
        });

        if (ok) {
            this.token = token;
            this.page = "admin-panel";
        } else {
            this.loginError = 2;
        }
    },

    async signOutTo(redirectPage) {
        this.page = redirectPage;

        try {
            await this.sendMessage("signOut");
        } catch {
            // This doesn't work, but the dc handler suggest a reload anyways
            location.reload();
        } finally {
            sessionStorage.removeItem("token");
        }
    },

    initTippy(pass = false) {
        if (!pass) {
            this.$nextTick(() => this.initTippy(true));
        }

        for (let i = this._allTippyInstances.length - 1; i >= 0; i--) {
            const instance = this._allTippyInstances[i];

            if (!document.body.contains(instance.reference)) {
                const key = instance.reference.parentElement.dataset.tippySingleton;

                if (key && this._allTippySingletons[key]) {
                    this._allTippySingletons[key].singleton.destroy();
                    delete this._allTippySingletons[key];
                }

                instance.destroy();
                this._allTippyInstances.splice(i, 1);
            }
        }

        const instances = tippy("[data-tippy-content]:not(.has-tippy)", {
            animation: "perspective",
            onTrigger(instance) {
                const content = instance.reference.dataset.tippyContent;

                if (content !== instance.props.content) {
                    instance.setContent(content);
                }
            }
        });

        this._allTippyInstances.push(...instances);

        for (const instance of instances) {
            instance.reference.classList.add("has-tippy");

            const key = instance.reference.parentElement.dataset.tippySingleton;

            if (!key) {
                continue;
            }

            if (!this._allTippySingletons[key]) {
                this._allTippySingletons[key] = {
                    singleton: createSingleton([], {
                        moveTransition: "transform 0.2s ease-out",
                        overrides: ["content", "hideOnClick", "animation", "onHidden"]
                    }),
                    instances: [instance]
                };
            } else {
                this._allTippySingletons[key].instances.push(instance);
            }

            this._allTippySingletons[key].singleton.setInstances(this._allTippySingletons[key].instances);
        }
    },

    hideAllTippyInstances() {
        hideAll({ duration: 0 });
    },

    getCurrentUserVoteIndex() {
        return this.userVotes.findIndex(v => v.id === this.currentUserVote);
    },

    previousUserVote() {
        if (this.currentUserVote === this.userVotes[0].id) {
            return;
        }

        this.currentUserVote = this.userVotes[this.getCurrentUserVoteIndex() - 1].id;
    },

    nextUserVote() {
        if (this.currentUserVote === this.userVotes[this.userVotes.length - 1].id) {
            return;
        }

        this.currentUserVote = this.userVotes[this.getCurrentUserVoteIndex() + 1].id;
    },

    showVoteModal() {
        if (this.selectedCandidateName.length === 0) {
            return;
        }

        this.showModal(
            "Oy Kullan",
            `"${this.userVotes.find(v => v.id === this.currentUserVote).name}" için oyunuzu "${this.selectedCandidateName}" olarak kullanacaksınız. Emin misiniz?`,
            async () => {
                const candidateName = this.selectedCandidateName;

                this.selectedCandidateName = "";

                await this.sendMessage("castVote", { committeeId: this.currentUserVote, candidateName });
            },
            "is-success"
        );
    },

    toggleCommitteeVisible(committee) {
        committee.visible = !committee.visible;

        this.sendMessage("upsertCommittee", committee);
    },

    editCommittee(committee) {
        this.candidateDeleteError = false;
        this.modalCommitteeCandidatesTemp = [];
        this.modalCommittee = JSON.parse(JSON.stringify(committee));

        this.$nextTick(() => {
            new Tagsfield(document.querySelector(".tagsfield"), this);

            this.initTippy(true);

            if (!committee.id) {
                document.getElementById("committee-name").focus();
            }
        });
    },

    updateCandidates() {
        const tags = this.$refs.candidates.querySelectorAll("span.tag");

        this.modalCommitteeCandidatesTemp = [...tags].map(tag => {
            const candidate = this.modalCommittee.candidates.find(c => c.name === tag.innerText);

            return {
                name: tag.innerText,
                votes: candidate ? candidate.votes : 0
            };
        });
    },

    async saveCommittee() {
        if (this.modalIsLoading || !this.verifyInputs("committee-name")) {
            return;
        }

        if (this.modalCommitteeCandidatesTemp.length < 2) {
            this.verifyError.add("committee-candidates");

            return;
        } else {
            this.verifyError.delete("committee-candidates");
        }

        this.modalIsLoading = true;

        this.modalCommittee.candidates = this.modalCommitteeCandidatesTemp;
        const index = this.committees.indexOf(this.modalCommittee);

        if (index === -1) {
            if (this.committees.length === 0) {
                this.modalCommittee.order = 0;
            } else {
                this.modalCommittee.order = this.committees[this.committees.length - 1].order + 1;
            }
        }

        await this.sendMessage("upsertCommittee", this.modalCommittee);

        this.modalCommittee = null;
        this.modalIsLoading = false;
    },

    modalCommitteeSum() {
        return this.votes.reduce((sum, vote) => vote.committeeId === this.modalCommittee.id ? sum + 1 : sum, 0);
    },

    emptyVotesCount() {
        return this.modalCommitteeSum() - this.modalCommittee.candidates.reduce((a, b) => a + b.votes, 0);
    },

    candidateVotes(candidate) {
        return `(${candidate.votes} / ${this.modalCommitteeSum()})`;
    },

    candidatePercent(candidate) {
        const sum = this.modalCommitteeSum();

        return `%${sum > 0 ? Math.round((candidate.votes / sum) * 100) : 0}`;
    },

    unusedVotes() {
        return `(${this.emptyVotesCount()} / ${this.modalCommitteeSum()})`;
    },

    unusedPercent() {
        const sum = this.modalCommitteeSum();

        return `%${sum > 0 ? Math.round((this.emptyVotesCount() / sum) * 100) : 0}`;
    },

    moveCommitteeUp(committee) {
        if (committee.order === this.committees[0].order) {
            return;
        }

        let order = committee.order - 1;

        while (order >= this.committees[0].order) {
            const swapCommittee = this.committees.find(c => c.order === order);

            if (swapCommittee) {
                swapCommittee.order = committee.order;

                this.sendMessage("upsertCommittee", swapCommittee);

                break;
            }

            order--;
        }

        committee.order = order;

        this.sendMessage("upsertCommittee", committee);
    },

    moveCommitteeDown(committee) {
        if (committee.order === this.committees[this.committees.length - 1].order) {
            return;
        }

        let order = committee.order + 1;

        while (order <= this.committees[this.committees.length - 1].order) {
            const swapCommittee = this.committees.find(c => c.order === order);

            if (swapCommittee) {
                swapCommittee.order = committee.order;

                this.sendMessage("upsertCommittee", swapCommittee);

                break;
            }

            order++;
        }

        committee.order = order;

        this.sendMessage("upsertCommittee", committee);
    },

    deleteCommittee(committee) {
        this.showModal(
            "Komiteyi Sil",
            `"${committee.name}" isimli komiteyi silmek istediğinize emin misiniz?`,
            () => this.sendMessage("deleteCommittee", { id: committee.id })
        );
    },

    editUser(user) {
        this.modalUser = JSON.parse(JSON.stringify(user));

        if (!user.id) {
            this.sendMessage("generateKey").then(key => this.modalUser.key = key);
        }

        this.$nextTick(() => {
            this.initTippy(true);

            if (!user.id) {
                document.getElementById("user-name").focus();
            }
        });
    },

    verifyInputs(...inputs) {
        this.verifyError = new Set();

        for (const input of inputs) {
            const element = document.getElementById(input);
            const regex = new RegExp(element.pattern, "u");

            if (!regex.test(element.value)) {
                this.verifyError.add(input);
            }
        }

        return this.verifyError.size === 0;
    },

    async saveUser() {
        if (this.modalIsLoading || !this.verifyInputs("user-name", "user-email")) {
            return;
        }
        this.modalIsLoading = true;

        await this.sendMessage("upsertUser", this.modalUser);

        this.modalUser = null;
        this.modalIsLoading = false;
    },

    copyKeyToClipboard(user) {
        this.showNotification(`"${user.name}" isimli kullanıcının anahtarı panoya kopyalandı`, "is-info");

        return navigator.clipboard.writeText(user.key);
    },

    async mailKeyToUser(user, skipModal = false) {
        if (!skipModal && user.emailSent) {
            return this.showModal(
                "Anahtar Zaten Yollanmış",
                `"${user.name}" isimli kullanıcıya zaten anahtar yollanmış görünüyor. Tekrar mail yollamak istediğinize emin misiniz?`,
                () => this.mailKeyToUser(user, true),
                "is-link"
            );
        }

        await this.sendMessage("mailKeyToUser", user);
        this.showNotification(`"${user.name}" isimli kullanıcının anahtarı ${user.email} adresine yollandı`, "is-info");
    },

    deleteUser(user) {
        if (this.votedAny(user)) {
            return;
        }

        this.showModal(
            "Kullanıcıyı Sil",
            `"${user.name}" isimli kullanıcıyı silmek istediğinize emin misiniz?`,
            () => this.sendMessage("deleteUser", { id: user.id })
        );
    },

    votableCommittees() {
        return this.votes.filter(vote => vote.userId === this.modalUser.id).map(vote => this.committees.find(committee => committee.id === vote.committeeId));
    },

    // 0: can't vote, 1: can vote, 2: has cast vote, 3: no committee
    voteStatus(user, committeeId = this.modalCommittee.id) {
        if (!committeeId) {
            return 3;
        }

        const vote = this.votes.find(v => v.userId === user.id && v.committeeId === committeeId);

        if (vote) {
            return 1 + vote.isCast;
        } else {
            return 0;
        }
    },

    // Like voteStatus but checks for all committees
    votedAny(user) {
        return this.votes.some(vote => vote.userId === user.id && vote.isCast);
    },

    toggleVote(user) {
        const current = this.voteStatus(user);
        const vote = { userId: user.id, committeeId: this.modalCommittee.id, isCast: false };

        if (current === 0) {
            this.votes.push(vote);
            this.sendMessage("addVote", vote);
        } else if (current === 1) {
            const index = this.votes.findIndex(v => v.userId === vote.userId && v.committeeId === vote.committeeId);

            if (index !== -1) {
                this.votes.splice(index, 1);
                this.sendMessage("removeVote", vote);
            }
        }
    }
});
