import "alpinejs";
import tippy from "tippy.js";
import {SHA3} from "sha3";
import Tagsfield from "./tagsfield";

// TODO: Auto reconnect

// noinspection JSUnusedGlobalSymbols
window.app = () => ({
    loginError: 0,
    modal: null,
    modalIsLoading: false,
    notification: {show: false},

    _page: null,
    _queue: {},
    _queueId: 1,
    _subs: {},

    // Ballot box variables
    userVotes: [],
    currentUserVote: null,
    selectedCandidateName: "",
    firstTimeInHomePage: true,

    // Admin panel variables
    modalCommittee: null,
    modalCommitteeCandidatesTemp: [],
    modalUser: null,
    committees: [],
    users: [],
    votes: [],

    candidateDeleteError: false,
    userSearch: "",

    init() {
        this.$watch("page", page => this.pageInits[page](this));
        window.addEventListener("popstate", e => {
            if (e.state) {
                this.page = e.state;
            }
        });

        // TODO: Change this with parcel build-time if else check
        this.ws = new WebSocket(`ws://${location.hostname}:5452`);

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
                this._subs[message.topic](message.data);
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
        if (!this.pageInits[page] || (this.token === null && ["home", "admin-panel"].includes(page))) {
            page = "login";
        }

        this._page = page;

        if (page !== history.state) {
            history.pushState(page, "", page);
        }

        // Reset some ui stuff between pages
        this.loginError = 0;
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
        "home": t => {
            t.initTippy();

            t.firstTimeInHomePage = true;

            // noinspection JSIgnoredPromiseFromCall
            t.subTo("userVotes", data => {
                const sortedData = [...data].sort((a, b) => a.order - b.order);

                t.userVotes = sortedData;
                const index = t.getCurrentUserVoteIndex();

                if (data.length > 0) {
                    t.currentUserVote = sortedData[index < 0 ? 0 : index].id;
                }

                if (t.modal && index === -1) {
                    t.modal = null;

                    t.showNotification("😵 Oy vermek üzere olduğun komite kaldırıldı");
                } else if (t.firstTimeInHomePage) {
                    t.firstTimeInHomePage = false;
                } else {
                    t.showNotification("Oy kullanabildiğin komiteler güncellendi", "info");
                }
            });

            t.$watch("currentUserVote", () => t.selectedCandidateName = "");
        },
        "admin-panel": t => {
            // noinspection JSIgnoredPromiseFromCall
            t.subTo("committees", data => {
                t.committees = [...data].sort((a, b) => a.order - b.order);

                if (t.modalCommittee !== null && t.modalCommittee.id) {
                    const index = t.committees.findIndex(c => c.id === t.modalCommittee.id);

                    if (index === -1) {
                        t.modalCommittee = null;

                        t.showNotification("😵 Üzerinde çalıştığın komite silindi!");
                    } else {
                        t.modalCommittee = t.committees[index];
                    }
                }

                t.initTippy();
            });

            // noinspection JSIgnoredPromiseFromCall
            t.subTo("users", data => {
                if (t.modalUser !== null && t.modalUser.id) {
                    const index = data.findIndex(u => u.id === t.modalUser.id);

                    if (index === -1) {
                        t.modalUser = null;

                        t.showNotification("😵 Üzerinde çalıştığın kullanıcı silindi!");
                    } else {
                        t.modalUser.name = data[index].name;
                    }
                }

                t.users = data;

                t.initTippy();
            });

            t.sendMessage("allVotes").then(votes => {
                t.votes = votes;

                t.initTippy();

                // noinspection JSIgnoredPromiseFromCall
                t.subTo("votes", data => {
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
        }
    },

    onDisconnect() {
        this.showNotification("✂️ Sunucuyla bağlantı kesildi! Devam edebilmek için lütfen tekrar giriş yap", "danger", 0, false);
    },

    sendMessage(type, data = {}) {
        return new Promise(resolve => {
            // noinspection JSUnresolvedVariable
            this.ws.send(JSON.stringify({id: this._queueId, token: this.token, type, data}));

            this._queue[this._queueId] = resolve;

            this._queueId++;
        });
    },

    async subTo(type, callback) {
        this._subs[type] = callback;

        const response = await this.sendMessage(type);
        callback(response);
    },

    showModal(title, text, onAccept, acceptClass = "is-danger") {
        this.modal = {title, text, onAccept, acceptClass};
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

    showNotification(message, type = "danger", time = 3300, dismissible = true) {
        if (this.notification.show) {
            this.notification.show = false;

            setTimeout(() => this.showNotification(message, type, time, dismissible), 300);
        }

        this.notification = {show: true, message, type, dismissible};

        if (time > 0) {
            setTimeout(() => this.notification.show = false, time);
        }
    },

    async login() {
        if (this.loginError === 1) {
            return;
        }

        this.loginError = 1;
        const {ok, token} = await this.sendMessage("auth", {key: this.$refs.key.value});

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

        const {ok, token} = await this.sendMessage("adminAuth", {
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
        } catch (e) {
            // This doesn't work, but the dc handler suggest a reload anyways
            location.reload();
        } finally {
            this.token = null;
        }
    },

    initTippy(pass = false) {
        if (!pass) {
            this.$nextTick(() => this.initTippy(true));
        }

        // noinspection JSUnusedGlobalSymbols
        const instances = tippy("[data-tippy-content]:not(.has-tippy)", {
            animation: "perspective",
            onTrigger(instance) {
                const content = instance.reference.dataset.tippyContent;
                if (content !== instance.props.content) {
                    instance.setContent(content);
                }

                if (!instance.props.hideOnClick) {
                    instance.reference.addEventListener("click", () => {
                        instance.setContent("Kopyalandı!");
                    }, {once: true});
                }
            },
            onHidden(instance) {
                if (!instance.props.hideOnClick) {
                    instance.setContent("Anahtarı Kopyala");
                }
            }
        });

        instances.forEach(i => i.reference.classList.add("has-tippy"));

        document.querySelectorAll(".has-fixed-size-small,.has-fixed-size-big").forEach(div => {
            div.addEventListener("scroll", () => instances.forEach(i => i.hide()));
        });
    },

    getCurrentUserVoteIndex() {
        return this.userVotes.findIndex(v => v.id === this.currentUserVote);
    },

    previousUserVote() {
        if (this.currentUserVote === this.userVotes[0].id) {
            return;
        }

        const index = this.getCurrentUserVoteIndex();
        this.currentUserVote = this.userVotes[index - 1].id;
    },

    nextUserVote() {
        if (this.currentUserVote === this.userVotes[this.userVotes.length - 1].id) {
            return;
        }

        const index = this.getCurrentUserVoteIndex();
        this.currentUserVote = this.userVotes[index + 1].id;
    },

    showVoteModal() {
        if (this.selectedCandidateName.length === 0) {
            return;
        }

        this.showModal(
            "Oy Kullan",
            `"${this.userVotes.find(v => v.id === this.currentUserVote).name}" için oyunuzu "${this.selectedCandidateName}" isimli adaya kullanacaksınız. Emin misiniz?`,
            () => this.sendMessage("castVote", {committeeId: this.currentUserVote, candidateName: this.selectedCandidateName}),
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
        this.modalCommittee = committee;

        this.$nextTick(() => {
            new Tagsfield(document.querySelector(".tagsfield"), this);

            this.initTippy();
        });
    },

    updateCandidates() {
        const tags = this.$refs.candidates.querySelectorAll("span.tag");

        this.modalCommitteeCandidatesTemp = Array.from(tags, tag => {
            const candidate = this.modalCommittee.candidates.find(c => c.name === tag.innerText);

            return {
                name: tag.innerText,
                votes: candidate ? candidate.votes : 0
            };
        });
    },

    async saveCommittee() {
        if (this.modalIsLoading) {
            return;
        }
        this.modalIsLoading = true;

        this.modalCommittee.candidates = this.modalCommitteeCandidatesTemp;
        const index = this.committees.indexOf(this.modalCommittee);

        if (index === -1) {
            if (this.committees.length === 0) {
                this.modalCommittee.order = 0;
            } else {
                this.modalCommittee.order = this.committees[this.committees.length - 1] + 1;
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
            () => this.sendMessage("deleteCommittee", {id: committee.id})
        );
    },

    editUser(user) {
        this.modalUser = user;

        if (!user.id) {
            this.sendMessage("generateKey").then(key => this.modalUser.key = key);
        }

        this.initTippy();
    },

    async saveUser() {
        if (this.modalIsLoading) {
            return;
        }
        this.modalIsLoading = true;

        await this.sendMessage("upsertUser", this.modalUser);

        this.modalUser = null;
        this.modalIsLoading = false;
    },

    copyKeyToClipboard(user) {
        return navigator.clipboard.writeText(user.key);
    },

    deleteUser(user) {
        if (this.votedAny(user)) {
            return;
        }

        this.showModal(
            "Kullanıcıyı Sil",
            `"${user.name}" isimli kullanıcıyı silmek istediğinize emin misiniz?`,
            () => this.sendMessage("deleteUser", {id: user.id})
        );
    },

    votableCommittees() {
        return this.votes.filter(vote => {
            return vote.userId === this.modalUser.id;
        }).map(vote => {
            return this.committees.find(committee => {
                return committee.id === vote.committeeId;
            });
        });
    },

    // 0: can't vote, 1: can vote, 2: has cast vote, 3: no committee
    voteStatus(user, committeeId = this.modalCommittee.id) {
        if (!committeeId) {
            return 3;
        }

        const vote = this.votes.find(vote =>
            vote.userId === user.id &&
            vote.committeeId === committeeId
        );

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
        const vote = {userId: user.id, committeeId: this.modalCommittee.id, isCast: false};

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
