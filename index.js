"use strict";

var mongoose = require("mongoose");
var Model = mongoose.Model;
var model = mongoose.model;

/**
 * Reusable constant values
 * @typedef {Object} constants
 * @property {number} DEFAULT_MIN_SIZE - Default min size for anagrams.
 * @property {boolean} DEFAULT_PREFIX_ONLY - Whether return ngrams from start of word or not
 */
var constants = {
  DEFAULT_MIN_SIZE: 2,
  DEFAULT_PREFIX_ONLY: false
};

/* istanbul ignore next */
function parseArguments(args, i1, i2) {
  var options = {};
  var callback = null;

  if (args[i1] && isFunction(args[i1])) {
    callback = args[i1];
  } else if (args[i1] && isObject(args[i1])) {
    options = args[i1];
  }

  if (!callback && typeof args[i2] === "function") {
    callback = args[i2];
  }

  return { options, callback };
}

/**
 * Creates sequence of characters taken from the given string.
 * @param {string} text - The string for the sequence.
 * @param {number} minSize - Lower limit to start creating sequence.
 * @param {boolean} prefixOnly -Only return ngrams from start of word.
 * @return {Array} The sequence of characters in Array of Strings.
 */
function nGrams(text, minSize, prefixOnly) {
  if (minSize == null) {
    minSize = constants.DEFAULT_MIN_SIZE;
  }

  var set = new Set();
  var index;

  if (minSize <= 0) {
    throw new Error("minSize must be greater than 0.");
  }

  if (!text) {
    return [];
  }

  text = text.slice ? text.toLowerCase() : String(text);
  index = prefixOnly ? 0 : text.length - minSize + 1;

  if (text.length <= minSize) {
    return [text];
  }

  if (!prefixOnly && index < 1) {
    return [];
  }

  if (prefixOnly) {
    while (minSize < text.length + 1) {
      set.add(text.slice(index, index + minSize));
      minSize++;
    }

    return Array.from(set);
  }

  while (minSize <= text.length + 1) {
    if (index !== 0) {
      set.add(text.slice(--index, index + minSize));
    } else {
      minSize++;
      index = text.length - minSize + 1;
    }
  }

  return Array.from(set);
}

/**
 * Creates sequence of each word from the given string.
 * @param {string} text - The string for the sequence.
 * @param {boolean} escapeSpecialCharacters - Escape special characters from the given string.
 * @param {number} minSize - Lower limit to start creating sequence.
 * @param {boolean} prefixOnly -Only return ngrams from start of word.
 * @return {Array} The sequence of characters in Array of Strings.
 */
function makeNGrams(text, escapeSpecialCharacters, minSize, prefixOnly) {
  if (!text) {
    return [];
  }

  var result = text
    .split(" ")
    .map(function(q) {
      return nGrams(
        replaceSymbols(q, escapeSpecialCharacters),
        minSize || constants.DEFAULT_MIN_SIZE,
        prefixOnly || constants.DEFAULT_PREFIX_ONLY
      );
    })
    .reduce(function(acc, arr) {
      return acc.concat(arr);
    }, []);
  return Array.from(new Set(result));
}

/**
 * Removes special symbols from string.
 * @param {string} text - The string to remove the characters.
 * @param {boolean} escapeSpecialCharacters - If this value is true, it will also remove all the special characters.
 * @return {string} the given text without the special characters.
 */
