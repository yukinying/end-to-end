var protobuf = require('protocol-buffers');
var fs = require('fs');
var atob = require('atob');

var messages = protobuf(fs.readFileSync(__dirname + '/t.proto'))


var buf = [10,5,121,97,104,111,111,16,223,5,26,32,129,114,26,236,236,45,92,101,204,117,108,197,170,226,163,187,225,117,113,122,90,92,38,30,180,228,139,151,216,13,52,2,34,11,8,213,153,244,178,5,16,228,128,216,98,42,64,224,216,31,84,81,173,197,99,34,251,103,170,42,160,58,194,90,247,6,137,194,226,33,164,11,217,7,248,224,158,4,197,74,214,80,230,254,158,192,204,78,46,214,130,218,190,23,18,174,2,45,204,149,230,240,187,11,170,55,12,64,8,234,251,50,0];

/*

var buf = messages.Test.encode(ex)

console.log('test message', ex)
console.log('encoded test message', buf)

*/
//console.log(messages);

//console.log(messages.EpochHead.decode.toString());

console.log('encoded test message decoded', JSON.stringify(messages.EpochHead.decode(buf)))
