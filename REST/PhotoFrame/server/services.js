const _ = require('lodash');
const fs = require('fs');
const request = require('request-promise');
const Photos = require('googlephotos');
const config = require('../config.js');
const { logger } = require('./logger');
const { storage, mediaItemCache, uploadDeadletter, albumCache, albumItemsCache } = require('./cache');

const CHUNK_SIZE_ALBUMS = 3;
const CHUNK_SIZE_ITEMS = 10;
const WAITING_AFTER_ITEM_UPLOAD = 500;
const WAITING_AFTER_CHUNK_UPLOAD = 5000;

const UPLOAD_MEDIA_TIMEOUT = 1 * 60000;
const UPLOAD_MEDIA_DEAD_LETTER_TIMEOUT = 10 * 60000;


// If the supplied result is succesful, the parameters and media items are
// cached.
// Helper method that returns and caches the result from a Library API search
// query returned by libraryApiSearch(...). If the data.error field is set,
// the data is handled as an error and not cached. See returnError instead.
// Otherwise, the media items are cached, the search parameters are stored
// and they are returned in the response.
function returnPhotos(res, userId, data, searchParameter) {
    if (data.error) {
        returnError(res, data)
    } else {
        // Remove the pageToken and pageSize from the search parameters.
        // They will be set again when the request is submitted but don't need to be
        // stored.
        delete searchParameter.pageToken;
        delete searchParameter.pageSize;

        // Cache the media items that were loaded temporarily.
        mediaItemCache.setItemSync(userId, data.photos);
        // Store the parameters that were used to load these images. They are used
        // to resubmit the query after the cache expires.
        storage.setItemSync(userId, { parameters: searchParameter });

        // Return the photos and parameters back int the response.
        res.status(200).send({ photos: data.photos, parameters: searchParameter });
    }
}

// Responds with an error status code and the encapsulated data.error.
function returnError(res, data) {
    // Return the same status code that was returned in the error or use 500 otherwise.
    const statusCode = data && data.error && data.error.code || 500;

    // Return the error.
    res.status(statusCode).send(data.error || data.message);
}

async function searchItemByNameAndAlbum(authToken, albumId, fileName){
    let photos = await albumItemsCache.getItem(albumId);

    if(!photos) {
        const items = (await libraryApiSearch(authToken, { albumId })) || [];

        photos = items.photos;

        albumItemsCache.setItemSync(albumId, photos);
    }

    return photos.find(i => i.filename === fileName);
}

// Submits a search request to the Google Photos Library API for the given
// parameters. The authToken is used to authenticate requests for the API.
// The minimum number of expected results is configured in config.photosToLoad.
// This function makes multiple calls to the API to load at least as many photos
// as requested. This may result in more items being listed in the response than
// originally requested.
async function libraryApiSearch(authToken, parameters) {
    let photos = [];
    let nextPageToken = null;
    let error = null;

    parameters.pageSize = config.searchPageSize;

    try {
        // Loop while the number of photos threshold has not been met yet
        // and while there is a nextPageToken to load more items.
        do {
            logger.info(
                `Submitting search with parameters: ${JSON.stringify(parameters)}`);

            // Make a POST request to search the library or album
            const result =
                await request.post(config.apiEndpoint + '/v1/mediaItems:search', {
                    headers: { 'Content-Type': 'application/json' },
                    json: parameters,
                    auth: { 'bearer': authToken },
                });

            logger.debug(`Response: ${result}`);

            // The list of media items returned may be sparse and contain missing
            // elements. Remove all invalid elements.
            // Also remove all elements that are not images by checking its mime type.
            // Media type filters can't be applied if an album is loaded, so an extra
            // filter step is required here to ensure that only images are returned.
            const items = result && result.mediaItems ?
                result.mediaItems
                    .filter(x => x)  // Filter empty or invalid items.
                    // Only keep media items with an image mime type.
                    .filter(x => x.mimeType && x.mimeType.startsWith('image/')) :
                [];

            photos = photos.concat(items);

            // Set the pageToken for the next request.
            parameters.pageToken = result.nextPageToken;

            logger.verbose(`Found ${items.length} images in this request. Total images: ${photos.length}`);

            // Loop until the required number of photos has been loaded or until there
            // are no more photos, ie. there is no pageToken.
        } while (photos.length < config.photosToLoad &&
        parameters.pageToken != null);

    } catch (err) {
        // If the error is a StatusCodeError, it contains an error.error object that
        // should be returned. It has a name, statuscode and message in the correct
        // format. Otherwise extract the properties.
        error = err.error.error ||
            { name: err.name, code: err.statusCode, message: err.message };
        logger.error(error);
    }

    logger.info('Search complete.');
    return { photos, parameters, error };
}

async function getAlbums(userId, authToken) {
    // Attempt to load the albums from cache if available. Temporarily caching the albums makes the app more responsive.
    const cachedAlbums = await albumCache.getItem(userId);
    if (cachedAlbums) {
        logger.verbose('Loaded albums from cache.');

        return cachedAlbums;
    }

    logger.verbose('Loading albums from API.');

    // Albums not in cache, retrieve the albums from the Library API and return them
    const data = await libraryApiGetAlbums(authToken);

    if (data.error) {
        // Clear the cached albums.
        albumCache.removeItem(userId);

        // Error occurred during the request. Albums could not be loaded.
        throw data;
    }

    albumCache.setItemSync(userId, data);

    return data;
}

