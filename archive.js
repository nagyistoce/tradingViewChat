var request = require('superagent');
var _ = require('lodash');
var util = require('util');
var colors = require('colors');
var fs = require('fs');

var currentPage = 1;
var rowWidth = process.stdout.getWindowSize()[0];
var output = fs.createWriteStream('./output.txt');

var usernameWidth = 50;
function makeReq(page, cb) {
  var offset = (page - 1) * 31;
  request
    .get("https://www.tradingview.com/conversation-status")
    .query({room: 'bitcoin', offset: offset, _rand: Math.random()})
    .end(function(err, res){
      if (err) console.error(err);
      _.each(res.body.messages, function(msg) {
        var username = util.format('%s <%s>', msg.username.underline.cyan, msg.channel);
        while(username.length < usernameWidth) username += ' ';
        var text = splitAtLength(msg.text, rowWidth - usernameWidth);
        var printMe = util.format("%s: %s", username.underline.cyan, text.green);
        printMe += printRight('[' + new Date(msg.time || Date.now()).toUTCString() + ']').gray;
        console.log(printMe);
        output.write(printMe + '\n');
      });
      setTimeout(function() {
        makeReq(++page);
      }, 500);
    });
}


makeReq(1);

function printRight(str) {
  var color = '99';
  return '\033[s' + // save current position
         '\033[' + rowWidth + 'D' + // move to the start of the line
         '\033[' + (rowWidth - str.length) + 'C' + // align right
         '\033[' + color + 'm' + str + '\033[39m' +
         '\033[u'; // restore current position
}

function splitAtLength(str, len) {
  var remainingLen = str.length;
  var out = [];
  while (remainingLen > 0) {
    out.push(str.slice(len * out.length, len * (out.length + 1)))
    remainingLen -= len;
  }
  return out.join('\n                       ');
}
