'use strict';

var request = require('request');
var cheerio = require('cheerio');
var qs = require('querystring');
var url = require('url');

var bugsnag = require("bugsnag");
bugsnag.register("57c9b974a3ace125470d8943e5f8da1e");

var express = require('express');
var app = express();
app.use(bugsnag.requestHandler);
app.use(bugsnag.requestHandler);
var cache_manager = require('cache-manager');
var memory_cache = cache_manager.caching({
  store: 'memory',
  max: 10000,
  ttl: 3600 /*seconds*/
});

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

/**
 * @param {string} location
 * @param {object=} options
 */
function Showtimes(location, options) {
  if (!(this instanceof Showtimes)) {
    return new Showtimes(location, options);
  }
  this.userAgent = 'showtimes (http://github.com/jonursenbach/showtimes)';
  this.baseUrl = 'http://google.com/movies';
  this.location = location;

  var reserved = Object.keys(Showtimes.prototype);
  for (var i in options) {
    if (reserved.indexOf(i) === -1) {
      this[i] = options[i];
    }
  }
}

/**
 * @param {function} cb - Callback to handle the resulting theaters.
 * @param {number=} [page=1] - Page to pull theaters from. Hidden API and used during pagination.
 * @param {object=} [theaters=[]] - Current theaters object. Hidden API and used during pagination.
 * @returns {object}
 */
Showtimes.prototype.getTheaters = function (cb) {
  var self = this;
  var page = 1;
  var theaters = [];

  if (arguments.length > 1) {
    page = arguments[1];
    theaters = arguments[2];
  }

  var options = {
    url: self.baseUrl,
    qs: {
      near: self.location,
      date: (typeof self.date !== 'undefined') ? self.date : 0,
      start: ((page - 1) * 10)
    },
    headers: {
      'User-Agent': self.userAgent
    }
  };

  request(options, function (error, response, body) {
    bugsnag.autoNotify(function () {
      console.log(self.baseUrl + '?near=' + self.location + '&date=' + options.qs.date + '&start=' + options.qs.start);
      if (error || response.statusCode !== 200) {
        if (error === null) {
          cb('Unknown error occured while querying theater data from Google Movies.');
        } else {
          cb(error);
        }

        return;
      }

      var $ = cheerio.load(body);

      var cloakedUrl;
      var genre;
      var imdb;
      var info;
      var match;
      var meridiem;
      var movieId;
      var rating;
      var runtime;
      var showtime;
      var showtimes;
      var theaterId;
      var theaterData;
      var trailer;

      if ($('.theater').length === 0) {
        cb($('#results').text());
        return;
      }

      $('.theater').each(function (i, theater) {
        theater = $(theater);

        cloakedUrl = theater.find('.desc h2.name a').attr('href');
        theaterId = cloakedUrl ? qs.parse(url.parse(cloakedUrl).query).tid : '';

        info = theater.find('.desc .info').text().split(' - ');

        theaterData = {
          id: theaterId,
          name: theater.find('.desc h2.name').text(),
          address: info[0] ? info[0].trim() : '',
          phoneNumber: info[1] ? info[1].trim() : '',
          movies: []
        };

        theater.find('.showtimes .movie').each(function (j, movie) {
          movie = $(movie);

          cloakedUrl = movie.find('.name a').attr('href');
          movieId = qs.parse(url.parse(cloakedUrl).query).mid;

          // Movie info format: RUNTIME - RATING - GENRE - TRAILER - IMDB
          // Some movies don't have a rating, trailer, or IMDb pages, so we need
          // to account for that.
          info = movie.find('.info').text().split(' - ');

          if (info[0].match(/(hr |min)/)) {
            runtime = info[0].trim();
            if (info[1].match(/Rated/)) {
              rating = info[1].replace(/Rated/, '').trim();
              if (typeof info[2] !== 'undefined') {
                if (info[2].match(/(IMDB|Trailer)/i)) {
                  genre = false;
                } else {
                  genre = info[2].trim();
                }
              } else {
                genre = false;
              }
            } else {
              rating = false;

              if (info[1].match(/(IMDB|Trailer)/i)) {
                genre = false;
              } else {
                genre = info[1].trim();
              }
            }
          } else {
            runtime = false;
            rating = false;
            genre = info[0].trim();
          }

          if (movie.find('.info a:contains("Trailer")').length) {
            cloakedUrl = 'https://google.com' + movie.find('.info a:contains("Trailer")').attr('href');
            trailer = qs.parse(url.parse(cloakedUrl).query).q;
          } else {
            trailer = false;
          }

          if (movie.find('.info a:contains("IMDb")').length) {
            cloakedUrl = 'https://google.com' + movie.find('.info a:contains("IMDb")').attr('href');
            imdb = qs.parse(url.parse(cloakedUrl).query).q;
          } else {
            imdb = false;
          }

          var movieData = {
            id: movieId,
            name: movie.find('.name').text(),
            runtime: runtime,
            rating: rating,
            genre: genre,
            imdb: imdb,
            trailer: trailer,
            showtimes: []
          };

          // Remove non-ASCII characters.
          if (movieData.runtime) {
            movieData.runtime = movieData.runtime.replace(/[^\x00-\x7F]/g, '').trim();
          }

          if (movieData.rating) {
            movieData.rating = movieData.rating.replace(/[^\x00-\x7F]/g, '').trim();
          }

          if (movieData.genre) {
            movieData.genre = movieData.genre.replace(/[^\x00-\x7F]/g, '').trim();
          }

          // Google displays showtimes like "10:00  11:20am  1:00  2:20  4:00  5:10  6:50  8:10  9:40  10:55pm". Since
          // they don't always apply am/pm to times, we need to run through the showtimes in reverse and then apply the
          // previous (later) meridiem to the next (earlier) movie showtime so we end up with something like
          // ["10:00am", "11:20am", "1:00pm", ...].
          showtimes = movie.find('.times').text().split(' ');
          meridiem = false;

          showtimes = showtimes.reverse();
          for (var x in showtimes) {
            // Remove non-ASCII characters.
            showtime = showtimes[x].replace(/[^\x00-\x7F]/g, '').trim();
            match = showtime.match(/(am|pm)/);
            if (match) {
              meridiem = match[0];
            } else {
              showtime += meridiem;
            }

            showtimes[x] = showtime;
          }

          showtimes = showtimes.reverse();
          for (x in showtimes) {
            movieData.showtimes.push(showtimes[x].trim());
          }

          theaterData.movies.push(movieData);
        });

        theaters.push(theaterData);
      });

      // No pages to paginate, so return the theaters back.
      if ($('#navbar td a:contains("Next")').length === 0) {
        cb(null, theaters);
        return;
      }

      // Use the hidden API of getTheaters to pass in the next page and current
      // theaters.
      self.getTheaters(cb, ++page, theaters);
    });
  });
};

