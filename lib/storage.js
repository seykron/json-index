/** Index data files manager.
 */
module.exports = function Storage(indexDir) {
  var fs = require("fs");
  var path = require("path");

  const META_FILE = path.join(indexDir, "meta.json");

  var getIndexFile = function (indexName) {
    return path.join(indexDir, indexName + ".json");
  };

  var saveIndexes = function (indexes) {
    return new Promise((resolve, reject) => {
      Object.keys(indexes).forEach(indexName => {
        fs.writeFileSync(getIndexFile(indexName),
          JSON.stringify(indexes[indexName]));
      });
      resolve();
    });
  };

  return {
    createIfRequired(meta, indexes) {
      return new Promise((resolve, reject) => {
        if (!fs.existsSync(META_FILE)) {
          fs.writeFileSync(META_FILE, JSON.stringify(meta));
        }
        var exists = Object.keys(indexes).every(indexName =>
          fs.existsSync(getIndexFile(indexName)));
        if (!exists) {
          resolve(saveIndexes(indexes));
        }
      });
    },

    load() {
      return new Promise((resolve, reject) => {
        if (!fs.existsSync(indexDir)) {
          fs.mkdirSync(indexDir);
        }
        if (!fs.existsSync(META_FILE)) {
          return reject(new Error("Index doesn't exist."));
        }
        fs.readFile(META_FILE, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(JSON.parse(data.toString()));
          }
        });
      });
    },

    openIndex(indexName) {
      return new Promise((resolve, reject) => {
        fs.readFile(getIndexFile(indexName), (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(JSON.parse(data.toString()));
          }
        });
      });
    },

    exists(indexes) {
      return new Promise((resolve, reject) => {
        var exists = indexes
          .every(indexName => fs.existsSync(getIndexFile(indexName)));
        resolve(exists);
      });
    }
  };
};
