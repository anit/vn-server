const fetch = require('node-fetch');
const redisClient = require('./redis');
const utils = require('./utils');
const jwt = require('jsonwebtoken');
const config = require('./config');
const NodeCache = require( "node-cache" );
const myCache = new NodeCache({ stdTTL: 100, checkperiod: 120 });
const localRedis = require('./localRedis');

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

const getAvailableCenters = (token, districtId, date, shud18, shud45) => {
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
    .then(async (json) => {
      if (!json) reject('Something went wrong in making json of available centers');
      else resolve([
        shud18 && await filterOutDuplicates(parseAvailableCenters(json, 18)),
        shud45 && await filterOutDuplicates(parseAvailableCenters(json, 45))
      ]); 
    })
    .catch(e => { console.log('Error getting available centers: ', e); reject(e); });
  });
};


const parseAvailableCenters = (json, minAge) => {
  if (!json.centers) return [];

  return json.centers.reduce((allCenters, center) => {
    return allCenters.concat(...center.sessions.filter(x => {
      return x.min_age_limit == minAge && (x.available_capacity_dose1 > 1 || x.available_capacity_dose2 > 1);
    }).map(x => {
      return { 
        minAge, 
        center_id: center.center_id,
        center: center.name, 
        district: center.district_name, 
        pincode: center.pincode, 
        date: x.date, 
        vaccine: x.vaccine, 
        available1: x.available_capacity_dose1 < 0 ? 0 : x.available_capacity_dose1, 
        available2: x.available_capacity_dose2 < 0 ? 0 : x.available_capacity_dose2 
      }
    }));
  }, []);
};


const filterOutDuplicates = async (centers) => {
  return await Promise.all(centers.filter(async (c) => {
    const val = await new Promise((resolve, reject) => {
      localRedis.get(`${c.center_id}-${c.pincode}-${c.minAge}`, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
    try {
      if (val == `${c.available1}-${c.available2}`) {
        console.log('filtering out ', c.center)
        return false;
      }

      console.log('Letting go', c.center);
      localRedis.setex(`${c.center_id}-${c.pincode}-${c.minAge}`, 3000, `${c.available1}-${c.available2}`);
      return true;
    } catch (e) {
      console.log('Error redising  is  ', e)

      console.log('Letting go', c.center);
      localRedis.setex(`${c.center_id}-${c.pincode}-${c.minAge}`, 3000, `${c.available1}-${c.available2}`);
      return true;
    }
  }));
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
  if (!json || !json.length) return;

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


const memCount = (chat_id) => {
  return fetch(`https://api.telegram.org/bot${config.tgBot.token}/getChatMembersCount?chat_id=${chat_id}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  }).then(res => res.json());
}


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


module.exports = { notifyTelegram, tgMessage, getAvailableCenters, parseAvailableCenters, getToken, fetchDistricts, filterOutDuplicates, memCount }