/**
 * @param {function} cb - Callback to handle the resulting movie object.
 * @returns {object}
 */
Showtimes.prototype.getMovie = function (mid, cb) {
  var self = this;

  var options = {
    url: self.baseUrl,
    qs: {
      near: self.location,
      mid: mid,
      date: (typeof self.date !== 'undefined') ? self.date : 0
    },
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

    var $ = cheerio.load(body, {
      decodeEntities: false
    });

    var cloakedUrl;
    var genre;
    var imdb;
    var rating;
    var runtime;
    var trailer;
    var director;
    var cast;
    var description;
    var info;
    var match;
    var meridiem;
    var showtime;
    var showtimes;
    var theaterId;
    var theaterData;

    if (!$('.showtimes')) {
      cb($('#results'));
      return;
    }

    var movie = $('.movie');

    // Movie info format: RUNTIME - RATING - GENRE - TRAILER - IMDB
    // Some movies don't have a rating, trailer, or IMDb pages, so we need
    // to account for that.
    // There is a br dividing the info from the director and actor info. Replacing it with
    // a new line makes it easier to split

    movie.find('.desc .info').not('.info.links').find('> br').replaceWith("\n");
    var infoArray = movie.find('.desc .info').not('.info.links').text().split('\n');

    info = infoArray[0].split(' - ');
    if (info[0].match(/(hr |min)/)) {
      runtime = info[0].trim();
      if (info[1].match(/Rated/)) {
        rating = info[1].replace(/Rated/, '').trim();
        if (typeof info[2] !== 'undefined') {
          if (info[2].match(/(IMDB|Trailer)/i)) {
            genre = false;
          } else {
            genre = info[2].trim();
          }
        } else {
          genre = false;
        }
      } else {
        rating = false;

        if (info[1].match(/(IMDB|Trailer)/i)) {
          genre = false;
        } else {
          genre = info[1].trim();
        }
      }
    } else {
      runtime = false;
      rating = false;
      genre = info[0].trim();
    }

    info = infoArray[1] ? infoArray[1].split(' - ') : undefined;
    if (info) {
      if (info[0].match(/Director:/)) {
        director = info[0].replace(/Director:/, '').trim();
      }
      if (info[1].match(/Cast:/)) {
        cast = info[1].replace(/Cast:/, '').trim().split(', ');
      }
    }

    // Longer descriptions can be split between two spans and displays a more/less link

    description = movie.find('span[itemprop="description"]').text();
    movie.find('#SynopsisSecond0').children().last().remove()
    description = description + movie.find('#SynopsisSecond0').text();
    description.replace('/"/', '');
    description = description.trim();

    if (movie.find('.info.links a:contains("Trailer")').length) {
      cloakedUrl = 'https://google.com' + movie.find('.info a:contains("Trailer")').attr('href');
      trailer = qs.parse(url.parse(cloakedUrl).query).q;
    } else {
      trailer = false;
    }

    if (movie.find('.info.links a:contains("IMDb")').length) {
      cloakedUrl = 'https://google.com' + movie.find('.info a:contains("IMDb")').attr('href');
      imdb = qs.parse(url.parse(cloakedUrl).query).q;
    } else {
      imdb = false;
    }

    var movieData = {
      id: mid,
      name: movie.find('h2[itemprop="name"]').text(),
      runtime: runtime,
      rating: rating,
      genre: genre,
      imdb: imdb,
      trailer: trailer,
      director: director,
      cast: cast,
      description: description,
      theaters: []
    };

    // Remove non-ASCII characters.
    if (movieData.runtime) {
      movieData.runtime = movieData.runtime.replace(/[^\x00-\x7F]/g, '').trim();
    }

    if (movieData.rating) {
      movieData.rating = movieData.rating.replace(/[^\x00-\x7F]/g, '').trim();
    }

    if (movieData.genre) {
      movieData.genre = movieData.genre.replace(/[^\x00-\x7F]/g, '').trim();
    }


    $('.theater').each(function (i, theater) {
      theater = $(theater);
      cloakedUrl = theater.find('.name a').attr('href');
      theaterId = cloakedUrl ? qs.parse(url.parse(cloakedUrl).query).tid : '';

      theaterData = {
        id: theaterId,
        name: theater.find('.name').text(),
        address: theater.find('.address').text(),
        showtimes: []
      };

      // Google displays showtimes like "10:00  11:20am  1:00  2:20  4:00  5:10  6:50  8:10  9:40  10:55pm". Since
      // they don't always apply am/pm to times, we need to run through the showtimes in reverse and then apply the
      // previous (later) meridiem to the next (earlier) movie showtime so we end up with something like
      // ["10:00am", "11:20am", "1:00pm", ...].
      showtimes = theater.find('.times').text().split(' ');
      meridiem = false;

      showtimes = showtimes.reverse();
      for (var x in showtimes) {
        // Remove non-ASCII characters.
        showtime = showtimes[x].replace(/[^\x00-\x7F]/g, '').trim();
        match = showtime.match(/(am|pm)/);
        if (match) {
          meridiem = match[0];
        } else {
          showtime += meridiem;
        }

        showtimes[x] = showtime;
      }

      showtimes = showtimes.reverse();
      for (x in showtimes) {
        theaterData.showtimes.push(showtimes[x].trim());
      }

      movieData.theaters.push(theaterData);
    });
    if (movieData.imdb) {
      var imdbID = movieData.imdb.substr(movieData.imdb.lastIndexOf('tt'));
      imdbID = imdbID.substr(0, imdbID.length - 1);
      memory_cache.wrap(imdbID, function (cache_cb) {
          var scraper = IMDBScraper();
          scraper.getMovie(imdbID, function (err, data) {
            if (data) {
              movieData.poster = data;
            }
            cache_cb(null, movieData);
          });
        },
        function (err, result) {
          cb(null, result);
        });
    }
    return;
  });
};

