const fs = require("fs");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

async function downloadFile(url, destination) {
    const response = await fetch(url);
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Download failed with HTTP status ${response.status}`);
    }

    if (!response.body) {
        throw new Error("Download response has no body");
    }

    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
    return destination;
}

module.exports = { downloadFile };
