const fetch = require('node-fetch');
const redisClient = require('./redis');
const utils = require('./utils');
const jwt = require('jsonwebtoken');
const config = require('./config');
const NodeCache = require( "node-cache" );
const myCache = new NodeCache({ stdTTL: 100, checkperiod: 120 });
const localRedis = require('./localRedis');
const CryptoJS = require("crypto-js");
const sha256 = require('crypto-js/sha256');
const { inflxCwApi, inflxScheduled } = require('./influx');



const commonHeaders = {
  'authority': 'cdn-api.co-vin.in',
  'pragma': 'no-cache',
  'cache-control': 'no-cache',
  'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="90", "Google Chrome";v="90"',
  'accept': 'application/json, text/plain, */*',
  'sec-ch-ua-mobile': '?0',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.85 Safari/537.36',
  'content-type': 'application/json',
  'origin': 'https://selfregistration.cowin.gov.in',
  'sec-fetch-site': 'cross-site',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty',
  'referer': 'https://selfregistration.cowin.gov.in/',
  'accept-language': 'en-US,en;q=0.9,hi;q=0.8,mr;q=0.7,gu;q=0.6',
  'Content-Type': 'application/json; charset=UTF-8'
};


const getSecret = () => {
  return CryptoJS.AES.encrypt(config.cowinId, config.cowinKey).toString();
}

const requestOTP = (mobile) => {
  const secret = getSecret();
  return new Promise((resolve, reject) => {
    fetch('https://cdn-api.co-vin.in/api/v2/auth/generateMobileOTP', {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify({ mobile: mobile, secret })
    })
    .then(response => {
      if (!response.ok) {
        response.text().then(text => inflxCwApi({ api: 'generateMobileOTP', status: response.status, text }));
        throw new Error(response.statusText);
      }
      return response.json();
    })
    .then(json => {
      if (json && json.txnId) resolve(json.txnId);
      else reject('No response got from CoWin');
    })
    .catch(e => { console.log('Error retrieving otp: ', e); reject(e); });
  }) 
}

const validateOTP = async (otp, txnId) => {
  const hash = sha256(otp).toString()
  return new Promise((resolve, reject) => {
    fetch('https://cdn-api.co-vin.in/api/v2/auth/validateMobileOtp', {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify({ otp: hash, txnId })
    })
    .then(response => {
      if (!response.ok) {
        response.text().then(text => inflxCwApi({ api: 'validateMobileOtp', status: response.status, text }));
        throw new Error(response.statusText);
      }
      return response.json();
    })
    .then(json => {
      if (json) { 
        resolve(json);
        setToken(json.token);
      }
      else reject('No response from CoWin');
    })
    .catch(e => { console.log('Error validating otp: ', e); reject(e); });
  }) 
}

const setToken = (token) => {
  new Promise ((resolve, reject) => {
    try {
      const obj = jwt.decode(token);
      if (Date.now() > obj.exp*1000) return;
  
      const expiry = obj.exp - (Date.now()/1000) - 5;
      redisClient.setex('token', Math.floor(expiry), token, err => {
        if (err) reject();
        resolve({ token });
      });
    } catch (e) { reject(`Error: Something went wrong ${e.toString()}`) }
  }); 
}


const getBeneficiaries = (token) => {
  const url = 'https://cdn-api.co-vin.in/api/v2/appointment/beneficiaries';
  const headers = {
    ...commonHeaders,
    authorization: `Bearer ${token}`
  };

  return new Promise((resolve, reject) => {
    fetch(url, {
      method: 'GET',
      headers 
    })
    .then(response => {
      if (!response.ok) {
        response.text().then(text => inflxCwApi({ api: 'beneficiaries', status: response.status, text }));
        throw new Error(response.statusText);
      }
      return response.json();
    })
    .then(json => {
      if (json) resolve(json);
      else reject('Not able to fetch beneficiaries');
    })
    .catch(e => { console.log('Error getting beneficiaries: ', e); reject(e); });
  });
}

const getRecaptha = (token) => {
  const url = 'https://cdn-api.co-vin.in/api/v2/auth/getRecaptcha';
  const headers = {
    ...commonHeaders,
    authorization: `Bearer ${token}`
  };

  return new Promise((resolve, reject) => {
    fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    })
    .then(response => {
      if (!response.ok) {
        response.text().then(text => inflxCwApi({ api: 'getRecaptcha', status: response.status, text }));
        throw new Error(response.statusText);
      }
      return response.json();
    })
    .then(json => {
      if (json) resolve(json);
      else reject('Not able to fetch captcha');
    })
    .catch(e => { console.log('Error getting captcha: ', e); reject(e); });
  });
}

const schedule = (data) => {
  const url = 'https://cdn-api.co-vin.in/api/v2/auth/schedule';
  const { center_id, session_id, beneficiaries, slot, captcha, dose, token } = data;
  const headers = {
    ...commonHeaders,
    authorization: `Bearer ${token}`
  };

  return new Promise((resolve, reject) => {
    fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ center_id, session_id, beneficiaries, slot, captcha, dose })
    })
    .then(response => {
      if (!response.ok) {
        response.text().then(text => inflxCwApi({ api: 'schedule', status: response.status, text }));
        throw new Error(response.statusText);
      }
      return response.json();
    })
   .then(json => {
      if (json) {
        inflxScheduled({ dose, center_id, benes: beneficiaries.length })
        resolve(json);
      }
      else reject('Not able to schedule');
    })
    .catch(e => { console.log('Error scheduling: ', e); reject(e); });
  });
}


module.exports = { validateOTP, requestOTP, setToken, getBeneficiaries, getRecaptha, schedule }