Showtimes.prototype.getMovies = function (cb) {
  var self = this;
  var page = 1;
  var movies = [];

  if (arguments.length > 1) {
    page = arguments[1];
    movies = arguments[2];
  }
  var options = {
    url: self.baseUrl,
    qs: {
      sort: 1,
      near: self.location,
      start: ((page - 1) * 10),
      date: (typeof self.date !== 'undefined') ? self.date : 0
    },
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

    var cloakedUrl;
    var genre;
    var imdb;
    var rating;
    var runtime;
    var trailer;
    var director;
    var cast;
    var description;
    var info;
    var match;
    var meridiem;
    var movieId;
    var showtime;
    var showtimes;
    var theaterId;
    var theaterData;

    if ($('.movie').length === 0) {
      cb($('#results').text());
      return;
    }
    console.log($('.movie').length);
    $('.movie').each(function (i, movie) {
      movie = $(movie);

      cloakedUrl = movie.find('.header h2[itemprop="name"] a').attr('href');
      movieId = qs.parse(url.parse(cloakedUrl).query).mid;
      // Movie info format: RUNTIME - RATING - GENRE - TRAILER - IMDB
      // Some movies don't have a rating, trailer, or IMDb pages, so we need
      // to account for that.
      movie.find('.desc .info').not('.info.links').find('> br').replaceWith("\n");
      var infoArray = movie.find('.desc .info').not('.info.links').text().split('\n');

      info = infoArray[0].split(' - ');
      if (info[0].match(/(hr |min)/)) {
        runtime = info[0].trim();
        if (info[1].match(/Rated/)) {
          rating = info[1].replace(/Rated/, '').trim();
          if (typeof info[2] !== 'undefined') {
            if (info[2].match(/(IMDB|Trailer)/i)) {
              genre = false;
            } else {
              genre = info[2].trim();
            }
          } else {
            genre = false;
          }
        } else {
          rating = false;

          if (info[1].match(/(IMDB|Trailer)/i)) {
            genre = false;
          } else {
            genre = info[1].trim();
          }
        }
      } else {
        runtime = false;
        rating = false;
        genre = info[0].trim();
      }

      info = infoArray[1] ? infoArray[1].split(' - ') : undefined;
      if (info) {
        if (info[0].match(/Director:/)) {
          director = info[0].replace(/Director:/, '').trim();
        }
        if (info[1].match(/Cast:/)) {
          cast = info[1].replace(/Cast:/, '').trim().split(', ');
        }
      }

      // Longer descriptions can be split between two spans and displays a more/less link
      description = movie.find('span[itemprop="description"]').text();
      movie.find('#SynopsisSecond0').children().last().remove()
      description = description + " " + movie.find('#SynopsisSecond0').text();
      description.replace('/"/', '');
      description = description.trim();

      if (movie.find('.info.links a:contains("Trailer")').length) {
        cloakedUrl = 'https://google.com' + movie.find('.info a:contains("Trailer")').attr('href');
        trailer = qs.parse(url.parse(cloakedUrl).query).q;
      } else {
        trailer = false;
      }

      if (movie.find('.info.links a:contains("IMDb")').length) {
        cloakedUrl = 'https://google.com' + movie.find('.info a:contains("IMDb")').attr('href');
        imdb = qs.parse(url.parse(cloakedUrl).query).q;
      } else {
        imdb = false;
      }

      var movieData = {
        id: movieId,
        name: movie.find('h2[itemprop="name"]').text(),
        runtime: runtime,
        rating: rating,
        genre: genre,
        imdb: imdb,
        trailer: trailer,
        director: director,
        cast: cast,
        description: description,
        theaters: []
      };

      // Remove non-ASCII characters.
      if (movieData.runtime) {
        movieData.runtime = movieData.runtime.replace(/[^\x00-\x7F]/g, '').trim();
      }

      if (movieData.rating) {
        movieData.rating = movieData.rating.replace(/[^\x00-\x7F]/g, '').trim();
      }

      if (movieData.genre) {
        movieData.genre = movieData.genre.replace(/[^\x00-\x7F]/g, '').trim();
      }

      movie.find('.theater').each(function (i, theater) {
        theater = $(theater);
        cloakedUrl = theater.find('.name a').attr('href');
        theaterId = cloakedUrl ? qs.parse(url.parse(cloakedUrl).query).tid : '';

        theaterData = {
          id: theaterId,
          name: theater.find('.name').text(),
          address: theater.find('.address').text(),
          showtimes: []
        };

        // Google displays showtimes like "10:00  11:20am  1:00  2:20  4:00  5:10  6:50  8:10  9:40  10:55pm". Since
        // they don't always apply am/pm to times, we need to run through the showtimes in reverse and then apply the
        // previous (later) meridiem to the next (earlier) movie showtime so we end up with something like
        // ["10:00am", "11:20am", "1:00pm", ...].
        showtimes = theater.find('.times').text().split(' ');
        meridiem = false;

        showtimes = showtimes.reverse();
        for (var x in showtimes) {
          // Remove non-ASCII characters.
          showtime = showtimes[x].replace(/[^\x00-\x7F]/g, '').trim();
          match = showtime.match(/(am|pm)/);
          if (match) {
            meridiem = match[0];
          } else {
            showtime += meridiem;
          }

          showtimes[x] = showtime;
        }

        showtimes = showtimes.reverse();
        for (x in showtimes) {
          theaterData.showtimes.push(showtimes[x].trim());
        }

        movieData.theaters.push(theaterData);
      });
      if (description.length > 0) {
        movies.push(movieData);
      }
    });
    console.log($('#navbar td:last-child a').text());
    // No pages to paginate, so return the theaters back.
    if ($('#navbar td:last-child a').text().length !== 4) {
      cb(null, movies);
      return;
    }

    // Use the hidden API of getMovies to pass in the next page and current
    // movies.
    self.getMovies(cb, ++page, movies);

    return;
  });
};

