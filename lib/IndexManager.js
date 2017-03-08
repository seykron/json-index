module.exports = function IndexManager(indexDir, options) {

  const debug = require("debug")("index_manager");

  /** Seed for murmur hashes */
  const HASH_SEED = Math.floor(Math.random() * 0x7fffffff);
  const INDEXED_FIELDS = options && options.indexedFields || [];
  /** Estimated size of a single index entry in memory. */
  const ESTIMATED_ENTRY_SIZE = 20;

  const path = require("path");
  const co = require("co");
  /** Index storage manager. */
  const storage = require("./storage")(indexDir);
  const hash = require("./hash")();
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

      meta = yield storage.load();

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

    debug("retrieving entry: %s", key);

    return index[indexName][key] || null;
  });

  return {

    load: () => load(),

    save: () => {
      debug("saving index");
      return storage.createIfRequired(meta, index);
    },

    meta: () => meta,

    push: addIndexEntry,

    getEntry: (key) => getEntry(indexedFields[0],
      hash.murmur3Str(key, meta.seed)),

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

      debug("querying indexes: %s", JSON.stringify(data));

      while(indexName = indexNames.shift()) {
        debug("index: %s", indexName);
        items = yield getEntry(hash.hashCodeString(indexName),
          hash.murmur3Str(data[indexName], meta.seed));
        results = results.concat(items);
      }

      return results;
    }),

    size () {
      return indexSize;
    },

    has (key) {
      return index.hasOwnProperty(hash.murmur3Str(key));
    }
  };
};
