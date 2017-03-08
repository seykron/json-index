module.exports = function EntryIterator(file, positions, config) {

  /** Current iterator instance. */
  const iterator = this;

  /** Class logger. */
  const debug = require("debug")("entry_iterator");

  const BufferedFileReader = require("ds-reader").BufferedFileReader;

  /** Range reader to read data from the file. */
  var reader = new BufferedFileReader(file, config).rangeReader();

  /** Lazily retrives an item with the specified index.
   * @param {Number} index Required item index. Cannot be null.
   */
  var getItem = function (index) {
    var rawItem;
    var position = positions[index];

    try {
      rawItem = reader.read(position.start, position.end);
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