module.exports = Showtimes;

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

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));

app.get('/', function (request, response) {
  response.send('');
});

app.get('/showtimes', function (request, response) {
  var zipcode = request.query.zipcode;
  var city = request.query.city;
  var date = request.query.date ? request.query.date : 0;
  var now = new Date();
  now.setDate(now.getDate() + date);
  if (request.query.lat && request.query.lon) {
    var cache_key = 'showtimes:city:' + city + 'date:' + now.getMonth() + now.getDate() + now.getFullYear();
    memory_cache.wrap(cache_key, function (cache_cb) {
      var s = Showtimes(request.query.lat + "," + request.query.lon, {
        date: date
      });
      s.getTheaters(function (err, theaters) {
        if (theaters) {
          cache_cb(null, theaters)
        }
      });

    }, function (err, result) {
      response.setHeader('Cache-Control', 'public, max-age=' + '60*60'); // one year
      response.send(result ? result : err);
    });
  } else if (zipcode) {
    var s = Showtimes(zipcode, {
      date: date
    });
    s.getTheaters(function (err, theaters) {
      response.send(theaters ? theaters : err);
    });
  }
});

app.get('/movies', function (request, response) {
  var zipcode = request.query.zipcode;
  var city = request.query.city;
  var date = request.query.date ? request.query.date : 0;
  var now = new Date();
  now.setDate(now.getDate() + date);

  if (request.query.lat && request.query.lon) {
    var cache_key = 'movies:city:' + city + 'date:' + now.getMonth() + now.getDate() + now.getFullYear();
    memory_cache.wrap(cache_key, function (cache_cb) {
      var s = Showtimes(request.query.lat + "," + request.query.lon, {
        date: date
      });
      bugsnag.autoNotify(function () {
        s.getMovies(function (err, movies) {
          if (movies) {
            cache_cb(null, movies)
          }
        });
      });
    }, function (err, result) {
      response.setHeader('Cache-Control', 'public, max-age=' + '60*60'); // one year
      response.send(result ? result : err);
    });
  } else if (zipcode) {
    var s = Showtimes(zipcode, {
      date: date
    });
    s.getTheaters(function (err, theaters) {
      response.send(theaters ? theaters : err);
    });
  }
});

app.get('/movie/:id?', function (request, response) {
  var mid = request.params.id;
  var zipcode = request.query.zipcode;
  var city = request.query.city;
  var date = request.query.date ? request.query.date : 0;
  var now = new Date();
  now.setDate(now.getDate() + date);

  if (request.query.lat && request.query.lon) {
    var cache_key = 'movie:mid:' + mid + ':city:' + city + ":date:" + now.getMonth() + now.getDate() + now.getFullYear();
    memory_cache.wrap(cache_key, function (cache_cb) {
      var s = Showtimes(request.query.lat + "," + request.query.lon, {
        date: date
      });
      s.getMovie(mid, function (err, theaters) {
        if (theaters) {
          cache_cb(null, theaters);
        }
      });
    }, function (err, result) {
      response.setHeader('Cache-Control', 'public, max-age=' + '60*60'); // one year
      response.send(result ? result : err);
    });
  }
});

app.listen(app.get('port'), function () {
  console.log("Node app is running at localhost:" + app.get('port'));
});