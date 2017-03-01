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
 * @param {String} options.indexKeyName Name of the attribute within the json
 *    object to use as the key for the index. Cannot be null.
 * @param {Number} [options.bufferSize] Size of the memory buffer to cache
 *    items. Default is 50MB.
 */
module.exports = function JsonIndex(dataFile, indexDir, options) {

  /** Opening bracket character code. */
  const OPENING_BRACKET = 0x7B;
  /** Closing bracket character code. */
  const CLOSING_BRACKET = 0x7D;
  /** Double quotes character code. */
  const DOUBLE_QUOTE = 0x22;
  /** Backslash character code*/
  const BACKSLASH = 0x5C;
  /** Colon character code. */
  const COLON = 0x3A;
  /** Comma character code. */
  const COMMA = 0x2C;
  /** Space character code. */
  const SPACE = 0x20;
  /** Estimated size of a single index entry in memory. */
  const ESTIMATED_ENTRY_SIZE = 20;
  /** Number of bytes to load into the buffer for parsing. */
  const PARSE_BUFFER_SIZE = options.parseBufferSize || (1024 * 1024 * 512);
  /** Number of CPUs. */
  const CPU_COUNT = require('os').cpus().length;

  /** Default configuration. */
  const config = Object.assign({
    indexKeyName: "key",
    indexKeyMatcher: "\"" + (options.indexKeyName || "key") + "\"\:\"(.+?)\"",
    bufferSize: options.readBufferSize || (1024 * 1024 * 50), // 50MB
  }, options);

  /** Default logger. */
  const debug = require("debug")("json_index");

  /** Murmur hash generator. */
  const murmur = require("./murmur3")

  /** Node's FileSystem API.
   * @type {Object}
   */
  const fs = require("fs");

  /** Promises library. */
  const Q = require("q");

  /** Control-flow library. */
  const co = require("co");

  /** Iterator for entry sets. */
  const EntryIterator = require("./EntryIterator");

  /** Low-level index manager. */
  const indexManager = require("./IndexManager")(indexDir, config);

  var hashCode = function(baseHash, val) {
    var h = baseHash || 0;
    return 31 * h + val;
  }

  var hashCodeString = function(string) {
    var i;
    var h = 0;

    for (i = 0; i < string.length; i++) {
      h = hashCode(h, string.charCodeAt(i));
    }

    return h;
  }

  var indexedFields = options.indexes.map(field => hashCodeString(field));

  /** Main index metadata. */
  var meta;

  /** Index of history items. */
  var index = {};

  /** Estimated index size. */
  var indexSize = 0;

  /** Dynamic buffer to write new items. */
  var newItemsBuffer = new Buffer("N");

  /** Data file descriptor. */
  var fd;

  var hash = function (buffer) {
    return murmur(buffer, meta.seed);
  };

  var readAndIndex = (offsetInfo, buffer) => co(function* () {
    var cursor = (offsetInfo.cursor !== undefined) ? offsetInfo.cursor : -1;
    var inString = offsetInfo.inString;
    var offset = offsetInfo.offset || 0;
    var position = 0;
    var markerStart = -1;
    var markerEnd = -1;

    var isValue = false;
    var char;
    var stringStart = 0;
    var fieldHash = 0;
    var keys = [];
    var i;

    while (position < buffer.length) {
      char = buffer[position];

      // Indicates whether the parser is within a string.
      if (char == DOUBLE_QUOTE && buffer[position - 1] != BACKSLASH) {
        if (inString) {
          if (isValue) {
            if (indexedFields.indexOf(fieldHash) > -1) {
              // Concats fieldName and value hash to build the key.
              keys.push([fieldHash, hash(buffer.slice(stringStart, position))]);
            }

            fieldHash = 0;
          }
        } else {
          stringStart = position + 1;
        }
        inString = !inString;
      }
      if (inString) {
        if (char != DOUBLE_QUOTE && !isValue) {
          fieldHash = hashCode(fieldHash, char);
        }
      } else {
        switch(char) {
        case OPENING_BRACKET:
          cursor += 1;

          if (cursor == 0) {
            markerStart = position;
          }
          break;
        case CLOSING_BRACKET:
          cursor -= 1;

          if (cursor == -1 && markerStart > -1) {
            markerEnd = position + 1;

            for (i = 0; i < keys.length; i++) {
              indexManager.push(keys[i][0], keys[i][1],
                offset + markerStart, offset + markerEnd);
            }

            keys = [];
            meta.total += 1;
          }
        case COLON:
          isValue = true;
          break;
        case COMMA:
          isValue = false;
          break;
        }
      }

      position += 1;
    }

    return {
      cursor: cursor,
      inString: inString,
      offset: offset + position
    };
  });

  var openDataFile = function () {
    fd = fs.openSync(dataFile, "r");
    return fd;
  };

  var readNextChunk = (readInfo) => new Promise((resolve, reject) => {
    var fd = readInfo.fd;
    var bytesRead = readInfo.bytesRead || 0;
    var readBuffer = new Buffer(PARSE_BUFFER_SIZE);
    var size = readInfo.size || 0;
    var length = PARSE_BUFFER_SIZE;

    if (size - bytesRead < PARSE_BUFFER_SIZE) {
      readBuffer = new Buffer(size - bytesRead);
      length = size - bytesRead;
    }
    if (readInfo.done) {
      resolve(readInfo);
    } else {
      fs.read(fd, readBuffer, 0, length, null, (err, nextBytesRead, buffer) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            fd: fd,
            bytesRead: bytesRead += nextBytesRead,
            readBuffer: readBuffer,
            size: size,
            done: bytesRead >= size
          });
        }
      });
    }
  });

  /** Creates the index. The index consist of a map from a user-specific key to
   * the position within the buffer where the item starts and ends. Items are
   * read lazily when it is required.
   */
  var buildIndex = () => new Promise((resolve, reject) => {
    var startTime = Date.now();
    var size = fs.statSync(dataFile).size;
    var next = (readInfo, position) => {
      var jobs = [readNextChunk(readInfo)];

      if (position) {
        jobs.push(readAndIndex(position, readInfo.readBuffer));
        debug(position);
      }

      Q.all(jobs).then(results => {
        var nextReadInfo = results[0];
        var nextPosition = results[1] || {};

        readInfo.readBuffer = null;

        if (nextReadInfo.done && position) {
          debug("indexSize size: %s", (indexSize / 1024) + "KB");
          debug("index ready (took %s secs)", (Date.now() - startTime) / 1000);

          meta.size = indexSize;

          debug(meta);

          resolve();
        } else {
          next(nextReadInfo, nextPosition);
        }
      }).catch(err => reject(err));
    };

    debug("creating index");
    next({ size: size, fd: openDataFile() });
  });

  return {
    load: () => co(function* () {
      var loaded = yield indexManager.load();

      meta = indexManager.meta();

      if (!loaded) {
        yield buildIndex();
        yield indexManager.save();
      }
    }),

    getEntry: (key) => co(function* () {
      var positions = yield indexManager.getEntry(key);
      return new EntryIterator(fd, positions, config);
    }),

    /** Adds a new item into the index.
     *
     * @param {String} key Index key of the new item. Cannot be null or empty.
     * @param {Object} item Item to add. Cannot be null.
     */
    addEntry: (key, item) => indexManager.addEntry(key, item),

    size () {
      return indexSize;
    },

    has (key) {
      return indexManager.has(key);
    },

    save: () => indexManager.save(),

    close: () => {
      fs.closeSync(fd);
    },

    query: (data) => co(function* () {
      var results = yield indexManager.query(data);
      return new EntryIterator(fd, results, config);
    })
  };
};
