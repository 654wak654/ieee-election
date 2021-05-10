# ieee-election

## Development

Edit the `.env` file as necessary (Have to rename it from `.env.example` to `.env` too).
- `REDIS_` variables will have to be configured for a local/remote server. They're configured for docker by default.
- `MAILJET_` and `EMAIL_` variables will have to be set if mail is to be sent.

Run both commands in parallel:
```
npm run dev
npm start
```

You good.

## Deployment

Run `npm run build` to make sure you have the latest frontend assets.

Then run `npm start` to start the websocket server.

You'll need a web server like nginx or caddy to serve the assets and proxy the websocket server.
