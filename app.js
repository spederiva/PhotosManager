// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const async = require('async');
const bodyParser = require('body-parser');
const config = require('./config.js');
const express = require('express');
const expressWinston = require('express-winston');
const http = require('http');
const request = require('request-promise');
const session = require('express-session');
const sessionFileStore = require('session-file-store');
const { logger, consoleTransport } = require('./server/logger');

const app = express();
const fileStore = sessionFileStore(session);
const server = http.Server(app);

const addRoutes = require('./server/endpoints')

// Use the EJS template engine
app.set('view engine', 'ejs');

// Set up a session middleware to handle user sessions.
// NOTE: A secret is used to sign the cookie. This is just used for this sample app and should be changed.
const sessionMiddleware = session({
    resave: true,
    saveUninitialized: true,
    store: new fileStore({}),
    secret: 'photo frame sample',
});


// Enable extensive logging if the DEBUG environment variable is set.
if (process.env.DEBUG) {
    // Enable express.js debugging. This logs all received requests.
    app.use(expressWinston.logger({ transports: [consoleTransport], winstonInstance: logger }));

    // Enable request debugging.
    require('request-promise').debug = true;
}

// Set up static routes for hosted libraries.
app.use(express.static('static'));
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist/'));
app.use('/fancybox', express.static(__dirname + '/node_modules/@fancyapps/fancybox/dist/'));
app.use('/mdlite', express.static(__dirname + '/node_modules/material-design-lite/dist/'));


// Parse application/json request data.
app.use(bodyParser.json());

// Parse application/xwww-form-urlencoded request data.
app.use(bodyParser.urlencoded({ extended: true }));

// Enable user session handling.
app.use(sessionMiddleware);

// Preparing google authentication
const { google } = require('googleapis');

// Create a new OAuth2 client with the configured keys.
const oauth2Client = new google.auth.OAuth2(
    config.oAuthClientID,
    config.oAuthclientSecret,
    config.oAuthCallbackUrl
);

// This is one of the many ways you can configure googleapis to use authentication credentials.
// In this method, we're setting a global reference for all APIs.
// Any other API you use here, like google.drive('v3'), will now use this auth client.
// You can also override the auth client at the service and method call levels.
google.options({ auth: oauth2Client });


// Set up OAuth 2.0 authentication through the passport.js library.
const passport = require('passport');
const auth = require('./auth');
auth(passport);

// Star the OAuth login process for Google.
// app.get('/auth/google', passport.authenticate('google', {
//     scope: config.scopes,
//     failureFlash: true,  // Display errors to the user.
//     session: true,
//     accessType: 'offline'
// }));
app.get('/auth/google', (req, res) => {
    const authorizeUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: config.scopes,
    });

    res.redirect(authorizeUrl);
});

// app.get('/auth/google/callback', async (req, res) => {
//     // User has logged in.
//     logger.info('User has logged in.');
//
//     console.log(req.query.code);
//
//     const {tokens} = await oauth2Client.getToken(req.query.code);
//     oauth2Client.credentials = tokens; // eslint-disable-line require-atomic-updates
//
//     console.log(tokens)
//
//     res.redirect('/');
// });

// Set up passport and session handling.
app.use(passport.initialize());
app.use(passport.session());

// Middleware that adds the user of this session as a local variable,
// so it can be displayed on all pages when logged in.
app.use((req, res, next) => {
    res.locals.name = '-';
    if (req.user && req.user.profile && req.user.profile.name) {
        res.locals.name = req.user.profile.name.givenName || req.user.profile.displayName;
    }

    res.locals.avatarUrl = '';
    if (req.user && req.user.profile && req.user.profile.photos) {
        res.locals.avatarUrl = req.user.profile.photos[0].value;
    }
    next();
});


// GET request to the root.
// Display the login screen if the user is not logged in yet, otherwise the
// photo frame..
addRoutes(app, logger, passport);

// Start the server
server.listen(config.port, () => {
    logger.info(`App listening on port ${config.port}`);
    logger.info('Press Ctrl+C to quit.');
});
