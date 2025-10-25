const fs = require('fs');
const path = require('path');

function ensureConfig() {
    try {
    const projectRoot = path.resolve(__dirname, '..', '..');
        const configPath = path.join(projectRoot, 'config.json');
        if (fs.existsSync(configPath)) {
            // config already exists
            return;
        }

        // possible template filenames (support common typo from request)
        const templates = ['config_template.json', 'config_teplate.json', 'config-example.json', 'config.sample.json'];
        let found = null;
        for (const t of templates) {
            const p = path.join(projectRoot, t);
            if (fs.existsSync(p)) { found = p; break; }
        }

        if (found) {
            // copy template to config.json
            fs.copyFileSync(found, configPath);
            console.log('=============================================================');
            console.log('No config.json was found. A configuration template was copied to config.json.');
            console.log('Please open config.json, fill in the required values (API keys, tokens, IDs), and restart the bot.');
            console.log(`Template copied from: ${path.basename(found)}`);
            console.log(`Created: ${configPath}`);
            console.log('Exiting so you can safely edit the configuration.');
            console.log('=============================================================');
            // exit to let user edit the file before starting the bot
            process.exit(1);
        } else {
            console.error('config.json not found and no template file available.');
            console.error('Create a config.json in the project root or add a config_template.json and restart.');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error while ensuring config.json exists:', e && e.message ? e.message : e);
        process.exit(1);
    }
}

module.exports = { ensureConfig };
