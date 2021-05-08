/* eslint-disable no-console */

import { default as fs } from "fs/promises";

// Clear dist
try {
    await fs.access("./dist");

    for (const filename of await fs.readdir("./dist")) {
        await fs.unlink(`./dist/${filename}`);
    }

    console.log("Cleared dist");
} catch {
    console.info("dist doesn't exist, skipping");
}
