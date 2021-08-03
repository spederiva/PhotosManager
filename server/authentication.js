const config = require('../config.js');
const { logger } = require('./logger');
const request = require('request-promise');

let tokenDate = 0;
let token = null;

function setToken(authToken) {
    logger.info(`Set Token Date`, { date: Date(), authToken });

    tokenDate = Date.now();
    token = authToken;
}

function resetToken(){
    tokenDate = 0
    token = null;
}

function shouldRefreshToken() {
    return !token || Date.now() - tokenDate >= config.tokenLifetime;
}

async function refreshToken(authToken) {
    try {
        if (!shouldRefreshToken()) {
            return token;
        }

        logger.info(`Refreshing token: ${authToken}`);

        // Make a POST request to search the library or album
        const googleRefreshToken = 'https://oauth2.googleapis.com'

        const result = await request.post(googleRefreshToken + '/token', {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            form: {
                client_id: config.oAuthClientID,
                client_secret: config.oAuthclientSecret,
                refresh_token: authToken,
                grant_type: 'refresh_token'
            },
            auth: { 'bearer': authToken },
        });

        const newRefreshedToken = JSON.parse(result);

        logger.info(`Token refreshed`, { newRefreshedToken, date: Date() });

        setToken(newRefreshedToken.access_token);

        return token;
    } catch (err) {
        logger.error('Error refreshing the token', error);

        throw err;
    }
}

module.exports = { refreshToken, resetToken };
