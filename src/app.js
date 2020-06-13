import "alpinejs";

window.app = () => ({
    loginError: false,

    _page: "login",
    _token: null,
    _queue: {},
    _id: 1,

    init() {
        // TODO: Init should check for navigation and stuff
        // TODO: Set page to current url
        // TODO: Handle disconnects and logouts

        window.addEventListener("popstate", event => {
            console.log(event);
        });

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
        this._page = page;

        history.pushState({}, "", page);
    },

    sendMessage(type, data, callback) {
        this.ws.send(JSON.stringify({id: this._id, token: this._token, type, data}));

        this._queue[this._id] = callback;

        this._id++;
    },

    login() {
        this.sendMessage("auth", {key: this.$refs.key.value}, ({ok, token}) => {
            if (ok) {
                this._token = token;
                this.page = "home";
            }

            this.loginError = !ok;
        });
    }
});
