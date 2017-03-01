/** Index data files manager.
 */
module.exports = function Storage(indexDir) {
  const fs = require("fs");
  const path = require("path");
  const co = require("co");

  const META_FILE = path.join(indexDir, "meta.json");

  var getIndexFile = function (indexName) {
    return path.join(indexDir, indexName + ".json");
  };

  var saveIndexes = (indexes) => co(function* (){
    Object.keys(indexes).forEach(indexName => {
      fs.writeFileSync(getIndexFile(indexName),
        JSON.stringify(indexes[indexName]));
    });
  });

  return {
    createIfRequired: (meta, indexes) => co(function* () {
      if (!fs.existsSync(META_FILE)) {
        fs.writeFileSync(META_FILE, JSON.stringify(meta));
      }
      var exists = Object.keys(indexes).every(indexName =>
        fs.existsSync(getIndexFile(indexName)));
      if (!exists) {
        yield saveIndexes(indexes);
      }
    }),

    load: () => new Promise((resolve, reject) => {
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
    }),

    openIndex: (indexName) => new Promise((resolve, reject) => {
      fs.readFile(getIndexFile(indexName), (err, data) => {
        if (err) {
          reject(err);
        } else {
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
