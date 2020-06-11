/* eslint-env node */

const WebSocket = require("ws");

const wss = new WebSocket.Server({
    port: 5050
});

wss.on("connection", (ws, req, client) => {
    ws.on("message", event => {
        const message = JSON.parse(event.data);

        console.log(message);
    });
});
