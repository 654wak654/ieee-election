import Redis from "ioredis";
import { SHA3 } from "sha3";

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB
});

const hash = new SHA3(256);

hash.update(process.argv[3]);

redis.rpush("admins", JSON.stringify({
    username: process.argv[2],
    password: hash.digest("hex")
}));
