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


module.exports = { storage, albumCache, mediaItemCache, uploadDeadletter };
