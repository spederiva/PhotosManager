const winston = require('winston');

// Console transport for winton.
const consoleTransport = new winston.transports.Console();

// Set up winston logging.
const logger = winston.createLogger({
    level: process.env.DEBUG ? 'silly' : 'verbose',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    ),
    transports: [
        consoleTransport
    ]
});

module.exports = { logger, consoleTransport };