async function getAlbumByName(userId, authToken, albumName) {
    const albums = await getAlbums(userId, authToken);

    return albums.albums.find(a => a.title === albumName);
}

// Returns a list of all albums owner by the logged in user from the Library API.
async function libraryApiGetAlbums(authToken) {
    let albums = [];
    let nextPageToken = null;
    let error = null;
    let parameters = { pageSize: config.albumPageSize };

    try {
        // Loop while there is a nextpageToken property in the response until all
        // albums have been listed.
        do {
            logger.verbose(`Loading albums. Received so far: ${albums.length}`);
            // Make a GET request to load the albums with optional parameters (the
            // pageToken if set).
            const result = await request.get(config.apiEndpoint + '/v1/albums', {
                headers: { 'Content-Type': 'application/json' },
                qs: parameters,
                json: true,
                auth: { 'bearer': authToken },
            });

            logger.debug(`Response: ${result}`);

            if (result && result.albums) {
                logger.verbose(`Number of albums received: ${result.albums.length}`);

                // Parse albums and add them to the list, skipping empty entries.
                albums = albums.concat(result.albums.filter(x => !!x));
            }
            parameters.pageToken = result.nextPageToken;
            // Loop until all albums have been listed and no new nextPageToken is
            // returned.
        } while (parameters.pageToken != null);

    } catch (err) {
        // If the error is a StatusCodeError, it contains an error.error object that
        // should be returned. It has a name, statuscode and message in the correct
        // format. Otherwise extract the properties.
        error = err.error.error || { name: err.name, code: err.statusCode, message: err.message };

        logger.error(error);
    }

    logger.info('Albums loaded.');
    return { albums, error };
}

function getFolders() {
    return fs.readdirSync(config.rootFolder)
        .filter(folderName => !folderName.startsWith('.'))
        .filter(folderName => isFolder(config.rootFolder, folderName))
        .map(folderName => {
            return {
                folderName,
                fullPath: `${config.rootFolder}/${folderName}`,
                itemCount: getNumberOfItemsInFolder(`${config.rootFolder}/${folderName}`)
            }
        })
}

function getNumberOfItemsInFolder(dirPath = config.rootFolder, arrayOfFiles = []) {
    return fs.readdirSync(dirPath)
        .filter(filename => !filename.startsWith('.'))
        .reduce((counter, current) => {
            if (isFolder(dirPath, current)) {
                return counter + getNumberOfItemsInFolder(`${dirPath}/${current}`);
            }

            return ++counter;
        }, 0)
}

async function createAlbums(userId, authToken, folderLists) {
    logger.debug('Creating albums', folderLists);

    if (!folderLists || folderLists.length === 0) {
        logger.info('Albums empty', folderLists);

        throw new Error('No Folder selected');
    }

    if (!folderLists || folderLists.length > 50) {
        logger.info('Too many albums selected', folderLists);

        throw new Error('Too many albums selected');
    }

    // Clear cached albums in order to make sure we got all new albums
    albumCache.clearSync();
    albumItemsCache.clearSync();


    const deadletterCount = await handleDeadLetter(authToken, 1, 5);
    if (deadletterCount > 0) {
        throw new Error(`Dead Letter is not empty!. Count: ${deadletterCount}`);
    }

    try {
        const foldersResult = [];
        const chunks = _.chunk(folderLists, CHUNK_SIZE_ALBUMS);

        logger.debug(`Creating albums. Split in ${chunks.length}`);

        for (const chunk of chunks) {
            const folders = await Promise.all(chunk.map(async f => {
                return {
                    ...f,
                    items: await createAllAlbumsAndUploadPhotos(userId, authToken, f),
                }
            }));

            foldersResult.push(...folders);

            logger.info('Albums with photos created', folders);
        }

        await handleDeadLetter(authToken, 1, 5);

        return {
            foldersResult,
            deadletterCount: (await getDeadletterKeys()).length
        };
    } catch (err) {
        logger.error(err);

        throw err;
    }
}

async function handleDeadLetter(authToken, numberOfTries = 1, CHUNK_SIZE_ITEMS) {
    for (let tries = 0; tries < numberOfTries; tries++) {
        const deadletter = await getDeadletterKeys();

        logger.info(`Uploading Dead Letter. Try: ${tries + 1}`, deadletter);

        if (deadletter.length === 0) {
            return 0;
        }

        const chunks = _.chunk(deadletter, CHUNK_SIZE_ITEMS || 1);
        for (const chunk of chunks) {
            await Promise.all(chunk.map(key => uploadMediaFromDeadletter(key, authToken)));

            await sleep(WAITING_AFTER_ITEM_UPLOAD * CHUNK_SIZE_ITEMS / 2);
        }
    }

    return getDeadletterKeys() || 0;
}

