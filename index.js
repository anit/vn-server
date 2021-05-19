#!/usr/bin/env nodejs

var express = require("express")
var app = express()
var bodyParser = require("body-parser")
const jwt = require('jsonwebtoken');
const redisClient = require('./redis');
const apis = require('./apis');
const utils = require('./utils');
const { inflxSlotsCaptured, inflxMemCount } = require("./influx");
const { getDistricts } = require("./spreadsheet");
const states = require("./states");
const config = require("./config");

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

	let results = [];
	
	try {
		const districts = await getDistricts();
		Promise.all(districts.map(async (dis) => {
				const [availCenters18, availCenters45] = await apis.getAvailableCenters((token && token.token), dis.id, utils.ddmmyy(new Date()), !!dis.chan18, !!dis.chan45);
				
				availCenters18 && availCenters18.length > 0 && apis.notifyTelegram(availCenters18, dis.chan18).catch(err => console.log('Error notifying telegram: ', err));
				availCenters45 && availCenters45.length > 0 && apis.notifyTelegram(availCenters45, dis.chan45).catch(err => console.log('Error notifying telegram: ', err));


				availCenters18 && results.push(...availCenters18.map(x => ({ ...x, minAge: 18 })));
				availCenters45 && results.push(...availCenters45.map(x => ({ ...x, minAge: 45 })));
		})).then(() => {
			res.json({});
		}).finally(() => {
			inflxSlotsCaptured(results);
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


app.get('/test', async (req, res) => {
	apis
		.notifyTelegram([{ center: 'Test', pincode: 212222, available1: 23, available2: 34, date: '12-12-2021', district: 'TestPune', vaccine: 'COVAXIN' }], config.godChatId)
		.then(res => console.log('test response is ', res))
		.catch(err => console.log('test error is ', err))
	res.json({})
});


app.get('/states', async (req, res) => {
	var allStates = await Promise.all(states.map(async (s) => {
		const resp = await apis.fetchDistricts(s.state_id);
		console.log('district is ', resp.districts);
		s.districts = resp.districts;
		return s;
	}));
	res.setHeader('Content-Type', 'application/json');
	res.json(allStates);
});

app.get('/memCount', async (req, res) => {
	const districts = await getDistricts();
	const allChannels = [];

	districts.map(x => {
		allChannels.push(...[ x.chan18, x.chan45 ]);
	});

	const allCounts = await Promise.all(
		allChannels.filter(x => !!x).map(async (x, index) => {

			// force a timeout after every 10 api call. 
			if (index > 0 && index%10 > 0) await new Promise(resolve => setTimeout(resolve, 2));

			const count = await apis.memCount(x);
			return { channel: x, count: count.result || null };
		})
	);

	inflxMemCount(allCounts);
	return res.json(allCounts);
})


// Finally, start our server
app.listen(process.env.PORT || 8080, function() {
	console.log("Telegram app listening !")
})
