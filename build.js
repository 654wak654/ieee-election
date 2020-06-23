/* eslint-env node */

const fs = require("fs").promises;
const Bundler = require("parcel");

(async () => {
    // Clear dist
    try {
        await fs.access("./dist");
        for (const filename of await fs.readdir("./dist")) {
            await fs.unlink(`./dist/${filename}`);
        }
    } catch {
        console.info("dist doesn't exist, skipping");
    }

    // Run parcel bundler
    await new Bundler("./src/index.html", {
        production: true,
        contentHash: false,
        sourceMaps: false,
        publicURL: "./"
    }).bundle();
})().catch(e => console.error(e));
