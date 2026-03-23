const advisoryParser = require("./iwxxm-advisory-parser");

function parse(xmlString, options) {
  return advisoryParser.parse(xmlString, "sigmet", options);
}

module.exports = { parse };
