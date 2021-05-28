#!/usr/bin/env nodejs

var express = require("express")
var app = express()
var bodyParser = require("body-parser")
const apis = require('./apis');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const redisClient = require('./redis');



app.use(bodyParser.json()) // for parsing application/json
app.use(
	bodyParser.urlencoded({
		extended: true,
	})
) // for parsing application/x-www-form-urlencoded
app.use(cors());

app.post('/generateOTP', async (req, res) => {
	const mobile = req.body.mobile;
	console.log('req body is ', req.body)
	if (!mobile) return res.status(400).send('Invalid Mobile No.');

	apis
		.requestOTP(mobile)
		.then(txnId => res.json({ txnId }))
		.catch(err => res.status(400).send(err.toString()));
});

app.post('/validateOTP', async (req, res) => {
	const { otp, txnId } = req.body;
	if (!otp || !txnId) return res.status(400).send('Invalid Request');

	apis
		.validateOTP(otp, txnId)
		.then(token => res.json(token))
		.catch(err => res.status(400).send(err.toString()));
});

app.post('/bene', async (req, res) => {
	const { token } = req.body;
	if (!token) return res.status(400).send('No valid token found');

	apis
		.getBeneficiaries(token)
		.then(bene => res.json(bene))
		.catch(err => res.status(400).send(err.toString()));
});

app.post('/getCaptcha', async (req, res) => {
	const { token } = req.body;
	if (!token) return res.status(400).send('No valid token found');

	apis
		.getRecaptha(token)
		.then(cap => res.json(cap))
		.catch(err => res.status(400).send(err.toString()));
});

app.post('/schedule', async (req, res) => {
	const { token } = req.body;
	if (!token) return res.status(400).send('No valid token found');

	apis
		.schedule(req.body)
		.then(cap => res.json(cap))
		.catch(err => res.status(400).send(err.toString()));
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



app.get('/', (req, res) => res.json({ hello: 'world' }))

// Finally, start our server
app.listen(process.env.PORT || 8081, function() {
	console.log("Telegram app listening !")
})
