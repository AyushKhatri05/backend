const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../../logs');
        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    info(message, meta = {}) {
        console.log(`[INFO] ${message}`, meta);
    }

    error(message, meta = {}) {
        console.error(`[ERROR] ${message}`, meta);
    }

    warn(message, meta = {}) {
        console.warn(`[WARN] ${message}`, meta);
    }
}

module.exports = new Logger();