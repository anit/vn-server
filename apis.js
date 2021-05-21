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
const jwt = require('jsonwebtoken');

const getSecret = () => {
  return CryptoJS.AES.encrypt(config.cowinId, config.cowinKey).toString();
}

const requestOTP = (mobile) => {
  const secret = getSecret();
  return new Promise((resolve, reject) => {
    console.log('Fetching otp for ', { mobile: config.user.mobile, secret })
    fetch('https://cdn-api.co-vin.in/api/v2/auth/generateMobileOTP', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mobile: config.user.mobile, secret })
    })
    .then(response => {
      if (!response.ok) throw new Error(response.statusText);
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
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ otp: hash, txnId })
    })
    .then(response => {
      if (!response.ok) throw new Error(response.statusText);
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


module.exports = { validateOTP, requestOTP, setToken }