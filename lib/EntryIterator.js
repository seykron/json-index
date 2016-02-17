module.exports = function EntryIterator(fd, positions, config) {

  /** Current iterator instance. */
  var iterator = this;

  /** Class logger. */
  var debug = require("debug")("entry_iterator");

  /** Node's file system API. */
  var fs = require("fs");

  /** Raw data loaded from the bundle file. */
  var buffer = new Buffer(config.bufferSize);

  /** Absolute positions in the data file that's currently
   * loaded in the memory buffer.
   */
  var currentRange = {
    start: 0,
    end: 0
  };

  /** Synchrounously updates the cache with a new range of data if the required
   * range is not within the current cache.
   * @param {Number} start Start position of the required range. Cannot be null.
   * @param {Number} end End position of the required range. Cannot be null.
   * @param {Boolean} force Indicates whether to force the cache update.
   */
  var loadBufferIfRequired = function (start, end, force) {
    var bytesRead;

    if (end - start > config.bufferSize) {
      return reject(new Error("Range exceeds the max buffer size"));
    }
    if (force || start < currentRange.start || (start > currentRange.end)) {
      bytesRead = fs.readSync(fd, buffer, 0, config.bufferSize, start);
      currentRange.start = start;
      currentRange.end = start + bytesRead;
      debug("buffering new range: %s", JSON.stringify(currentRange));
    }
  };

  /** Reads data range from the file into the buffer.
   * @param {Number} start Absolute start position. Cannot be null.
   * @param {Number} end Absolute end position. Cannot be null.
   */
  var readEntry = function (start, end) {
    var offsetStart;
    var offsetEnd;

    loadBufferIfRequired(start, end);

    offsetStart = start - currentRange.start;
    offsetEnd = offsetStart + (end - start);

    return buffer.slice(offsetStart, offsetEnd);
  };

  /** Lazily retrives an item with the specified index.
   * @param {Number} index Required item index. Cannot be null.
   */
  var getItem = function (index) {
    var rawItem;
    var position = positions[index];

    try {
      rawItem = readEntry(position.start, position.end);
      return JSON.parse(rawItem);
    } catch (ex) {
      debug("ERROR reading item: %s -> %s", ex, rawItem);
    }
  };

  (function __init() {
    // Iterates over all entries.
    iterator[Symbol.iterator] = function* () {
      var i, rawItem, item;
      for (i = 0; i < positions.length; i++) {
        yield getItem(i);
      }
    };
  }());

  return Object.assign(iterator, {
    length: positions.length,
    get(index) {
      return getItem(index);
    },
    map(callback) {
      return positions.map((position, index) =>
        callback(getItem(index), index));
    },
    reduce(callback, initialVal) {
      return positions.reduce((prev, position, index) =>
        callback(prev, getItem(index), index), initialVal);
    },
    filter(callback) {
      var filtered = [];
      positions.forEach((position, index) => {
        var item = getItem(index);
        if (callback(item, index)) {
          filtered.push(item);
        }
      });
      return filtered;
    },
    forEach(callback) {
      positions.forEach((position, index) => callback(getItem(index), index));
    },
    slice(begin, end) {
      return positions
        .slice(begin, end)
        .map((position, index) => getItem(index));
    },
    every(callback) {
      return positions.every((position, index) =>
        callback(getItem(index), index));
    },
    some(callback) {
      return positions.some((position, index) =>
        callback(getItem(index), index));
    }
  });
};
