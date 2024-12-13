const fs = require('node:fs');
const process = require('node:process');
const { generateKeyPairSync } = require('node:crypto');
const { join } = require('path');

const { getAppDataDir } = require('ocore/desktop_app')
const pathToFolder = getAppDataDir();
const pathToPrivKey = join(pathToFolder, 'privkey.pem');
const pathToPubKey = join(pathToFolder, 'pubkey.pem');

if (!fs.existsSync(pathToFolder)) {
	fs.mkdirSync(pathToFolder);
}

if (fs.existsSync(pathToPrivKey) || fs.existsSync(pathToPubKey)) {
	console.error('keys already exists');
	process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
});

fs.writeFileSync(pathToPrivKey, privateKey.export({
	type: 'pkcs1',
	format: 'pem',
}));

fs.writeFileSync(pathToPubKey, publicKey.export({
	type: 'spki',
	format: 'pem',
}));

console.log('Path to private key:', pathToPrivKey);
console.log('Path to public key:', pathToPubKey);
console.log('done');
