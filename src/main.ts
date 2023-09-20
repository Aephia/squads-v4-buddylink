import { resolve } from 'path';
import {
	Connection,
	Keypair,
	PublicKey,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { airdrop, getNewConnection } from './lib/common.js';
import { Configuration, Environment, LogType, Settings } from './types.js';
import { createJSONFile, getScriptFolder, log, readJSONFile } from './utils.js';
import { createNewSquadWithBuddyLink } from './createSquad.js';
import { getClaimableBalance, getMember, getMemberStatistics, getTreasuries } from './lib/buddylink.js';

const config = await getConfig();
const env = getEnv(config.mode);

async function initialize() {
	let settings: Settings | undefined = undefined;

	try {
		settings = await getSettings();
	} catch(e) {}

	const connection = getNewConnection(env, config.rpc);
	const devAccount = await getDevAccount(connection);

	showIntro(settings, devAccount, config, env);

	if (!settings?.vaultPda) {
		if (settings?.createKey) {
			config.squads.createKey = settings.createKey;
		}

		try {
			const { createKey, multisigPda, vaultPda } = await createNewSquadWithBuddyLink(
				connection,
				devAccount,
				config.squads,
				config.buddyLink,
				env
			);

			if (env !== Environment.LOCAL) {
				const settings: Settings = {
					createKey: createKey.toString(),
					multisigPda: multisigPda.toString(),
					vaultPda: vaultPda.toString(),
				};

				await storeSettings(settings);
				showBuddyLinkData(connection, settings);
			}
		} catch (err) {
			log(`Aborted due to error: ${err}`, LogType.ERROR);
		}		
	} else {
		showBuddyLinkData(connection, settings);
	}
}

async function showBuddyLinkData(connection: Connection, settings: Settings): Promise<void> {
	const vaultPda = new PublicKey(settings.vaultPda!);
	const treasuries = await getTreasuries(connection, vaultPda, env);
	const balances = await Promise.all(treasuries.map((treasury) => getClaimableBalance(treasury)));
	const claimableBalanceNum = balances.filter((balance) => !!balance).length;

	const member = await getMember(connection, config.buddyLink.orgName, config.buddyLink.memberName, env);
	if (member) {
		log('Referral Link:', LogType.HIGHLIGHT);
		log(`https://play.staratlas.com/?r=${member?.account.name}`, LogType.SPOTLIGHT);
	} else {
		log('BuddyLink Member does not exist!', LogType.ERROR);
	}
	log('', LogType.NORMAL);

	if (!treasuries.length) {
		log('No treasuries could be found!', LogType.ERROR);
	} else if (!claimableBalanceNum) {
		log(`${treasuries.length} treasuries found - No claimable balances`, LogType.HIGHLIGHT);
	} else if (claimableBalanceNum) {
		log(`${treasuries.length} treasuries found - ${claimableBalanceNum} claimable balances:`, LogType.HIGHLIGHT);
		balances.forEach((balance, idx) => {
			const symbol = getTokenSymbolForMint(treasuries[idx].account.mint.toString());
			log(`${balance}`, LogType.DETAILS, `${symbol}:`);
		});
	}
	log('', LogType.NORMAL);

	if (member) {
		try {
			const stats = await getMemberStatistics(member!);
			log('Dumping raw Member Stats:', LogType.HIGHLIGHT);
			console.log(stats);
		} catch (err) {
			log('An error occured while fetching the BuddyLink Member Stats!', LogType.ERROR);
			log(err as string, LogType.NORMAL);
		}
	}
}

async function getDevAccount(connection: Connection): Promise<Keypair> {
	const keyPair = env === Environment.PROD ? config.mainnetAccount : config.devnetAccount;

	if (env === Environment.LOCAL || (env === Environment.DEV && !keyPair?.private)) {
		const account = Keypair.generate();
		await airdrop(connection, account.publicKey, 1);
		return account;
	}

	if (env === Environment.PROD && !keyPair?.private) {
		throw "mainnetAccount's private key is invalid!";
	}

	const privateKeyArray = bs58.decode(keyPair.private);
	const account = Keypair.fromSecretKey(privateKeyArray);
	return account;
}

function getTokenSymbolForMint(mint: string) {
	if (mint === 'USDCwtCSCAv6wTZKwC924tJqndNEJyx7NYQufZH7p3K') {
		return 'USDC';
	} else if (mint === 'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx') {
		return 'ATLAS';
	}
}

function showIntro(settings: Settings | undefined, devAccount: Keypair, config: Configuration, env: Environment): void {
	// Network used
	if (env === Environment.PROD) {
		log('Running on Mainnet', LogType.HIGHLIGHT);
	} else if (env === Environment.DEV) {
		log('Running on Devnet', LogType.HIGHLIGHT);
	} else  {
		log('Running on Local Devnet', LogType.HIGHLIGHT);
		log('This means we will test Squads with a SOL Transfer only', LogType.SPOTLIGHT);
	}
	log('', LogType.NORMAL);

	// DevAccount information
	const keyPair = env === Environment.PROD ? config.mainnetAccount : config.devnetAccount;
	const generated = keyPair.public !== devAccount.publicKey.toString();
	if (generated) {
		log('Using a generated account for this session:', LogType.HIGHLIGHT);
	} else {
		log('Configured account to use for this session:', LogType.HIGHLIGHT);
	}
	log(devAccount.publicKey.toString(), LogType.DETAILS, 'PublicKey:');
	if (generated) {
		log(bs58.encode(devAccount.secretKey), LogType.DETAILS, 'PrivateKey:');
	}
	log('', LogType.NORMAL);

	// Settings found + followup action taken
	if (settings?.vaultPda && settings?.multisigPda) {
		log('Found existing Squads MultiSig:', LogType.HIGHLIGHT);
		log(settings?.multisigPda, LogType.DETAILS, 'MultiSig PDA:')
		log(settings?.vaultPda, LogType.DETAILS, 'Vault PDA:')
		log('', LogType.NORMAL);
		log('Fetching Treasury Data:', LogType.NORMAL);
	} else if (settings?.createKey) {
		log('Found preconfigured createKey:', LogType.HIGHLIGHT);
		log(settings?.createKey, LogType.DETAILS, 'CreateKey:');
		log('', LogType.NORMAL);
		log('Creating new Squad with BuddyLink referral:', LogType.NORMAL);
	} else {
		log('Creating new Squad with BuddyLink referral:', LogType.NORMAL);
	}
	log('', LogType.NORMAL);
}

function getConfig(): Promise<Configuration> {
	const filePath = resolve(getScriptFolder(), '../', 'config.json');
	return readJSONFile<Configuration>(filePath);
}

function getEnv(envStr: string): Environment {
	if (envStr === 'prod') {
		return Environment.PROD;
	} else if (envStr === 'dev') {
		return Environment.DEV;
	}
	return Environment.LOCAL;
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
