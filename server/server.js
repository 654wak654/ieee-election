/* eslint-disable padding-line-between-statements */

import WebSocket from "ws";
import { Endpoint, verify } from "./endpoint.js";

const wss = new WebSocket.Server({
    host: process.env.WS_HOST,
    port: process.env.WS_PORT
});

wss.on("connection", ws => {
    const endpoint = new Endpoint(ws);

    ws.on("message", async wsData => {
        let message = null;
        try {
            message = JSON.parse(wsData);
        } catch {
            ws.close(1003, "Invalid message");
            return;
        }

        if (!message.type) {
            ws.close(1003, "Missing message type");
            return;
        }

        if (typeof message.type !== "string") {
            ws.close(1003, "Message type must be a string");
            return;
        }

        if (!endpoint[message.type] || message.type === "constructor" || message.type.startsWith("_")) {
            ws.close(1003, `Invalid message type: ${message.type}`);
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

        if (!["auth", "adminAuth", "signOut"].includes(message.type)) {
            if (!message.token) {
                ws.close(1003, "Missing message token");
                return;
            }

            if (typeof message.token !== "string") {
                ws.close(1003, "Message token must be a string");
                return;
            }

            if (!verify(message.token, message.type)) {
                ws.close(1003, "Invalid message token");
                return;
            }
        }

        const response = await endpoint[message.type](message.data, message.token);

        if (response) {
            ws.send(JSON.stringify({ id: message.id, data: response }));
        }
    });
});

setInterval(() => wss.clients.forEach(client => client.ping()), 30000);
