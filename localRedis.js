const redis = require("redis");
const config = require('./config');
const client = redis.createClient({ host: 'localhost' });

client.on('error', function(error) {
  console.log('Some problem connecting to local redis');
});



module.exports = client;