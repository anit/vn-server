#!/usr/bin/env nodejs

var express = require("express")
var app = express()
var bodyParser = require("body-parser")
const jwt = require('jsonwebtoken');
const redisClient = require('./redis');
const apis = require('./apis');
const { inflxMemCount } = require("./influx");
const { getDistricts } = require("./spreadsheet");
var cors = require('cors')


app.use(bodyParser.json()) // for parsing application/json
app.use(
	express.urlencoded({
		extended: true,
		limit: '10mb'
	})
) // for parsing application/x-www-form-urlencoded

app.use(cors());

app.post('/notify', async (req, res) => {
	res.json({});

	let { data, cache_date, chan18, chan18_2, chan45 } = req.body;
	const fData = await apis.filterOutDuplicates(data);

	apis.notifyTelegram(fData.filter(x => x.minAge == 45), chan45);
	apis.notifyTelegram(fData.filter(x => x.minAge == 18 && x.available2 > 1), chan18_2);
	apis.notifyTelegram(fData.filter(x => x.minAge == 18 && (!chan18_2 ? x.available > 1 : x.available1 > 1)), chan18);
});

app.post('/setToken', (req, res) => {
	try {
		const obj = jwt.decode(req.body.token);
		if (Date.now() > obj.exp*1000) return res.status(400).send('Error: Expired token');

		const expiry = obj.exp - (Date.now()/1000) - 5;
		console.log(`Setting token on ${new Date()}`);
		redisClient.setex(`token-${Date.now()}`, Math.floor(expiry), req.body.token, err => {
			if (err) return res.status(400).json({ err });
			res.json({ token: req.body.token })
		});
	} catch (e) { res.status(400).send(`Error: Something went wrong ${e.toString()}`) }
});


app.get('/districts', async (req, res) => {
	const districts = await getDistricts();
	res.setHeader('Content-Type', 'application/json');
	res.json(districts)
});


app.get('/getToken',  (req, res) => {
  apis.matchingRedisKey('*token-*', true).then(found => {

		if (!found || !found.length) return res.status(422).send('No token available right now.');

		apis.getRedisKey(found[0], true).then((rRes, err) => {
			if (!rRes) return res.status(422).send('No token available right now.');
			res.json({ token: rRes, key: found[0] });
		})
	})
});

app.post('/deleteToken', (req, res) => {
	if (!req.body.key) res.status(400).send('Error');

	apis.delRedisKey(req.body.key);
	res.json({});
});


app.get('/memCount', async (req, res) => {
	const districts = await getDistricts();
	const allChannels = [];

	districts.map(x => {
		allChannels.push(...[ x.chan18, x.chan45, x.chan18_2 ]);
	});

	const allCounts = await Promise.all(
		allChannels.filter(x => !!x).map(async (x, index) => {

			// force a timeout after every 10 api call. 
			if (index > 0 && index%10 > 0) await new Promise(resolve => setTimeout(resolve, 5));

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
