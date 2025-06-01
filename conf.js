/*jslint node: true */
"use strict";

//exports.port = 6611;
//exports.myUrl = 'wss://mydomain.com/bb';

// for local testing
//exports.WS_PROTOCOL === 'ws://';
//exports.port = 16611;
//exports.myUrl = 'ws://127.0.0.1:' + exports.port;

exports.bServeAsHub = false;
exports.bLight = true;

exports.storage = 'sqlite';

exports.hub = process.env.testnet ? 'obyte.org/bb-test' : 'obyte.org/bb';
exports.deviceName = 'VRF Oracle';
exports.permanent_pairing_secret = '*';
exports.control_addresses = ['DEVICE ALLOWED TO CHAT'];
exports.payout_address = 'WHERE THE MONEY CAN BE SENT TO';
exports.bSingleAddress = true;
exports.bWantNewPeers = true;
exports.KEYS_FILENAME = 'keys.json';

// TOR
exports.socksHost = '127.0.0.1';
exports.socksPort = 9050;

exports.bNoPassphrase = true;

exports.explicitStart = true;


// override the below values in ~/.config/vrf-oracle/conf.json if necessary

exports.lib_aas = [
	'3LUPAHCQMJCQDKFVZB7GFKYJMHZ5BC67',
];

exports.consumer_aas = process.env.testnet
	? [
		'XUXPOHYSH6PHQBTM32ZIJX3RHWBJHX4L',
	]
	: [
		'CITYC3WWO5DD2UM6HQR3H333RRTD253Q',
	];

exports.attestors = process.env.testnet
	? [
		'EJC4A7WQGHEZEKW6RLO7F26SAR4LAQBU',
	]
	: [
		'JBW7HT5CRBSF7J7RD26AYLQG6GZDPFPS', // telegram
		'5KM36CFPBD2QJLVD65PHZG34WEM4RPY2', // discord
	];

exports.vrf_oracle_aa = 'R2OVZFLVPBY65CNRL4W6GKK34XGOOQJS';

console.log('finished vrf conf');
