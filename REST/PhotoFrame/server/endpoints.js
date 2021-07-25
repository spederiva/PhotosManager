const addRoutes = (app, config, logger, passport) => {

    // GET request to the root.
    // Display the login screen if the user is not logged in yet, otherwise the
    // photo frame.
    app.get('/', (req, res) => {
        if (!req.user || !req.isAuthenticated()) {
            // Not logged in yet.
            res.render('pages/login');
        } else {
            res.render('pages/frame');
        }
    });

    // GET request to log out the user.
    // Destroy the current session and redirect back to the log in screen.
    app.get('/logout', (req, res) => {
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
    app.get('/auth/google/callback', passport.authenticate(
        'google', { failureRedirect: '/', failureFlash: true, session: true }),
        (req, res) => {
            // User has logged in.
            logger.info('User has logged in.');
            res.redirect('/');
        });

    // Loads the search page if the user is authenticated.
    // This page includes the search form.
    app.get('/search', (req, res) => {
        renderIfAuthenticated(req, res, 'pages/search');
    });

    // Loads the album page if the user is authenticated.
    // This page displays a list of albums owned by the user.
    app.get('/album', (req, res) => {
        renderIfAuthenticated(req, res, 'pages/album');
    });

    app.get('/uploadAlbums', (req, res) => {
        renderIfAuthenticated(req, res, 'pages/uploadAlbums');
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
};

module.exports = addRoutes;

