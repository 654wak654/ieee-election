/* eslint-env node */
/* eslint-disable padding-line-between-statements */

const WebSocket = require("ws");

const Endpoint = require("./endpoint");

const wss = new WebSocket.Server({
    port: 5050
});

wss.on("connection", ws => {
    const endpoint = new Endpoint(ws);

    ws.on("message", wsData => {
        let message;
        try {
            message = JSON.parse(wsData);
        } catch {
            ws.close(1003, "Invalid message");
            return;
        }

        console.log("message =", message);

        if (!message.type) {
            ws.close(1003, "Missing message type");
            return;
        }

        if (typeof message.type !== "string") {
            ws.close(1003, "Message type must be a string");
            return;
        }

        if (!endpoint[message.type]) {
            ws.close(1003, "Invalid message type");
            return;
        }

        if (!message.data) {
            ws.close(1003, "Missing message data");
            return;
        }

        if (typeof message.data !== "object") {
            ws.close(1003, "Message data must be an object");
            return;
        }

        if (!message.id) {
            ws.close(1003, "Missing message id");
            return;
        }

        if (typeof message.id !== "number") {
            ws.close(1003, "Message id must be a number");
            return;
        }

        // TODO: There is going to be a better way to do this once single-auth-per-connection is done
        if (message.type !== "auth" && message.type !== "adminAuth") {
            if (!message.token) {
                ws.close(1003, "Missing message token");
                return;
            }

            if (typeof message.token !== "number") {
                ws.close(1003, "Message token must be a number");
                return;
            }

            if (!endpoint.verify(message.token)) {
                ws.close(1003, "Invalid message token");
                return;
            }
        }

        const response = endpoint[message.type](message.data);
        if (response) {
            ws.send(JSON.stringify({id: message.id, data: response}));
        }
    });
});
