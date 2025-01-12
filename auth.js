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

const config = require('./config.js');
const { refreshTokenStorage } = require('./server/cache');
const { setTokens } = require('./server/authentication');

const GoogleOAuthStrategy = require('passport-google-oauth20').Strategy;
module.exports = (passport) => {
    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((user, done) => done(null, user));
    passport.use(new GoogleOAuthStrategy({
            clientID: config.oAuthClientID,
            clientSecret: config.oAuthclientSecret,
            callbackURL: config.oAuthCallbackUrl,
            userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
        },
        (token, refreshToken, profile, done) => {
            let storedRefreshToken = null;
            if (!refreshToken) {
                const storedProfile = refreshTokenStorage.getItemSync(profile.id);

                storedRefreshToken = storedProfile && storedProfile.refreshToken;
            }

            setTokens(token, refreshToken || storedRefreshToken);

            if (refreshToken) {
                refreshTokenStorage.setItemSync(profile.id, { name: profile.displayName, refreshToken });
            }

            return done(null, { profile, token });
        }));
};
