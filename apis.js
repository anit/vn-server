const fetch = require('node-fetch');
const redisClient = require('./redis');
const utils = require('./utils');
const districts = require('./districts');
const jwt = require('jsonwebtoken');
const config = require('./config');

const getToken = () => {
  return new Promise((resolve, reject) => {
    redisClient.get('token', (err, val) => {
      if (err) return reject('Error: Not able to read token from redis');
      try {
        const obj = jwt.decode(val);
        if (!obj) return reject(`Invalid Token: ${val}`);
        if (Date.now() > obj.exp*1000) return reject(`Error: Expired token ${val}`);
  
        resolve({token: val});
      } catch(e) {
        reject(`Error: ${e.toString()}`);
      }
    });  
  })
}

const getAvailableCenters = (token, districtId, date, minAge = 18) => {
  let url = `https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict?district_id=${districtId}&date=${date}`;
  let headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ReactNativeDebugger/0.11.8 Chrome/80.0.3987.165 Electron/8.5.2 Safari/537.36'
  };

  if (token) {
    headers ['authorization'] = `Bearer ${token}`;
    url = `https://cdn-api.co-vin.in/api/v2/appointment/sessions/calendarByDistrict?district_id=${districtId}&date=${date}`;
  }

  return new Promise((resolve, reject) => {
    fetch(url, {
      method: 'GET',
      headers 
    })
    .then(response => { return response.json(); })
    .then(json => {
      if (json) resolve(parseAvailableCenters(json, minAge));
      else reject('Something went wrong in making json of available centers');
    })
    .catch(e => { console.log('Error getting available centers: ', e); reject(e); });
  });
};


const parseAvailableCenters = (json, minAge) => {
  if (!json.centers) return [];

  return json.centers.reduce((allCenters, center) => {
    return allCenters.concat(...center.sessions.filter(x => {
      return x.min_age_limit == minAge && x.available_capacity >= 1;
    }).map(x => {
      return { center: center.name, district: center.district_name, pincode: center.pincode, date: x.date, vaccine: x.vaccine, available: x.available_capacity }
    }));
  }, []);
};


const notifyTelegram = (json, chat_id) => {
  var reply_markup =  {
    inline_keyboard: [[
      {
        text: 'Open Cowin',
        url: 'https://selfregistration.cowin.gov.in'            
      }]
    ]
  };

  const text = tgMessage(json);
  
  return fetch(`https://api.telegram.org/bot${config.tgBot.token}/sendMessage?parse_mode=html`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ chat_id, text, reply_markup })
  });
}


const tgMessage = (json) => [
  '<b>New available slots</b> \n\n',
  ...json.map(x => [
    `📍 Pin Code <b>${x.pincode}</b>`,
    `🪑 Available <b>${x.available}</b>`, 
    `🗓 ${x.date}`,
    `💉 ${utils.capitalize(x.vaccine) || '?'}`,
    `🏥 ${x.center}, <b>${x.district}</b>\n\n`,
  ].join('\n')),
  '•••••\n\n'
].join('');


module.exports = { notifyTelegram, tgMessage, getAvailableCenters, parseAvailableCenters, getToken }