function replaceSymbols(text, escapeSpecialCharacters) {
  text = text.toLowerCase();
  if (escapeSpecialCharacters) {
    text = text.replace(/[!\"#%&\'\(\)\*\+,-\.\/:;<=>?@\[\\\]\^`\{\|\}~]/g, ""); // remove special characters
  }
  text = text.replace(/_/g, " ");

  return text;
}

/* istanbul ignore next */
function createSchemaObject(typeValue, options) {
  options.type = typeValue;
  return options;
}

/**
 * Returns if the variable is an object and if the the object is empty
 * @param {any} obj
 * @return {boolean}
 */
function isObject(obj) {
  return !!obj && obj.constructor === Object && Object.keys(obj).length > 0;
}

/**
 * Returns if the variable is a Function
 * @param {any} fn
 * @return {boolean}
 */
function isFunction(fn) {
  return !!(fn && ("function" === typeof fn || fn instanceof Function));
}

/**
 * Converts Object to Array
 * @param {object} object - Object to convert
 * @return {array}
 */
function objectToValuesPolyfill(object) {
  return Object.keys(object).map(function(key) {
    return object[key];
  });
}

/* istanbul ignore next */
function addToSchema(name) {
  return {
    [`${name}_fuzzy`]: createSchemaObject([String], {
      default: "",
      index: false
    })
  };
}

/* istanbul ignore next */
function addArrayToSchema(name) {
  return {
    [`${name}_fuzzy`]: createSchemaObject(mongoose.Schema.Types.Mixed, {
      default: [],
      index: false
    })
  };
}

/* istanbul ignore next */
function createByFieldType(fields, strCb, objectCb, objectKeysCb) {
  fields.forEach(function(item) {
    if (
      typeof item === "string" ||
      (item instanceof String && isFunction(strCb))
    ) {
      strCb(item);
    } else if (isObject(item)) {
      if (item.keys && isFunction(objectKeysCb)) {
        objectKeysCb(item);
      } else if (isFunction(objectCb)) {
        objectCb(item);
      }
    } else {
      throw new TypeError("Fields items must be String or Object.");
    }
  });
}

/**
 * Add the fields to the collection
 * @param {object} schema - The mongoose schema
 * @param {array} fields - The fields to add to the collection
 * @param {string} language_override - see mongoose documentation
 */

/* istanbul ignore next */
function createFields(schema, fields, language_override) {
  var indexes = {};
  var weights = {};
  var options = {};
  fields.forEach(function(item) {
    if (typeof item === "string" || item instanceof String) {
      schema.add(addToSchema(item));
      indexes[`${item}_fuzzy`] = "text";
    } else if (isObject(item)) {
      if (item.keys) {
        item.keys.forEach(key => {
          indexes[`${item.name}_fuzzy.${key}_fuzzy`] = "text";
        });
        schema.add(addArrayToSchema(item.name));
      } else {
        schema.add(addToSchema(item.name));
        indexes[`${item.name}_fuzzy`] = "text";
        if (item.weight) {
          weights[`${item.name}_fuzzy`] = item.weight;
        }
      }
    } else {
      throw new TypeError("Fields items must be String or Object.");
    }
  });

  options.weights = weights;
  if (language_override) {
    options.language_override = language_override;
  }

  schema.index(indexes, options);
}

/**
 * Creates nGrams for the documents
 * @param {object} attributes - Schema attributes
 * @param {array} fields
 */

/* istanbul ignore next */
function createNGrams(attributes, fields) {
  fields.forEach(function(item) {
    if (
      attributes[item] &&
      (typeof item === "string" || item instanceof String)
    ) {
      attributes[`${item}_fuzzy`] = makeNGrams(attributes[item]);
    } else if (isObject(item)) {
      var escapeSpecialCharacters = item.escapeSpecialCharacters !== false;
      if (item.keys && attributes[`${item.name}`]) {
        var attrs = [];
        attributes[item.name].forEach(function(data) {
          var obj = {};
          item.keys.forEach(function(key, index) {
            obj = Object.assign({}, obj, {
              [`${key}_fuzzy`]: makeNGrams(
                data[key],
                escapeSpecialCharacters,
                item.minSize,
                item.prefixOnly
              )
            });
          });
          attrs.push(obj);
        });
        attributes[`${item.name}_fuzzy`] = attrs;
      } else if (attributes[`${item.name}`]) {
        attributes[`${item.name}_fuzzy`] = makeNGrams(
          attributes[item.name],
          escapeSpecialCharacters,
          item.minSize,
          item.prefixOnly
        );
      }
    }
  });
}

/**
 * Removes fuzzy keys from the document
 * @param {array} fields - the fields to remove
 */

/* istanbul ignore next */
function removeFuzzyElements(fields) {
  return function(doc, ret, opt) {
    fields.forEach(function(item) {
      if (typeof item === "string" || item instanceof String) {
        delete ret[`${item}_fuzzy`];
      } else if (isObject(item)) {
        delete ret[`${item.name}_fuzzy`];
      }
    });
    return ret;
  };
}

/**
 * Plugin's main function. Creates the fuzzy fields on the collection, set's a pre save middleware to create the Ngrams for the fuzzy fields
 * and creates the instance methods `fuzzySearch` which finds the guesses.
 * @param {object} schema - Mongo Collection
 * @param {object} options - plugin options
 */
module.exports = function(schema, options) {
  if (!options || (options && !options.fields)) {
    throw new Error("You must set at least one field for fuzzy search.");
  }

  if (!Array.isArray(options.fields)) {
    throw new TypeError("Fields must be an array.");
  }

  options.fields.forEach(function(item) {
    if (
      isObject(item) &&
      item.keys &&
      (!Array.isArray(item.keys) && typeof item.keys !== "string")
    ) {
      throw new TypeError("Key must be an array or a string.");
    }
  });

  createFields(schema, options.fields, options.language_override);

  var returnOptions = {
    transform: removeFuzzyElements(options.fields),
    getters: true,
    setters: true
  };
  schema.set("toObject", returnOptions);
  schema.set("toJSON", returnOptions);

  schema.pre("save", function(next) {
    createNGrams(this, options.fields);
    next();
  });

  schema.pre("update", function(next) {
    createNGrams(this._update, options.fields);
    next();
  });

  schema.pre("findOneAndUpdate", function(next) {
    createNGrams(this._update, options.fields);
    next();
  });

  schema.statics["fuzzySearch"] = function() {
    Object.values = Object.values || objectToValuesPolyfill;

    var args = Object.values(arguments);

    if (
      args.length === 0 &&
      (typeof args[0] !== "string" || !isObject(args[0]))
    ) {
      throw new TypeError(
        "Fuzzy Search: First argument is mandatory and must be a string or an object."
      );
    }

    var queryString = isObject(args[0]) ? args[0].query : args[0];

    var checkPrefixOnly = isObject(args[0])
      ? args[0].prefixOnly
      : constants.DEFAULT_PREFIX_ONLY;
    var defaultNgamMinSize = isObject(args[0])
      ? args[0].minSize
      : constants.DEFAULT_MIN_SIZE;
    var query = makeNGrams(
      queryString,
      false,
      defaultNgamMinSize,
      checkPrefixOnly
    ).join(" ");
    var options = null;
    var callback = null;

    if (args[1] && typeof args[1] === "function") {
      callback = args[1];
    } else if (args[1] && isObject(args[1])) {
      options = args[1];
    }

    if (!callback && typeof args[2] === "function") {
      callback = args[2];
    }

    var search;

    if (!options) {
      search = {
        $text: {
          $search: query
        }
      };
    } else {
      search = {
        $and: [{ $text: { $search: query } }, options]
      };
    }

    return Model["find"]
      .apply(this, [
        null,
        { confidenceScore: { $meta: "textScore" } },
        { sort: { confidenceScore: { $meta: "textScore" } } },
        callback
      ])
      .where(search);
  };
};
