'use strict';

var request = require('request');
var cheerio = require('cheerio');
var qs = require('querystring');
var url = require('url');

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
Showtimes.prototype.getTheaters = function(cb) {
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

    request(options, function(error, response, body) {
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

        $('.theater').each(function(i, theater) {
            theater = $(theater);

            cloakedUrl = theater.find('.desc h2.name a').attr('href');
            theaterId = qs.parse(url.parse(cloakedUrl).query).tid;

            info = theater.find('.desc .info').text().split(' - ');

            theaterData = {
                id: theaterId,
                name: theater.find('.desc h2.name').text(),
                address: info[0] ? info[0].trim() : '',
                phoneNumber: info[1] ? info[1].trim() : '',
                movies: []
            };

            theater.find('.showtimes .movie').each(function(j, movie) {
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
};

/**
 * @param {function} cb - Callback to handle the resulting movie object.
 * @returns {object}
 */
Showtimes.prototype.getMovie = function(mid, cb) {
    var self = this;
    var theaters = [];

    var options = {
        url: self.baseUrl,
        sort: 1,
        qs: {
            mid: mid,
            date: (typeof self.date !== 'undefined') ? self.date : 0
        },
        headers: {
            'User-Agent': self.userAgent
        }
    };

    request(options, function(error, response, body) {
        if (error || response.statusCode !== 200) {
            if (error === null) {
                cb('Unknown error occured while querying theater data from Google Movies.');
            } else {
                cb(error);
            }

            return;
        }

        var $ = cheerio.load(body);

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

        $('.theater').each(function(i, theater) {
            theater = $(theater);

            theaterData = {
                id: '0',
                name: theater.find('.name').text(),
                phoneNumber: theater.find('.address').text(),
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

            theaters.push(theaterData);
        });
        cb(null, theaters);

        return;
    });
};

module.exports = Showtimes;

var bugsnag = require("bugsnag");
bugsnag.register("57c9b974a3ace125470d8943e5f8da1e");

var express = require('express');
var app = express();
app.use(bugsnag.requestHandler);
app.use(bugsnag.requestHandler);
var cache_manager = require('cache-manager');
var memory_cache = cache_manager.caching({store: 'memory', max: 1000, ttl: 900/*seconds*/});

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));

app.get('/', function(request, response) {
  response.send("Hey");
});

app.get('/showtimes', function (request, response) {
        var zipcode = request.query.zipcode;
	    var city = request.query.city;
        var date = request.query.date ? request.query.date : 0;
        var now = new Date();
        now.setDate(now.getDate() + date);

        if (request.query.lat && request.query.lon) {
            var cache_key = 'showtimes:city:' + city + "date:" + now.getMonth() + now.getDate() + now.getFullYear();
            memory_cache.wrap(cache_key, function(cache_cb) {
                    var s = Showtimes(request.query.lat + "," + request.query.lon, { date: date });
                              s.getTheaters(function (err, theaters) {
                                    if (theaters){
                                        cache_cb(null, theaters)
                                    }
                                });
                             
                              }, function(err, result) {
                                response.send(result ? result : err);
                              });
        }else if(zipcode){
            var s = Showtimes(zipcode, { date: date });
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
            var cache_key = 'movies:city:' + city + "date:" + now.getMonth() + now.getDate() + now.getFullYear();
            memory_cache.wrap(cache_key, function(cache_cb) {
                              var s = Showtimes(request.query.lat + "," + request.query.lon, { date: date });
                              s.getTheaters(function (err, theaters) {
                                  bugsnag.autoNotify(function() {
                                    if (theaters){
                                        var movies = Array();
                                        theaters.forEach(function(element, index, array) {
                                            movies.push(element.movies);
                                        });
                                        cache_cb(null, movies)
                                    }
                                  });
                                });
                              }, function(err, result) {
                                response.send(result ? result : err);
                              });
        }else if(zipcode){
            var s = Showtimes(zipcode, { date: date });
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
            var cache_key = 'showtime:mid:' + mid + ':city:' + city + ":date:" + now.getMonth() + now.getDate() + now.getFullYear();
            memory_cache.wrap(cache_key, function(cache_cb) {
                              var s = Showtimes(request.query.lat + "," + request.query.lon, { date: date });
                              s.getMovie(mid, function (err, theaters) {
                                    if (theaters){
                                        cache_cb(null, theaters);
                                    }
                                });
                              }, function(err, result) {
                                response.send(result ? result : err);
                              });
        }
});

app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'));
});
