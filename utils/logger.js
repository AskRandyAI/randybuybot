const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Console format (human-readable)
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}] ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
    })
);

// Create the logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // Console output
        new winston.transports.Console({
            format: consoleFormat
        }),

        // All logs
        new DailyRotateFile({
            filename: path.join(logsDir, 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: process.env.LOG_RETENTION_DAYS || '30d',
            format: logFormat
        }),

        // Error logs only
        new DailyRotateFile({
            filename: path.join(logsDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxSize: '20m',
            maxFiles: process.env.LOG_RETENTION_DAYS || '30d',
            format: logFormat
        })
    ]
});

// Add request ID tracking for operations
let currentRequestId = null;

function setRequestId(id) {
    currentRequestId = id;
}

function getRequestId() {
    return currentRequestId;
}

function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Wrapper functions to maintain backward compatibility
function info(message, ...args) {
    logger.info(message, { requestId: currentRequestId, ...args });
}

function error(message, ...args) {
    logger.error(message, { requestId: currentRequestId, ...args });
}

function warn(message, ...args) {
    logger.warn(message, { requestId: currentRequestId, ...args });
}

function debug(message, ...args) {
    logger.debug(message, { requestId: currentRequestId, ...args });
}

module.exports = {
    info,
    error,
    warn,
    debug,
    setRequestId,
    getRequestId,
    generateRequestId,
    logger // Export the raw logger for advanced usage
};