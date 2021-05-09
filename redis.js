const redis = require("redis");
const config = require('./config');
const client = redis.createClient({ host: config.redis.host, port: config.redis.port, password: config.redis.pass });

client.on('error', function(error) {
  console.log('Some problem connecting to redis');
});



module.exports = client;