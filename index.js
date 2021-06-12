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
		limit: '30mb'
	})
) // for parsing application/x-www-form-urlencoded

app.use(cors());

app.post('/notify', async (req, res) => {
	res.json({});
	let { data, cache_date, chan18, chan18_2, chan45, id } = req.body;

	if (!data || (!data.chan18?.length && !data.chan18_2?.length && !data.chan45?.length)) {
		console.log('No data found for ', id, data);
		return; 
	}

	const redisDate = await apis.getRedisKey(`cf-cache-${id}`);

	if (redisDate && (new Date(redisDate) > new Date(cache_date))) {
		console.log(`Skipping ${id} because ${redisDate} is less than ${cache_date}`);
		return;
	}

	try {
		if (id == '777' || id == '155') {
			var covaxinSlots = data.chan18.filter(x => x.vaccine.toLowerCase() == 'covaxin' && x.available2 > 0).map(x => ({ ...x, available1: 0 }));
			apis.notifyTelegram(covaxinSlots, -500113783);
			await new Promise(resolve => setTimeout(resolve, 10000));
		}
	} catch (e) { console.log('Something went wrong notifying main vaccine group ', e); }

	let fData = await apis.filterOutDuplicates(data.chan18);
	apis.notifyTelegram(fData, chan18);

	fData = await apis.filterOutDuplicates(data.chan45);
	apis.notifyTelegram(fData, chan45);

	fData = await apis.filterOutDuplicates(data.chan18_2);
	apis.notifyTelegram(fData, chan18_2);

	cache_date && apis.setRedisKey(`cf-cache-${id}`, cache_date, 60*30); // 30 minutes
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
	let districts = await getDistricts();
	let districtsWithDate = await Promise.all(districts.map(async (x) => ({
		...x,
		cache_date: await apis.getRedisKey(`cf-cache-${x.id}`)
	})));

	res.setHeader('Content-Type', 'application/json');
	res.json(districtsWithDate.sort((x, y) => {
		if (!x.cache_date) return -1;
		if (!y.cache_date) return 1;


		if (new Date(x.cache_date) > new Date(y.cache_date)) return 1;
		else return -1;
	}));
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
