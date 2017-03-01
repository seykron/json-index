module.exports = function IndexManager(indexDir, options) {

  /** Seed for murmur hashes */
  const HASH_SEED = Math.floor(Math.random() * 0x7fffffff);
  const INDEXED_FIELDS = options && options.indexedFields || [];

  const path = require("path");
  const co = require("co");
  /** Index storage manager. */
  const storage = require("./storage")(indexDir);
  /** Murmur hash generator. */
  const murmur = require("./murmur3")
  /** Iterator for entry sets. */
  const EntryIterator = require("./EntryIterator");

  /** Dynamic buffer to write new items. */
  var newItemsBuffer = new Buffer("N");
  var index = {};
  var indexSize = 0;
  var fd;

  /** Main index metadata. */
  var meta = {
    seed: HASH_SEED,
    size: 0,
    total: 0
  };

  var hashString = function (string) {
    return murmur(new Buffer(string), meta.seed);
  };

  var addIndexEntry = function (indexName, keyValue, markerStart, markerEnd) {
    var entry = {
      start: markerStart,
      end: markerEnd
    };
    if (!index[indexName]) {
      index[indexName] = {};
    }
    if (index[indexName][keyValue]) {
      index[indexName][keyValue].push(entry);
    } else {
      index[indexName][keyValue] = [entry];
    }
    indexSize += ESTIMATED_ENTRY_SIZE;
  };

  var load = () => co(function* () {
    try {
      var exists = storage.exists(INDEXED_FIELDS);

      if (exists) {
        debug("all indexes up to date");
      } else {
        debug("missing indexes");
      }

      yield storage.load();

      return true;
    } catch (err) {
      debug("error loading index: %s", err);
      return false;
    }
  });

  /** Returns an item from the index.
   * @param {String} indexName Name of the index to query. Cannot be null.
   * @param {String} key Unique key of the required item. Cannot be null.
   */
  var getEntry = (indexName, key) => co(function* () {
    if (!index[indexName]) {
      debug("opening index %s", indexName);
      index[indexName] = yield storage.openIndex(indexName);
    }

    return index[indexName][key] || null;
  });

  return {

    load: () => load(),

    save: () => storage.createIfRequired(meta, index),

    meta: () => meta,

    push: addIndexEntry,

    getEntry: (key) => getEntry(indexedFields[0], hashString(key)),

    /** Adds a new item into the index.
     *
     * @param {String} key Index key of the new item. Cannot be null or empty.
     * @param {Object} item Item to add. Cannot be null.
     */
    addEntry: (key, item) => co(function* () {
      var rawItem = new Buffer(JSON.stringify(item));
      var markerStart = newItemsBuffer.length;
      var markerEnd = markerStart + rawItem.length;

      debug("new item: %s", key);

      addIndexEntry(key, rawItem, -markerStart, -markerEnd);
      newItemsBuffer = Buffer.concat([newItemsBuffer, rawItem], markerEnd);
    }),

    query: (data) => co(function* () {
      var indexName;
      var indexNames = Object.keys(data);
      var items;
      var results = [];

      while(indexName = indexNames.shift()) {
        items = yield getEntry(hashCodeString(indexName),
          hashString(data[indexName]));
        results = results.concat(items);
      }

      return results;
    }),

    size () {
      return indexSize;
    },

    has (key) {
      return index.hasOwnProperty(hashString(key));
    }
  };
};
