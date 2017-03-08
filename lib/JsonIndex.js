/** Indexes a huge JSON file and allows to lazily retrieve entries. It builds a
 * lightweight index and keeps a range of raw entries in memory to avoid reading
 * from disk. The entries cache is updated and a new range of entries is loaded
 * into memory only when the required item is not in the current buffer.
 *
 * It keeps the dataFile file descriptor opened until close() is explicitly
 * invoked.
 *
 * It reads the JSON file from top to bottom and puts the index entries in the
 * same order, so the best performance is reached when contiguous items are
 * sequentially required.
 *
 * @param {String} dataFile JSON file to read items. Cannot be null or empty.
 * @param {String} indexDir Directory to store the index. Cannot be null.
 * @param {Number} [options.parseBufferSize] Size of the memory buffer to cache
 *    data to parse. Default is 256MB.
 * @param {Number} [options.readBufferSize] Size of the memory buffer to cache
 *    items for reading. Default is 50MB.
 */
module.exports = function JsonIndex(dataFile, indexDir, options) {

  /** Number of bytes to load into the buffer for parsing. */
  const PARSE_BUFFER_SIZE = (options && options.parseBufferSize) || (1024 * 1024 * 256);

  /** Configuration for reading the index. */
  const readConfig = {
    bufferSize: (options && options.readBufferSize) || (1024 * 1024 * 50), // 50MB
  };

  /** Default logger. */
  const debug = require("debug")("json_index");
  /** Control-flow library. */
  const co = require("co");
  /** Iterator for entry sets. */
  const EntryIterator = require("./EntryIterator");

  const BufferedFileReader = require("ds-reader").BufferedFileReader;

  /** Low-level index manager. */
  const indexManager = require("./IndexManager")(indexDir, options);
  const hash = require("./hash")();
  const JsonParser = require("./JsonParser");

  /** Creates the index. The index consist of a map from a user-specific key to
   * the position within the buffer where the item starts and ends. Items are
   * read lazily when it is required.
   */
  var buildIndex = () => co(function* () {
    var startTime = Date.now();
    var reader = new BufferedFileReader(dataFile, {
      bufferSize: PARSE_BUFFER_SIZE
    });
    var parser = new JsonParser(reader.iterator()).index({
      path: indexDir,
      fields: options.indexes,
      config: options
    });
    debug("creating index");

    parser.parse().next();
    yield parser.close();

    debug("done, took %s secs", (Date.now() - startTime) / 1000);
  });

  return {

    load: () => co(function* () {
      var loaded = yield indexManager.load();

      if (!loaded) {
        yield buildIndex();
        yield indexManager.load();
      }
    }),

    create: () => co(function* () {
      yield buildIndex();
      yield indexManager.load();
    }),

    getEntry: (key) => co(function* () {
      var positions = yield indexManager.getEntry(key);
      return new EntryIterator(dataFile, positions, readConfig);
    }),

    /** Adds a new item into the index.
     *
     * @param {String} key Index key of the new item. Cannot be null or empty.
     * @param {Object} item Item to add. Cannot be null.
     */
    addEntry: (key, item) => indexManager.addEntry(key, item),

    size () {
      return indexManager.size();
    },

    has (key) {
      return indexManager.has(key);
    },

    save: () => indexManager.save(),

    close: () => co(function* () {
      yield indexManager.save();
    }),

    query: (data) => co(function* () {
      var results = yield indexManager.query(data);
      return new EntryIterator(dataFile, results, readConfig);
    })
  };
};
