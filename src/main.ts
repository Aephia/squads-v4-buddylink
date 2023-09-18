import {
	Connection,
	Keypair,
	PublicKey,
	TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { airdrop, getTransferSolInstruction, transferSol } from './lib/common.js';
import { getCreateMemberInstructions } from './lib/buddylink.js';
import {
	createSquadProposal,
	createSimpleSquad,
	getVaultPdaForMultiSig,
	approveProposal,
	executeTransaction,
	createThresholdUpdateProposal,
	executeTransactionWithComputeLimit,
	// getProposalDetails,
	// getSquadDetails,
} from './lib/squads.js';
import { Environment } from './types.js';
import config from './config.json' assert { type: 'json' };

const env: Environment = Environment.DEV;
const BL_ORGANIZATION = 'staratlas';

async function createNewSquadWithBuddyLink() {
	const connection = getNewConnection();
	const devAccount = await getDevAccount(connection);
	const members = config.members.map((keyString: string) => new PublicKey(keyString));

	// Add the devAccount to the member-list
	members.unshift(devAccount.publicKey);
	console.log(`Creator & Fee payer: ${devAccount.publicKey}`);

	// Create the Squad with temporary threshold 1, so that our dev account can set everything up
	const { multisigPda, signature: creationSignature } = await createSimpleSquad(connection, devAccount, members, 1);
	console.log('Multisig created:', creationSignature);

	// const multisigAccount = await getSquadDetails(connection, multisigPda);
	// console.log('MultiSig:', JSON.stringify(multisigAccount, undefined, ' '));

	await createBuddyLinkMember(connection, multisigPda, devAccount);
	//await transferFromVault(connection, multisigPda, devAccount);
	await updateSquadThreshold(connection, multisigPda, devAccount, config.threshold);
}

/**
 * Create and execute a proposal to create a new BuddyLink Member
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @param devAccount Solana account that is going to pay for all this
 * @returns 
 */
async function createBuddyLinkMember(connection: Connection, multisigPda: PublicKey, devAccount: Keypair) {
	const vaultPda = getVaultPdaForMultiSig(multisigPda);
	console.log('Vault account:', vaultPda.toString());

	// Get the BuddyLink creation instruction
	let instructions: TransactionInstruction[];
	try {
		instructions = await getCreateMemberInstructions(connection, vaultPda, BL_ORGANIZATION, config.buddyLinkKey, env);
	} catch (err) {
		console.error(err);
		return;
	}

	// Create a MultiSig transaction using the BuddyLink instructions
	let { signature, transactionIndex } = await createSquadProposal(connection, multisigPda, instructions, devAccount);
	console.log('BuddyLink - Transaction created:', signature);

	// const proposal = await getProposalDetails(connection, multisigPda, transactionIndex);
	// console.log('Proposal:', JSON.stringify(proposal, undefined, ' '));

	// Approve the transaction
	signature = await approveProposal(connection, multisigPda, transactionIndex, devAccount);
	console.log('BuddyLink - Transaction approved:', signature);

	// Wire some funds to the Vault
	signature = await transferSol(connection, devAccount, vaultPda, 0.1);
	console.log('BuddyLink - Funds transfered to Vault:', signature);

	// Execute the transaction
	signature = await executeTransactionWithComputeLimit(connection, multisigPda, transactionIndex, devAccount, 300000);
	console.log('BuddyLink - Transaction executed:', signature);
}

/**
 * Create and execute a proposal to tranasfer some SOL to the devAccount
 * 
 * Note: This is only used to check the full Squads-runthrough without using
 * any BuddyLink dependency.
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @param devAccount Solana account that is going to pay for all this
 * @returns 
 */
async function transferFromVault(connection: Connection, multisigPda: PublicKey, devAccount: Keypair) {
	const vaultPda = getVaultPdaForMultiSig(multisigPda);
	console.log('Vault account:', vaultPda.toString());

	// Get the Transfer instruction
	let instructions: TransactionInstruction[];
	try {
		// The transfer is being signed from the Squads Vault, that is why we use the VaultPda
		instructions = [await getTransferSolInstruction(vaultPda, devAccount.publicKey, 0.01)];
	} catch (err) {
		console.error(err);
		return;
	}

	// Create a MultiSig transaction using the Transfer instructions
	let { signature, transactionIndex } = await createSquadProposal(connection, multisigPda, instructions, devAccount);
	console.log('Transfer - Transaction created:', signature);

	// const proposal = await getProposalDetails(connection, multisigPda, transactionIndex);
	// console.log('Proposal:', JSON.stringify(proposal, undefined, ' '));

	// Approve the transaction
	signature = await approveProposal(connection, multisigPda, transactionIndex, devAccount);
	console.log('Transfer - Transaction approved:', signature);

	// Wire some funds to the Vault
	signature = await transferSol(connection, devAccount, vaultPda, 0.01);
	console.log('Transfer - Funds transfered to Vault:', signature);

	// Execute the transaction
	signature = await executeTransaction(connection, multisigPda, transactionIndex, devAccount);
	console.log('Transfer - Transaction executed:', signature);
}

/**
 * Create and execute a proposal to update the Squad threshold
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @param devAccount Solana account that is going to pay for all this
 * @param threshold The new threshold
 * @returns 
 */
async function updateSquadThreshold(connection: Connection, multisigPda: PublicKey, devAccount: Keypair, threshold: number) {
	let { signature, transactionIndex } = await createThresholdUpdateProposal(
		connection,
		multisigPda,
		devAccount,
		threshold
	);
	console.log('Threshold Update - Proposal created:', signature);

	// Approve the transaction
	signature = await approveProposal(connection, multisigPda, transactionIndex, devAccount);
	console.log('Threshold Update - Transaction approved:', signature);

	// Execute the transaction
	signature = await executeTransaction(connection, multisigPda, transactionIndex, devAccount);
	console.log('Threshold Update - Transaction executed:', signature);
}

function getNewConnection(): Connection {
	if (env === Environment.PROD) {
		return new Connection(config.rpc.mainnet);
	} else if (env === Environment.DEV) {
		console.log('Running in DEV mode');
		return new Connection(config.rpc.devnet, 'confirmed');
	} else {
		console.log('Running in LOCAL DEV mode');
		return new Connection(config.rpc.local, 'confirmed');
	}
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

createNewSquadWithBuddyLink();
