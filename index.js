#!/usr/bin/env nodejs

var express = require("express")
var app = express()
var bodyParser = require("body-parser")
const apis = require('./apis');

app.use(bodyParser.json()) // for parsing application/json
app.use(
	bodyParser.urlencoded({
		extended: true,
	})
) // for parsing application/x-www-form-urlencoded

app.post('/generateOTP', async (req, res) => {
	const mobile = req.body.mobile;
	if (!mobile) return res.status(400).send('Invalid Mobile No.');

	apis
		.requestOTP(mobile)
		.then(txnId => res.json({ txnId }))
		.catch(err => res.status(400).send('Error generating OTP ' + err.toString()));
});

app.post('/validateOTP', async (req, res) => {
	const { otp, txnId } = req.body;
	if (!otp || !txnId) return res.status(400).send('Invalid Request');

	apis
		.validateOTP(otp, txnId)
		.then(txnId => res.json({ txnId }))
		.catch(err => res.status(400).send('Error generating OTP ' + err.toString()));
});

// Finally, start our server
app.listen(process.env.PORT || 8080, function() {
	console.log("Telegram app listening !")
})
