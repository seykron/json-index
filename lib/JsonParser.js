module.exports = function JsonParser(dataReader) {

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

  const debug = require("debug")("json_parser");
  const co = require("co");
  const hash = require("./hash")();
  const IndexManager = require("./IndexManager");

  /** Information for indexing, if enabled. */
  var indexOptions = {
    indexEnabled: false,
    fields: {},
    manager: null
  };

  var parse = function* () {
    var {indexEnabled, manager, fields, meta} = indexOptions;
    var cursor = -1;
    var inString = false;
    var offset = 0;
    var position = 0;
    var markerStart = -1;
    var markerEnd = -1;

    var isValue = false;
    var char;
    var stringStart = 0;
    var fieldHash = 0;
    var keys = [];
    var i;
    var buffer;
    var startTime = Date.now();

    debug("parsing");

    for (buffer of dataReader) {
      while (position < buffer.length) {

        char = buffer[position];

        // Indicates whether the parser is within a string.
        if (char == DOUBLE_QUOTE && buffer[position - 1] != BACKSLASH) {
          if (inString) {
            if (indexEnabled && isValue) {
              if (fields[fieldHash]) {
                // Concats fieldName and value hash to build the key.
                keys.push([fieldHash, hash.murmur3(buffer
                  .slice(stringStart, position), meta.seed)]);
              }

              fieldHash = 0;
            }
          } else {
            stringStart = position + 1;
          }
          inString = !inString;
        }
        if (indexEnabled && inString) {
          if (char != DOUBLE_QUOTE && !isValue) {
            fieldHash = hash.hashCode(fieldHash, char);
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

              if (indexEnabled) {
                for (i = 0; i < keys.length; i++) {
                  manager.push(keys[i][0], keys[i][1],
                    offset + markerStart, offset + markerEnd);
                }

                keys = [];
                meta.total += 1;
              } else {
                yield buffer.slice(markerStart, markerEnd);
              }
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

      position = 0;
      offset += buffer.length;
    }

    debug("done, took %s secs", (Date.now() - startTime) / 1000);
  };

  return {

    index(definition) {
      var indexManager = new IndexManager(definition.path, definition.config);

      indexOptions = {
        indexEnabled: true,
        manager: indexManager,
        fields: definition.fields.reduce((prev, field) => {
          prev[hash.hashCodeString(field)] = field;
          return prev;
        }, {}),
        meta: indexManager.meta()
      };

      debug("parser changed to indexing mode: %s", JSON.stringify(definition));

      return this;
    },

    parse: () => parse(),

    close: () => co(function* () {
      if (indexOptions.indexEnabled) {
        debug("closing index manager");
        yield indexOptions.manager.save();
      }
    })
  };
};
