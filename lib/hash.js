module.exports = function Hash() {

  const murmur3 = require("./murmur3");

  var hashCode = function(baseHash, val) {
    var h = baseHash || 0;
    return 31 * h + val;
  };

  var hashCodeString = function(string) {
    var i;
    var h = 0;

    for (i = 0; i < string.length; i++) {
      h = hashCode(h, string.charCodeAt(i));
    }

    return h;
  };

  return {
    hashCode: hashCode,
    hashCodeString: hashCodeString,
    murmur3: (buffer, seed) => murmur3(buffer, seed),
    murmur3Str: (string, seed) => murmur3(Buffer.from(string), seed)
  };
};
