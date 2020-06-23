# ieee-election

## Development

Run both commands in parallel:
```
npm run dev
npm start
```

You good.

## Deployment

Run `npm run build` to make sure you have the latest frontend assets.

Then run `npm start` to start the websocket server.

You'll need a web server like nginx or caddy to serve the assets and proxy the server.

## TODO List
- Handle disconnects and logouts (generally all session TODOs)
- Handle joining mid-election
- Make sure the key, user, and password fields are saved by the browser
- Progress bar at bottom of vote with total number of voters
- Get some nice (maybe randomized?) backgrounds for the login screens

### Future ideas
- Use [ioredis](https://www.npmjs.com/package/ioredis) as a lowdb adapter that way multiple node instances can be run at the same time with good old round robin load balancing.
