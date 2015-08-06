var inject = require('reconnect-core');
var request = require('superagent');
var stream = require('stream');
var through = require('through2');
// Create an SSE HTTP Stream (to connect to TV)
module.exports = function createStream(endpoint, headers) {
  var reconnect = inject(function(endpoint) {
    return request.get(endpoint).set(headers || {}).send();
  })

  var outStream = new stream.PassThrough();

  var re = reconnect({}, function (requestStream) {
    // Create a fake stream to pass data to. This gets superagent moving, but
    // prevents the 'end' event from cascading so we can reconnect.
    var anotherPassThrough = new stream.PassThrough();
    anotherPassThrough.on('data', outStream.write.bind(outStream));
    requestStream.pipe(anotherPassThrough);


    setInterval(function() {
      if (Math.random() < 0.1) requestStream.abort();
    }, 1000);
  })
  .on('connect', function (con) {
    console.log('connected');
  })
  .on('reconnect', function (n, delay) {
    console.log('reconnecting to TV.');
  })
  .on('disconnect', function (err) {
    console.log('disconnected from TV.', err);
  })
  .on('error', function (err) {
    console.error('Stream error:' + err);
  })
  .connect(endpoint);

  return outStream;
};
