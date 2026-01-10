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

module.exports = {
    info,
    error,
    warn
};