const persist = require('node-persist');

const mediaItemCache = persist.create({
    dir: 'persist-mediaitemcache/',
    ttl: 3300000,  // 55 minutes
});
mediaItemCache.init();

const albumCache = persist.create({
    dir: 'persist-albumcache/',
    ttl: 600000,  // 10 minutes
});
albumCache.init();

const storage = persist.create({ dir: 'persist-storage/' });
storage.init();

const uploadDeadletter = persist.create({ dir: 'persist-upload-dead-letter/' });
uploadDeadletter.init();

function clearAllCache(){
    mediaItemCache.clearSync();
    albumCache.clearSync();
    storage.clearSync();
}

module.exports = { clearAllCache, storage, albumCache, mediaItemCache, uploadDeadletter };
