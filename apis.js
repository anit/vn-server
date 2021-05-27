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

const getAvailableCenters = (token, districtId, date, shud18, shud45, shud18_2) => {
  let url = `https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict?district_id=${districtId}&date=${date}`;
  let headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
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
    .then(response => {
      // console.log(`Cached is ${response.headers.get('x-cache')} for ${districtId}`);
      if (!response.ok) throw new Error(`Error ${response.status} while fetching for ${districtId}: ${response.statusText  }`) 
      if (response.ok) return response.json(); 
    })
    .then(async (json) => {
      if (!json) reject('Something went wrong in making json of available centers');
      if (districtId == 307) console.log('Kochi data is ', parseAvailableCenters(json, 18));

      else resolve([
        shud18 && await parseAvailableCenters(json, 18, 1),
        shud45 && await parseAvailableCenters(json, 45),
        shud18_2 && await parseAvailableCenters(json, 18, 2)
      ]); 
    })
    .catch(e => { console.log('Error getting available centers: ', e); reject(e); });
  });
};


const parseAvailableCenters = (json, minAge, dose) => {
  if (!json.centers) return [];

  const centers = json.centers.reduce((allCenters, center) => {
    return allCenters.concat(...center.sessions.filter(x => {
      if (dose == 1) return x.min_age_limit == minAge && (x.available_capacity_dose1 > 1);
      else if (dose == 2) return x.min_age_limit == minAge && (x.available_capacity_dose2 > 1);
      return x.min_age_limit == minAge && (x.available_capacity_dose1 > 1 || x.available_capacity_dose2 > 1);
    }).map(x => {
      return { 
        minAge, 
        center_id: center.center_id,
        session_id: x.session_id,
        center: center.name, 
        slots: x.slots,
        district: center.district_name, 
        pincode: center.pincode, 
        date: x.date, 
        vaccine: x.vaccine, 
        available1: (x.available_capacity_dose1 < 1 || dose == 2) ? 0 : x.available_capacity_dose1, 
        available2: (x.available_capacity_dose2 < 1 || dose == 1) ? 0 : x.available_capacity_dose2 
      }
    }));
  }, []);

  return centers;
};
const updateRedisKey = (key, newValue, timeout) => {
  return new Promise((resolve, reject) => {
    localRedis.del(key, (err, res) => {
      if (err) reject(err);
      else localRedis.setex(key, timeout || 3000, newValue, (err, res) => {
        if (err) reject(err);
        else resolve();
      });
    });
  })
}

const getRedisKey = (key) => {
  return new Promise((resolve, reject) => {
    localRedis.get(key, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}


const filterOutDuplicates = async (centers) => {
  if (!centers) return;

  const finalCenters = [];
  for (var c of centers) {
    const rkey = `${c.center_id}-${c.pincode}-${c.date}-${c.minAge}`;
    const val = await getRedisKey(rkey);
     
    try {
      if (val && val == `${c.available1}-${c.available2}`) continue;
      await updateRedisKey(rkey, `${c.available1}-${c.available2}`);
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
    x.available1 > 1 ? `🪑 Dose 1️⃣ Available <b>${x.available1}</b> (<a href="${`https://vn-booker.tunnelto.dev?cid=${x.center_id}&slot=${x.slots}&date=${x.date}&cn=${x.center}&sid=${x.session_id}&dose=1&age=${x.minAge}`}">Book [Beta]</a>)` : '',
    x.available2 > 1 ? `🪑 Dose 2️⃣ Available <b>${x.available2}</b> (<a href="${`https://vn-booker.tunnelto.dev?cid=${x.center_id}&slot=${x.slots}&date=${x.date}&cn=${x.center}&sid=${x.session_id}&dose=2&age=${x.minAge}`}">Book [Beta]</a>)` : '', 
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


module.exports = { notifyTelegram, tgMessage, getAvailableCenters, parseAvailableCenters, getToken, fetchDistricts, filterOutDuplicates, memCount, updateRedisKey }