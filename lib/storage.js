/** Index data files manager.
 */
module.exports = function Storage(indexDir) {
  const debug = require("debug")("storage");
  const fs = require("fs");
  const path = require("path");
  const co = require("co");

  const META_FILE = path.join(indexDir, "meta.json");

  var getIndexFile = function (indexName) {
    return path.join(indexDir, indexName + ".json");
  };

  var saveIndexes = (indexes) => co(function* () {
    Object.keys(indexes).forEach(indexName => {
      var indexFile = getIndexFile(indexName);
      debug("writing index %s", indexFile);
      fs.writeFileSync(indexFile, JSON.stringify(indexes[indexName]));
    });
  });

  return {
    createIfRequired: (meta, indexes) => co(function* () {
      if (fs.existsSync(META_FILE)) {
        debug("meta file exists, skipping creation");
      } else {
        debug("writing meta file: %s", JSON.stringify(meta));
        fs.writeFileSync(META_FILE, JSON.stringify(meta));
      }
      var exists = Object.keys(indexes).every(indexName =>
        fs.existsSync(getIndexFile(indexName)));
      if (exists) {
        debug("all indexes exists");
      } else {
        debug("saving indexes");
        yield saveIndexes(indexes);
      }
    }),

    load: () => new Promise((resolve, reject) => {
      if (!fs.existsSync(indexDir)) {
        debug("index dir doesn't exist, creating");
        fs.mkdirSync(indexDir);
      }
      if (!fs.existsSync(META_FILE)) {
        debug("meta file not found, isn't a valid index directory?");
        return reject(new Error("Index doesn't exist."));
      }
      fs.readFile(META_FILE, (err, data) => {
        if (err) {
          debug("error reading index meta file: %s", err);
          reject(err);
        } else {
          debug("meta file successfully loaded: %s", data.toString());
          resolve(JSON.parse(data.toString()));
        }
      });
    }),

    openIndex: (indexName) => new Promise((resolve, reject) => {
      var indexFile = getIndexFile(indexName);
      debug("reading index %s from file %s", indexName, indexFile);

      fs.readFile(indexFile, (err, data) => {
        if (err) {
          debug("error reading index: %s", err);
          reject(err);
        } else {
          debug("index %s successfully loaded", indexName);
          resolve(JSON.parse(data.toString()));
        }
      });
    }),

    exists: (indexes) => new Promise((resolve, reject) => {
      var exists = fs.existsSync(META_FILE) && indexes
        .every(indexName => fs.existsSync(getIndexFile(indexName)));
      resolve(exists);
    })
  };
};
