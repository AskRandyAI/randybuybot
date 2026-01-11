function formatTimestamp() {
    return new Date().toISOString();
}

function info(message, ...args) {
    console.log(`[INFO] ${formatTimestamp()} -`, message, ...args);
}

function error(message, ...args) {
    console.error(`[ERROR] ${formatTimestamp()} -`, message, ...args);
}

function warn(message, ...args) {
    console.warn(`[WARN] ${formatTimestamp()} -`, message, ...args);
}

function debug(message, ...args) {
    // Only show debug logs if needed, or just map to info/console.log for now
    console.debug(`[DEBUG] ${formatTimestamp()} -`, message, ...args);
}

module.exports = {
    info,
    error,
    warn,
    debug
};