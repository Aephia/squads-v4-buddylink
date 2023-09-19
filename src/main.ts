import { resolve } from 'path';
import {
	Connection,
	Keypair,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { airdrop, getNewConnection } from './lib/common.js';
import { Configuration, Environment, Settings } from './types.js';
import { createJSONFile, getScriptFolder, readJSONFile } from './utils.js';
import { createNewSquadWithBuddyLink } from './createSquad.js';

const env: Environment = Environment.LOCAL;
const config = await getConfig();

async function initialize() {
	let settings: Settings | undefined = undefined;

	try {
		settings = await getSettings();
		console.debug('Settings found');
	} catch(e) {
		console.debug('No settings found');
	}

	const connection = getNewConnection(env, config.rpc);
	const devAccount = await getDevAccount(connection);

	if (settings?.createKey) {
		config.squads.createKey = settings.createKey;
	}
	
	const { createKey, multisigPda, vaultPda } = await createNewSquadWithBuddyLink(connection, devAccount, config.squads, config.buddyLink, env);

	await storeSettings({
		createKey: createKey.toString(),
		multisigPda: multisigPda.toString(),
		vaultPda: vaultPda.toString(),
	});
}

async function getDevAccount(connection: Connection): Promise<Keypair> {
	let keyPair = env === Environment.PROD ? config.mainnetAccount : config.devnetAccount;

	if (env === Environment.LOCAL || (env === Environment.DEV && !keyPair?.private)) {
		const account = Keypair.generate();

		console.log('Using generated account:');
		console.log('- Public:', account.publicKey.toString());
		console.log('- Private:', bs58.encode(account.secretKey));

		await airdrop(connection, account.publicKey, 1);
		return account;
	}

	if (env === Environment.PROD && !keyPair?.private) {
		throw "mainnetAccount's private key is invalid!";
	}

	const privateKeyArray = bs58.decode(keyPair.private);
	const account = Keypair.fromSecretKey(privateKeyArray);

	console.log('Using configured account:');
	console.log('- Public:', account.publicKey.toString());
	return account;
}

function getConfig(): Promise<Configuration> {
	const filePath = resolve(getScriptFolder(), '../', 'config.json');
	return readJSONFile<Configuration>(filePath);
}

function storeSettings(settings: Settings): Promise<void> {
	const filePath = resolve(getScriptFolder(), '../', 'settings.json');
	return createJSONFile(filePath, settings);
}

function getSettings(): Promise<Settings> {
	const filePath = resolve(getScriptFolder(), '../', 'settings.json');
	return readJSONFile<Settings>(filePath);
}

initialize();
