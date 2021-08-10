const config = require('../config.js');
const { logger } = require('./logger');
const request = require('request-promise');
const Exception = require('./exception');

let googleRefreshToken = null;
let tokenDate = 0;
let token = null;

function setTokens(token, refresh_token) {
    logger.info(`Set Refresh Token`, { date: Date(), token, refresh_token });

    if (!token || !refresh_token) {
        throw Error('No refresh token defined!');
    }

    googleRefreshToken = refresh_token;
    setAuthToken(token);
}

function setAuthToken(authToken) {
    logger.info(`Set Token Date`, { date: Date(), authToken });

    tokenDate = Date.now();
    token = authToken;
}

function getToken() {
    if (!googleRefreshToken) {
        throw new Exception(401, 'No refresh token defined!');
    }

    if (!token) {
        throw new Exception(401, 'No token defined!');
    }

    return token;
}

function resetToken() {
    tokenDate = 0
    token = null;
}

function shouldRefreshToken() {
    return !token || Date.now() - tokenDate >= config.tokenLifetime;
}

async function refreshToken() {
    try {
        if (!googleRefreshToken) {
            throw new Exception(401, 'No refresh token defined!');
        }

        logger.info(`Refreshing token: ${refreshToken}`);

        // Make a POST request to search the library or album
        const googleRefreshTokenUri = 'https://oauth2.googleapis.com'

        const result = await request.post(googleRefreshTokenUri + '/token', {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            form: {
                client_id: config.oAuthClientID,
                client_secret: config.oAuthclientSecret,
                refresh_token: googleRefreshToken,
                grant_type: 'refresh_token'
            },
            auth: { 'bearer': token },
        });

        const newRefreshedToken = JSON.parse(result);

        logger.info(`Token refreshed`, { newRefreshedToken, date: Date() });

        setAuthToken(newRefreshedToken.access_token);

        return token;
    } catch (err) {
        logger.error('Error refreshing the token', err);

        throw err;
    }
}

module.exports = { refreshToken, resetToken, setTokens, getToken };
