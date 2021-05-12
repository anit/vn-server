#!/usr/bin/env nodejs

var express = require("express")
var app = express()
var bodyParser = require("body-parser")
const jwt = require('jsonwebtoken');
const axios = require("axios");
const redisClient = require('./redis');
const apis = require('./apis');
const districts = require('./districts');
const utils = require('./utils');

app.use(bodyParser.json()) // for parsing application/json
app.use(
	bodyParser.urlencoded({
		extended: true,
	})
) // for parsing application/x-www-form-urlencoded

app.post('/fetchCenters', async (req, res) => {
	let token = null;
	try {
		token = await apis.getToken();
	} catch(e) { console.log('Some error getting token: ', e); }

	for (dis of districts) {

	}
	try {
		Promise.all(districts.map(async (dis) => {
			const availCentersNow = await apis.getAvailableCenters((token && token.token), dis.id, utils.ddmmyy(new Date()), dis.minAge || 18);
			availCentersNow && availCentersNow.length && dis.notifiers.forEach(async (n) => {
				apis.notifyTelegram(availCentersNow, n.chat_id)
			});
			if (!availCentersNow || !availCentersNow.length) console.log(`No centers found this week for ${dis.name}`);
		})).then(() => {
			res.json({});
		});
	} catch (e) {
		console.log('Error is ', e);
		return res.status(400).send(`Error is ${e.toString()}`);
	}
});

app.post('/setToken', (req, res) => {
	try {
		const obj = jwt.decode(req.body.token);
		if (Date.now() > obj.exp*1000) return res.status(400).send('Error: Expired token');

		const expiry = obj.exp - (Date.now()/1000) - 5;
		console.log(`Setting token on ${new Date()}`);
		redisClient.setex('token', Math.floor(expiry), req.body.token, err => {
			if (err) return res.status(400).json({ err });
			res.json({ token: req.body.token })
		});
	} catch (e) { res.status(400).send(`Error: Something went wrong ${e.toString()}`) }
});

// Finally, start our server
app.listen(process.env.PORT || 8080, function() {
	console.log("Telegram app listening !")
})