async function uploadMediaFromDeadletter(key, authToken) {
    const dl = await getAndRemoveFromDeadletter(key);

    if (!dl) {
        return;
    }

    const media = await uploadMediaToAlbum(authToken, dl.albumId, dl.fileName, dl.fileDescription, dl.folderPath, UPLOAD_MEDIA_DEAD_LETTER_TIMEOUT);

    return media;
}

async function createAllAlbumsAndUploadPhotos(userId, authToken, { folderName, fullPath }, fileCount = 0, parentAlbumName = '') {
    let googlePhotosAlbum = null;
    let albumName = null;

    const items = getItemsInFolder(fullPath);

    logger.info('Creating album and uploading photos', { folderName, fullPath, parentAlbumName, count: items.length });

    const chunks = _.chunk(items, CHUNK_SIZE_ITEMS);
    for (const chunk of chunks) {
        for (const file of chunk) {
            const isDirectory = isFolder(fullPath, file);
            const isValidFile = isValidFileExtension(file);

            logger.debug('createAllAlbumsAndUploadPhotos', { folderName, fullPath, file, isDirectory, isValidFile });

            if (isDirectory) {
                return await createAllAlbumsAndUploadPhotos(userId, authToken, { folderName: file, fullPath: `${fullPath}/${file}` }, fileCount, albumName);
            }

            if (isValidFile) {
                if (!googlePhotosAlbum) {
                    const prefixAlbumName = parentAlbumName ? `${parentAlbumName} - ` : '';

                    albumName = prefixAlbumName + folderName;

                    googlePhotosAlbum = await createOrGetAlbum(userId, authToken, albumName);
                }

                const isAlreadyInAlbum = await searchItemByNameAndAlbum(authToken, googlePhotosAlbum.id, file);
                console.log(file, isAlreadyInAlbum);
                if(isAlreadyInAlbum){
                    logger.debug('Media already in album', { albumId: googlePhotosAlbum.id, file });

                    fileCount++;

                    continue;
                }

                const mediaUploaded = await uploadMediaToAlbum(authToken, googlePhotosAlbum.id, file, folderName, fullPath);

                fileCount++;

                logger.debug('Media uploaded to Album', { albumId: googlePhotosAlbum.id, file, mediaUploaded });

                // await sleep(WAITING_AFTER_ITEM_UPLOAD);
            }
        }

        await sleep(WAITING_AFTER_CHUNK_UPLOAD);
    }

    return fileCount;
}

function getItemsInFolder(dirPath = config.rootFolder, arrayOfFiles = []) {
    return fs.readdirSync(dirPath)
        .filter(name => filterHidden(name));
}

function filterHidden(fileName) {
    return !fileName.startsWith('.');
}

function isValidFileExtension(fileName) {
    const fileExt = getFileExtension(fileName).toUpperCase();

    if (fileName.startsWith('.')) {
        return false;
    }

    return config.validFileExtensions.find(e => e === fileExt);
}

function getFileExtension(filePath) {
    return filePath.split('.').pop();
}

function isFolder(dirPath, current) {
    const fullPath = `${dirPath}/${current}`;

    return fs.statSync(fullPath).isDirectory();
}

async function createOrGetAlbum(userId, authToken, albumName) {
    logger.info('Creating Album', { albumName });

    const album = await getAlbumByName(userId, authToken, albumName);
    if (album) {
        logger.info('Get existing Album', album);

        return album;
    }

    let body = {
        "album": {
            "title": albumName
        }
    }

    try {
        const result = await request.post(config.apiEndpoint + '/v1/albums', {
            headers: { 'Content-Type': 'application/json' },
            body,
            json: true,
            auth: { 'bearer': authToken },
        });

        logger.debug('Albums created', result);

        return result;
    } catch (err) {
        logger.error('Error creating album', err);

        throw err;
    }
}

async function uploadMediaToAlbum(authToken, albumId, fileName, fileDescription, folderPath, timeout = UPLOAD_MEDIA_TIMEOUT) {
    logger.info('Uploading media', { albumId, folderPath, fileName, fileDescription, timeout });

    const filePath = `${folderPath}/${fileName}`;

    const photos = new Photos(authToken);

    try {
        const uploadToken = await photos.transport.upload(fileName, filePath, timeout);
        const response = await photos.mediaItems.albumBatchCreate(albumId, fileName, fileDescription, uploadToken);

        return response;
    } catch (err) {
        logger.error('Error uploading file', { albumId, fileName, error: { ...err, message: err.message } });

        uploadDeadletter.setItemSync(Date.now().toString(), { albumId, fileName, fileDescription, folderPath, err: err && err.message });
    }
}

async function getDeadletterKeys() {
    const deadletter = (await uploadDeadletter.keys()) || [];

    return deadletter;
}

async function getAndRemoveFromDeadletter(key) {
    const data = await uploadDeadletter.getItem(key);

    await uploadDeadletter.removeItem(key);

    return data;
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    returnPhotos,
    returnError,
    libraryApiSearch,
    getAlbums,
    createAlbums,
    getFolders,
    handleDeadLetter
};

