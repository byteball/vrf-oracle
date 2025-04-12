"use strict";
const fs = require('fs')
const path = require('path')
const _ = require('lodash');

const eventBus = require('ocore/event_bus.js');
const conf = require('ocore/conf.js');
const mutex = require('ocore/mutex.js');
const network = require('ocore/network.js');
const storage = require("ocore/storage.js");
const db = require("ocore/db.js");
const walletGeneral = require("ocore/wallet_general.js");
const constants = require("ocore/constants.js");
const formulaEvaluation = require("ocore/formula/evaluation.js");
const { vrfGenerate } = require('ocore/signature.js')
const { getAppDataDir } = require('ocore/desktop_app')

const dag = require('aabot/dag.js');
const operator = require('aabot/operator.js');
const aa_state = require('aabot/aa_state.js');


const privkey = fs.readFileSync(path.join(getAppDataDir(), 'privkey.pem'), 'utf8')


function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}




async function handleConsumerEvent(consumer_aa, req_id) {
	// simulate a request
	console.log(`handleConsumerEvent(${consumer_aa}, ${req_id})`);
	const aa_unlock = await aa_state.lock();
	const consumer_vars = aa_state.getUpcomingAAStateVars(consumer_aa);
	let upcomingStateVars = _.cloneDeep(aa_state.getUpcomingStateVars());
	let upcomingBalances = _.cloneDeep(aa_state.getUpcomingBalances());
	try {
		const req = await formulaEvaluation.executeGetterInState(db, consumer_aa, 'get_randomness_request', [req_id], upcomingStateVars, upcomingBalances);
		console.log(`get_randomness_request for consumer ${consumer_aa} req ${req_id}`, req);
	}
	catch (e) {
		console.log(`get_randomness_request consumer ${consumer_aa} req ${req_id} failed`, e);
		return aa_unlock();
	}
	aa_unlock();
	const seed = consumer_aa + '-' + req_id;
	const proof = vrfGenerate(seed, privkey);
	const unit = await dag.sendAARequest(conf.vrf_oracle_aa, { consumer_aa, req_id, proof });
	if (!unit)
		return console.log(`sending randomness failed`);
	const objJoint = await dag.readJoint(unit);
	// upcoming state vars are updated and the next request will see them
	console.log(`handleConsumerEvent: calling onAARequest manually`);
	await aa_state.onAARequest({ unit: objJoint.unit, aa_address: conf.vrf_oracle_aa });
}


async function onAAResponse(objAAResponse) {
	const { aa_address, trigger_unit, trigger_address, bounced, response } = objAAResponse;
	if (bounced && trigger_address === operator.getAddress())
		return console.log(`=== our request ${trigger_unit} bounced with error`, response.error);
	if (bounced)
		return console.log(`request ${trigger_unit} bounced with error`, response.error);
	if (conf.consumer_aas.includes(aa_address)) {
		console.log(`got response from consumer AA ${aa_address}`, objAAResponse);
		const req_id = getRequestId(objAAResponse);
		if (req_id)
			handleConsumerEvent(aa_address, req_id);
	}
}


async function onAARequest(objAARequest, arrResponses) {
	const address = objAARequest.unit.authors[0].address;
	if (address === operator.getAddress())
		return console.log(`skipping our own request`);
	if (arrResponses[0].bounced)
		return console.log(`trigger ${objAARequest.unit.unit} from ${address} will bounce`, arrResponses[0].response.error);
	const aas = arrResponses.map(r => r.aa_address);
	console.log(`request from ${address} trigger ${objAARequest.unit.unit} affected AAs`, aas);
	const aa = arrResponses[0].aa_address;
	if (conf.consumer_aas.includes(aa)) {
		const req_id = getRequestId(arrResponses[0]);
		if (req_id)
			handleConsumerEvent(aa, req_id);
	}
}

function getRequestId(objAAResponse) {
	const { aa_address, response: { responseVars } } = objAAResponse;
	if (!responseVars) {
		console.log(`no response vars from ${aa_address}`);
		return null;
	}
	const { plot_num } = responseVars;
	if (!plot_num) {
		console.log(`no plot_num from ${aa_address}`);
		return null;
	}
	return plot_num;
}




async function loadLibs() {
	for (let address of conf.lib_aas) {
	//	await dag.loadAA(address);
		const definition = await dag.readAADefinition(address);
		const payload = { address, definition };
		await storage.insertAADefinitions(db, [payload], constants.GENESIS_UNIT, 0, false);
	}
}



async function watchRandomnessConsumers() {
	for (let aa of conf.consumer_aas) {
		await aa_state.followAA(aa);
	}
}

function initConsumers() {
	for (let aa of conf.consumer_aas) {
		const vars = aa_state.getAAStateVars(aa);
		const asset = vars.constants?.asset;
		if (!asset)
			throw Error(`asset not defined yet in ${aa}`);
		network.requestHistoryFor([asset]);
	}
}

async function checkForMissedRequests() {
	console.log(`checking for missed requests`);
	for (let aa of conf.consumer_aas) {
		const vars = aa_state.getAAStateVars(aa);
		for (let name in vars) {
			const m = name.match(/^plot_(\d+)$/);
			if (m) {
				const plot = vars[name];
				if (plot.status === 'pending') {
					console.log(`missed ${name}, will send randomness`);
					const req_id = m[1];
					await handleConsumerEvent(aa, req_id);
				}
			}
		}
	}
}

async function startWatching() {
	await loadLibs();

	eventBus.on("aa_request_applied", onAARequest);
	eventBus.on("aa_response_applied", onAAResponse);

	await watchRandomnessConsumers();
	await aa_state.followAA(conf.vrf_oracle_aa);
	for (let address of conf.attestors)
		walletGeneral.addWatchedAddress(address);

	initConsumers();
	await checkForMissedRequests();

}


exports.startWatching = startWatching;

