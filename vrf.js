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
const aa_composer = require("ocore/aa_composer.js");
const formulaEvaluation = require("ocore/formula/evaluation.js");
const { vrfGenerate } = require('ocore/signature.js')
const { getAppDataDir } = require('ocore/desktop_app')

const dag = require('aabot/dag.js');
const operator = require('aabot/operator.js');
const aa_state = require('aabot/aa_state.js');


const privkey = fs.readFileSync(path.join(getAppDataDir(), 'privkey.pem'), 'utf8')

const finishingProviderTimeout = 600; // in seconds

let bIAmFinishingProvider;
let nonfinishingVrfProviders = new Set();
let pendingRequests = {};

function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}


function getRequest(consumer_aa, req_id) {
	const key = `${consumer_aa}-${req_id}`;
	let req = pendingRequests[key];
	if (!req) {
		req = { postedProviders: new Set() };
		pendingRequests[key] = req;
	}
	return req;
}

function deleteRequest(consumer_aa, req_id) {
	const key = `${consumer_aa}-${req_id}`;
	delete pendingRequests[key];
}


async function handleConsumerEvent(consumer_aa, req_id, timestamp) {
	// simulate a request
	console.log(`handleConsumerEvent(${consumer_aa}, ${req_id})`);
	if (bIAmFinishingProvider) {
		let req = getRequest(consumer_aa, req_id);
		const timeout = (timestamp + finishingProviderTimeout + 30) * 1000 - Date.now();
		if (req.postedProviders.size < nonfinishingVrfProviders.size && timeout > 0) {
			if (!timestamp) throw Error(`no timestamp`);
			req.timeout = setTimeout(() => handleConsumerEvent(consumer_aa, req_id, timestamp), timeout);
			return console.log(`will post randomness in ${timeout / 1000}s or when all non-finishing providers post`);
		}
		else {
			clearTimeout(req.timeout);
			deleteRequest(consumer_aa, req_id);
		}
	}
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
	const { aa_address, trigger_unit, trigger_address, bounced, response, timestamp } = objAAResponse;
	if (bounced && trigger_address === operator.getAddress())
		return console.log(`=== our request ${trigger_unit} bounced with error`, response.error);
	if (bounced)
		return console.log(`request ${trigger_unit} bounced with error`, response.error);
	if (conf.consumer_aas.includes(aa_address)) {
		console.log(`got response from consumer AA ${aa_address}`, objAAResponse);
		const req_ids = getRequestIds(objAAResponse);
		for (let req_id of req_ids)
			handleConsumerEvent(aa_address, req_id, timestamp);
	}
	else if (bIAmFinishingProvider && aa_address === conf.vrf_oracle_aa && nonfinishingVrfProviders.has(trigger_address)) {
		console.log(`onAAResponse: received randomness from nonfinishing VRF oracle ${trigger_address}`);
		const objTriggerJoint = await dag.readJoint(trigger_unit);
		handleRandomnessFromNonfinishingProvider(objTriggerJoint.unit, aa_address, trigger_address);
	}
}


async function onAARequest(objAARequest, arrResponses) {
	const trigger_address = objAARequest.unit.authors[0].address;
	if (trigger_address === operator.getAddress())
		return console.log(`skipping our own request`);
	if (arrResponses[0].bounced)
		return console.log(`trigger ${objAARequest.unit.unit} from ${trigger_address} will bounce`, arrResponses[0].response.error);
	const aas = arrResponses.map(r => r.aa_address);
	console.log(`request from ${trigger_address} trigger ${objAARequest.unit.unit} affected AAs`, aas);
	const { aa_address, timestamp } = arrResponses[0];
	if (conf.consumer_aas.includes(aa_address)) {
		const req_ids = getRequestIds(arrResponses[0]);
		for (let req_id of req_ids)
			handleConsumerEvent(aa_address, req_id, timestamp);
	}
	else if (bIAmFinishingProvider && aa_address === conf.vrf_oracle_aa && nonfinishingVrfProviders.has(trigger_address)) {
		console.log(`onAARequest: received randomness from nonfinishing VRF oracle ${trigger_address}`);
		handleRandomnessFromNonfinishingProvider(objAARequest.unit, aa_address, trigger_address);
	}
}

function handleRandomnessFromNonfinishingProvider(objTriggerUnit, aa_address, trigger_address) {
	const trigger = aa_composer.getTrigger(objTriggerUnit, aa_address);
	const { req_id, consumer_aa } = trigger.data;
	if (!req_id || !consumer_aa)
		return console.log(`req_id or consumer_aa not found in nonfinishing provider trigger`, trigger);
	let req = getRequest(consumer_aa, req_id);
	req.postedProviders.add(trigger_address);
	console.log(`${consumer_aa}-${req_id}: received randomness from ${req.postedProviders.size} out of ${nonfinishingVrfProviders.size} VRF oracles`);
	if (req.postedProviders.size === nonfinishingVrfProviders.size)
		handleConsumerEvent(consumer_aa, req_id, null);
}

function getRequestIds(objAAResponse) {
	const { aa_address, response: { responseVars } } = objAAResponse;
	if (!responseVars) {
		console.log(`no response vars from ${aa_address}`);
		return [];
	}
	const { plot_num, events } = responseVars;
	if (plot_num)
		return [plot_num];
	if (events) {
		const arrEvents = JSON.parse(events);
		const plots = arrEvents.filter(({ type }) => type === 'reward').map(({ plot_num }) => plot_num);
		console.log('reward plots', plots);
		return plots;
	}
	console.log(`no plot_num or events from ${aa_address}`, responseVars);
	return [];
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

async function initVrfOracle(vrf_oracle_aa) {
	await aa_state.followAA(vrf_oracle_aa);
	const definition = await dag.loadAA(vrf_oracle_aa);
	const { params: { vrf_providers, finishing_provider } } = definition;
	if (!vrf_providers[operator.getAddress()])
		throw Error(`I'm not a member of VRF oracle AA ${vrf_oracle_aa}`);
	bIAmFinishingProvider = operator.getAddress() === finishing_provider;
	if (bIAmFinishingProvider) {
		for (let address in vrf_providers)
			if (address !== finishing_provider)
				nonfinishingVrfProviders.add(address);
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
					await handleConsumerEvent(aa, req_id, plot.ts);
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
	await initVrfOracle(conf.vrf_oracle_aa);
	for (let address of conf.attestors)
		walletGeneral.addWatchedAddress(address);

	initConsumers();
	await checkForMissedRequests();
	setInterval(checkForMissedRequests, 3 * 3600_000);
}


exports.startWatching = startWatching;

