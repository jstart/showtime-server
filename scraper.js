'use strict';

var request = require('request');
var cheerio = require('cheerio');
var qs = require('querystring');
var url = require('url');

var bugsnag = require("bugsnag");
bugsnag.register("57c9b974a3ace125470d8943e5f8da1e");

/**
 * @param {object=} options
 */
function IMDBScraper() {
  if (!(this instanceof IMDBScraper)) {
    return new IMDBScraper();
  }
  this.userAgent = 'showtimes (http://github.com/jonursenbach/showtimes)';
  this.baseUrl = 'http://www.imdb.com/title/';
}

/**
 * @param {function} cb - Callback to handle the resulting movie object.
 * @returns {object}
 */
IMDBScraper.prototype.getMovie = function (ttid, cb) {
  var self = this;

  var options = {
    url: self.baseUrl + ttid,
    headers: {
      'User-Agent': self.userAgent
    }
  };

  request(options, function (error, response, body) {

    if (error || response.statusCode !== 200) {
      if (error === null) {
        cb('Unknown error occured while querying theater data from Google Movies.');
      } else {
        cb(error);
      }

      return;
    }

    var $ = cheerio.load(body);

    var posterURL = $('#img_primary img').attr('src');

    cb(null, posterURL);

    return;
  });
};

module.exports = IMDBScraper;

var scraper = IMDBScraper();
scraper.getMovie('tt0884732', function (err, data) {
        if (data) {
          console.log(data);
        }
      });