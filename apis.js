const fetch = require('node-fetch');
const redisClient = require('./redis');
const utils = require('./utils');
const jwt = require('jsonwebtoken');
const config = require('./config');
const NodeCache = require( "node-cache" );
const localRedis = require('./localRedis');
const { promisify } = require('util');


const setRedisKey = (key, newValue, timeout) => {
  return new Promise((resolve, reject) => {
    localRedis.del(key, () => {
      localRedis.setex(key, timeout || 60*60*3, newValue, (err, res) => {
        if (err) reject(err);
        else resolve();
      });
    });
  })
}

const delRedisKey = (key) => {
  return new Promise((resolve, reject) => {
    localRedis.del(key, (err) => {
      if (err) reject(err);
      else resolve();
    });
  })
} 


const matchingRedisKey = async (pattern, isRemoteRedis) => {
  const scan =  isRemoteRedis ? promisify(redisClient.scan).bind(redisClient) :promisify(localRedis.scan).bind(localRedis);
  const found = [];
  let cursor = '0';

  do {
    const reply = await scan(cursor, 'MATCH', pattern);

    cursor = reply[0];
    found.push(...reply[1]);
  } while (cursor !== '0');

  return found;
}


const getRedisKey = (key, isRemoteRedis) => {
  let redisC = isRemoteRedis ? redisClient : localRedis;
  return new Promise((resolve, reject) => {
    redisC.get(key, (err, res) => {
      if (err) { console.log('rejecting because of ', key); reject(err); }
      else { resolve(res); }
    });
  });
}

const filterOutDuplicates = async (centers) => {
  if (!centers) return;

  const finalCenters = [];
  for (var c of centers) {
    const rkey = `${c.center_id}-${c.pincode}-${c.date}-${c.minAge}-${c.vaccine}`;
    const val = await getRedisKey(rkey);
    try {
      if (val && val == `${c.available1}-${c.available2}`) continue;
      await setRedisKey(rkey, `${c.available1}-${c.available2}`);
      finalCenters.push(c);
    } catch (e) {
      finalCenters.push(c);
      console.log('Error redising  is  ', c, e);
    }
  }
  return finalCenters;
}

const fetchDistricts = (stateId) => {
  return fetch(`https://cdn-api.co-vin.in/api/v2/admin/location/districts/${stateId}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ReactNativeDebugger/0.11.8 Chrome/80.0.3987.165 Electron/8.5.2 Safari/537.36'
    }
  })
  .then(response => { return response.json(); })
}


const notifyTelegram = (json, chat_id) => {
  if (!json.length || !chat_id) return;

  var reply_markup =  {
    inline_keyboard: [[
      {
        text: 'Open Cowin',
        url: 'https://selfregistration.cowin.gov.in'            
      }]
    ]
  };

  // const text = (chat_id == '@vaccinepune' || chat_id == '@vaccinebarodaanand' || chat_id == '@vaccineahmedabad') ? tgMessageUpgraded(json) : tgMessage(json);
  // const text = tgMessage(json);

  const text = tgMessageUpgraded(json);

  return fetch(`https://api.telegram.org/bot${config.tgBot.token}/sendMessage?parse_mode=html`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ chat_id, text, reply_markup })
  });
}


const memCount = (chat_id) => {
  return fetch(`https://api.telegram.org/bot${config.tgBot.token}/getChatMembersCount?chat_id=${chat_id}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  }).then(res => res.json());
}

const tgMessageUpgraded = (json) => [
  '<b>New available slots</b> \n\n',
  ...json.map(x => [
    `📍 Pin Code <b>${x.pincode}</b>`,
    x.available1 > 1 ? `🪑 Dose 1️⃣ Available <b>${x.available1}</b> (<a href="${`https://book-r41.netlify.app?cid=${x.center_id}&slot=${x.slots}&date=${x.date}&cn=${x.center}&sid=${x.session_id}&dose=1&age=${x.minAge}`}">Book [Beta]</a>)` : '',
    x.available2 > 1 ? `🪑 Dose 2️⃣ Available <b>${x.available2}</b> (<a href="${`https://book-r41.netlify.app?cid=${x.center_id}&slot=${x.slots}&date=${x.date}&cn=${x.center}&sid=${x.session_id}&dose=2&age=${x.minAge}`}">Book [Beta]</a>)` : '', 
    `🗓 ${x.date}`,
    `💉 ${utils.capitalize(x.vaccine) || '?'}`,
    `🏥 ${x.center}, <b>${x.district}</b>\n\n`,
  ].filter(x => !!x).join('\n')),
  '•••••\n\n'
].join('');


const tgMessage = (json) => [
  '<b>New available slots</b> \n\n',
  ...json.map(x => [
    `📍 Pin Code <b>${x.pincode}</b>`,
    x.available1 > 1 ? `🪑 Dose 1️⃣ Available <b>${x.available1}</b>` : '',
    x.available2 > 1 ? `🪑 Dose 2️⃣ Available <b>${x.available2}</b>` : '', 
    `🗓 ${x.date}`,
    `💉 ${utils.capitalize(x.vaccine) || '?'}`,
    `🏥 ${x.center}, <b>${x.district}</b>\n\n`,
  ].filter(x => !!x).join('\n')),
  '•••••\n\n'
].join('');


module.exports = { notifyTelegram, tgMessage, filterOutDuplicates, fetchDistricts, memCount, setRedisKey, delRedisKey, matchingRedisKey, getRedisKey }