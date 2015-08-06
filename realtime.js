var request = require('superagent');
var _ = require('lodash');
var util = require('util');
var colors = require('colors');
var fs = require('fs');
var through = require('through2');
var JSONStream = require('JSONStream');
var split = require('split');
var persistentHTTPStream = require('./lib/persistentHTTPStream');
var settings = require('./settings');

var rowWidth = process.stdout.getWindowSize()[0];

function init(channel) {
  var TVStream = persistentHTTPStream(settings.endpoint, settings.headers)
  // Catches split datagrams
  .pipe(split())
  // Filter SSE control sequences
  .pipe(filterES)
  .pipe(jsonParse)
  // Filter by channel. Send '*' to ignore filter.
  .pipe(filterChannel(channel))

  // Print all to terminal
  TVStream.pipe(formatForTerminal).pipe(process.stdout);
  // Filter mentions and send those to webhook.
  TVStream.pipe(filterMentions).on('data', sendToWebhook);
}

function filterChannel(channel) {
  return through.obj(function(chunk, enc, callback) {
    if (chunk.text && (chunk.text.channel === channel || channel === '*')) {
      try {
        var out = chunk.text.content.data;
        if (chunk.text.content.idea) {
          out = chunk.text.content.idea.data;
          out.text = out.image_middle + ": " + out.desc;
          out.username = out.user.username; // ???
        }
        out.channel = chunk.text.channel;
        if (out.text && out.username) this.push(out); // catches message deletes, etc
      } catch(e) {
        console.log("Unexpected message format: " + chunk);
      }
    }
    callback();
  })
}

function sendToWebhook(msg) {
  var channel = msg.channel.replace('chat_', '');
  var link = settings.endpointHTMLLink + channel;
  request
  .post(settings.hookURL)
  .send({
    channel: '#social-media',
    text: util.format("<%s|Mention on TradingView:> \n> *%s* _<%s>_: %s", link, msg.username, channel, msg.text),
    username: 'TradingView',
    icon_emoji: ':tradingview:'
  })
  .end(function(err) {
    if (err) console.error("Unable to send to slack webhook! " + err);
  })
}

var filterES = through(function(chunk, enc, callback) {
  var data = chunk.toString();
  // Filter out SSE control seqs
  if (data && data[0] !== ':' || !data) {
    var newData = data.replace(/^data\:\ /, ''); // messages are prefixed with data:
    this.push(newData);
  }
  callback();
});

var filterRegex = new RegExp(settings.mentionFilter, 'i');
var filterMentions = through.obj(function(chunk, enc, callback) {
  if (filterRegex.test(chunk.text)) {
    this.push(chunk);
  }
  callback();
});

// TODO move to JSONStream, this is better err handling though
var jsonParse = through.obj(function(chunk, enc, callback) {
  try {
    this.push(JSON.parse(chunk.toString()));
  } catch(e) {
    console.error("Unable to parse: " + chunk.toString(), e);
  }
  callback();
})

var formatForTerminal = through.obj(function(chunk, enc, callback) {
  this.push(terminalMessage(chunk));
  callback();
});

var usernameWidth = 35;
var dateLength = 33;
var colorAddsPadding = 19; // colors add this many characters to the total
function terminalMessage(msg) {
  var username = util.format('%s <%s>', msg.username.underline.cyan, msg.channel);
  while(username.length < usernameWidth + colorAddsPadding) username += ' ';
  var text = splitAtLength(msg.text, rowWidth - (usernameWidth + 1 + dateLength));
  var printMe = util.format("%s: %s", username.underline.cyan, text.green);
  printMe += printRight('[' + new Date(msg.time || Date.now()).toUTCString() + ']').gray;
  return printMe + '\n';
}

function printRight(str) {
  var color = '99';
  return '\033[s' + // save current position
         '\033[' + rowWidth + 'D' + // move to the start of the line
         '\033[' + (rowWidth - str.length) + 'C' + // align right
         '\033[' + color + 'm' + str + '\033[39m' +
         '\033[u'; // restore current position
}

var joiner = '\n';
// Plus 3 - \n and ': '
while(joiner.length < usernameWidth + 3) joiner += ' ';
function splitAtLength(str, len) {
  var remainingLen = str.length;
  var out = [];
  while (remainingLen > 0) {
    out.push(str.slice(len * out.length, len * (out.length + 1)))
    remainingLen -= len;
  }
  return out.join(joiner);
}

init(settings.channel);

var testData = {
  "id": 22021,
  "channel": "public",
  "text": {
    "content": {
      "action": "message",
      "data": {
        "username": "IvanLabrie",
        "top_user_info": {
          "position": 4,
          "badge": {
            "class": "position-4 month",
            "title": "Monthly top author"
          },
          "period": "month"
        },
        "symbol": "FX:USDCAD",
        "time": "Thu Aug 6 16:24:32 2015 UTC",
        "is_moderator": false,
        "is_staff": false,
        "id": "863ea88f-9559-4605-930a-4f7d60facfb4",
        "user_id": 87140,
        "room": "c8BzrhGRvXxGXWnJ",
        "pro_plan": "pro",
        "meta": {
          "text": ""
        },
        "user_pic": "https:\/\/s3.amazonaws.com\/tradingview\/userpics\/87140.png",
        "text": "then you'd have to go with all bars in that leg",
        "type": "",
        "is_pro": true
      }
    },
    "channel": "chat_c8BzrhGRvXxGXWnJ"
  }
};

