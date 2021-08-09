const winston = require('winston');

// Console transport for winston.
const consoleTransport = new winston.transports.Console({'timestamp':true});



// Set up winston logging.
const logger = winston.createLogger({
    level: process.env.DEBUG ? 'silly' : 'verbose',
    format: winston.format.combine(
        // winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.simple()
    ),
    transports: [
        consoleTransport
    ]
});


module.exports = { logger, consoleTransport };
