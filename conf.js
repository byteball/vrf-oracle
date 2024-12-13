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

exports.lib_aas = [
	'3LUPAHCQMJCQDKFVZB7GFKYJMHZ5BC67',
];

exports.consumer_aas = [
	'XUXPOHYSH6PHQBTM32ZIJX3RHWBJHX4L',
];

exports.attestors = [
	'EJC4A7WQGHEZEKW6RLO7F26SAR4LAQBU',
];

exports.vrf_oracle_aa = 'insert your AA address';

console.log('finished vrf conf');
