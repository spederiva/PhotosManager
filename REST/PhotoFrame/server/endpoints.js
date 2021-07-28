const config = require('../config.js');
const { storage, albumCache, mediaItemCache, clearAllCache } = require('./cache');
const { returnPhotos, returnError, libraryApiSearch, getAlbums, createAlbums, getFolders } = require('./services');

const addRoutes = (app, logger, passport) => {

    // GET request to the root. Display the login screen if the user is not logged in yet, otherwise the photo frame.
    app.get('/', (req, res) => {
        if (!req.user || !req.isAuthenticated()) {
            // Not logged in yet.
            res.render('pages/login');
        } else {
            res.render('pages/frame');
        }
    });

    // GET request to log out the user. Destroy the current session and redirect back to the log in screen.
    app.get('/logout', (req, res) => {
        clearAllCache();

        req.logout();
        req.session.destroy();
        res.redirect('/');
    });

    // Star the OAuth login process for Google.
    app.get('/auth/google', passport.authenticate('google', {
        scope: config.scopes,
        failureFlash: true,  // Display errors to the user.
        session: true,
    }));

    // Callback receiver for the OAuth process after log in.
    app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/', failureFlash: true, session: true }), (req, res) => {
        // User has logged in.
        logger.info('User has logged in.');
        res.redirect('/');
    });

    // Loads the search page if the user is authenticated. This page includes the search form.
    app.get('/search', (req, res) => {
        renderIfAuthenticated(req, res, 'pages/search');
    });

    // Loads the album page if the user is authenticated. This page displays a list of albums owned by the user.
    app.get('/album', (req, res) => {
        renderIfAuthenticated(req, res, 'pages/album');
    });

    app.get('/uploadAlbums', (req, res) => {
        renderIfAuthenticated(req, res, 'pages/uploadAlbums');
    });

    // Handles form submissions from the search page.
    // The user has made a selection and wants to load photos into the photo frame
    // from a search query.
    // Construct a filter and submit it to the Library API in
    // libraryApiSearch(authToken, parameters).
    // Returns a list of media items if the search was successful, or an error
    // otherwise.
    app.post('/loadFromSearch', async (req, res) => {
        const authToken = req.user.token;

        logger.info('Loading images from search.');
        logger.silly('Received form data: ', req.body);

        // Construct a filter for photos.
        // Other parameters are added below based on the form submission.
        const filters = { contentFilter: {}, mediaTypeFilter: { mediaTypes: ['PHOTO'] } };

        if (req.body.includedCategories) {
            // Included categories are set in the form. Add them to the filter.
            filters.contentFilter.includedContentCategories =
                [req.body.includedCategories];
        }

        if (req.body.excludedCategories) {
            // Excluded categories are set in the form. Add them to the filter.
            filters.contentFilter.excludedContentCategories =
                [req.body.excludedCategories];
        }

        // Add a date filter if set, either as exact or as range.
        if (req.body.dateFilter == 'exact') {
            filters.dateFilter = {
                dates: constructDate(
                    req.body.exactYear, req.body.exactMonth, req.body.exactDay),
            }
        } else if (req.body.dateFilter == 'range') {
            filters.dateFilter = {
                ranges: [{
                    startDate: constructDate(
                        req.body.startYear, req.body.startMonth, req.body.startDay),
                    endDate:
                        constructDate(req.body.endYear, req.body.endMonth, req.body.endDay),
                }]
            }
        }

        // Create the parameters that will be submitted to the Library API.
        const parameters = { filters };

        // Submit the search request to the API and wait for the result.
        const data = await libraryApiSearch(authToken, parameters);

        // Return and cache the result and parameters.
        const userId = req.user.profile.id;
        returnPhotos(res, userId, data, parameters);
    });

    // Handles selections from the album page where an album ID is submitted.
    // The user has selected an album and wants to load photos from an album
    // into the photo frame.
    // Submits a search for all media items in an album to the Library API.
    // Returns a list of photos if this was successful, or an error otherwise.
    app.post('/loadFromAlbum', async (req, res) => {
        const albumId = req.body.albumId;
        const userId = req.user.profile.id;
        const authToken = req.user.token;

        logger.info(`Importing album: ${albumId}`);

        // To list all media in an album, construct a search request
        // where the only parameter is the album ID.
        // Note that no other filters can be set, so this search will
        // also return videos that are otherwise filtered out in libraryApiSearch(..).
        const parameters = { albumId };

        // Submit the search request to the API and wait for the result.
        const data = await libraryApiSearch(authToken, parameters);

        returnPhotos(res, userId, data, parameters)
    });

    app.post('/addAlbums', async (req, res) => {
        let userId;

        logger.info('Create New Albums', req.body);

        try {
            userId = req.user.profile.id;

            const data = await createAlbums(req.user.token, req.body.checkedFolders);

            return res.status(200).send(data);
        } catch (err) {
            if (userId) {
                // Clear the cached albums.
                albumCache.removeItem(userId);
            }

            // Error occured during the request. Albums could not be loaded.
            return returnError(res, err);
        }
    });

    // Returns all albums owned by the user.
    app.get('/getAlbums', async (req, res) => {
        logger.info('Loading albums');

        try {
            const userId = req.user.profile.id;
            const token = req.user.token;

            const albums = await getAlbums(userId, token);

            return res.status(200).send(albums);
        } catch (err) {
            // Error occured during the request. Albums could not be loaded.
            return returnError(res, err);
        }
    });

    // Returns a list of the media items that the user has selected to
    // be shown on the photo frame.
    // If the media items are still in the temporary cache, they are directly
    // returned, otherwise the search parameters that were used to load the photos
    // are resubmitted to the API and the result returned.
    app.get('/getQueue', async (req, res) => {
        const userId = req.user.profile.id;
        const authToken = req.user.token;

        logger.info('Loading queue.');

        // Attempt to load the queue from cache first. This contains full mediaItems
        // that include URLs. Note that these expire after 1 hour. The TTL on this
        // cache has been set to this limit and it is cleared automatically when this
        // time limit is reached. Caching this data makes the app more responsive,
        // as it can be returned directly from memory whenever the user navigates
        // back to the photo frame.
        const cachedPhotos = await mediaItemCache.getItem(userId);
        const stored = await storage.getItem(userId);

        if (cachedPhotos) {
            // Items are still cached. Return them.
            logger.verbose('Returning cached photos.');
            res.status(200).send({ photos: cachedPhotos, parameters: stored.parameters });
        } else if (stored && stored.parameters) {
            // Items are no longer cached. Resubmit the stored search query and return
            // the result.
            logger.verbose(
                `Resubmitting filter search ${JSON.stringify(stored.parameters)}`);
            const data = await libraryApiSearch(authToken, stored.parameters);
            returnPhotos(res, userId, data, stored.parameters);
        } else {
            // No data is stored yet for the user. Return an empty response.
            // The user is likely new.
            logger.verbose('No cached data.')
            res.status(200).send({});
        }
    });

    app.get('/getFolders', async (req, res) => {
        logger.info('Loading Folders');
        const userId = req.user.profile.id;

        try {
            const data = getFolders();

            return res.status(200).send(data);
        } catch (err) {
            logger.error('Error loading folders', err);

            return returnError(res, err);
        }
    });


    // Renders the given page if the user is authenticated.
    // Otherwise, redirects to "/".
    function renderIfAuthenticated(req, res, page) {
        if (!req.user || !req.isAuthenticated()) {
            res.redirect('/');
        } else {
            res.render(page);
        }
    }

    // Constructs a date object required for the Library API.
    // Undefined parameters are not set in the date object, which the API sees as a
    // wildcard.
    function constructDate(year, month, day) {
        const date = {};
        if (year) date.year = year;
        if (month) date.month = month;
        if (day) date.day = day;
        return date;
    }

};

module.exports = addRoutes;

