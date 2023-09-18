import {
	Connection,
	Keypair,
	PublicKey,
	TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
//import { getCreateMemberInstructions } from './libs/buddylink.js';
import {
	createSquadProposal,
	createSimpleSquad,
	getVaultPdaForMultiSig,
	approveProposal,
	executeTransaction,
	updateThreshold,
	// getProposalDetails,
	// getSquadDetails,
} from './lib/squads.js';
// @ts-ignore
import { airdrop, getTransferSolInstruction, transferSol } from './lib/common.js';
import config from './config.json' assert { type: 'json' };

const ENV: 'prod' | 'dev' = 'dev';
// const BL_ORGANIZATION = 'staratlas';

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

	// const data = await connection.getAccountInfo(creator.publicKey);
	// console.log(data);

	await createBuddyLinkMember(connection, multisigPda, devAccount);
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
		//instructions = await getCreateMemberInstructions(connection, vaultPda, BL_ORGANIZATION, config.buddyLinkKey);
		// The transfer is being signed from the Squads Vault, that is why we use the VaultPda
		instructions = [await getTransferSolInstruction(vaultPda, devAccount.publicKey, 0.01)];
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
	signature = await transferSol(connection, devAccount, vaultPda, 0.01);
	console.log('BuddyLink - Funds transfered to Vault:', signature);

	// Execute the transaction
	signature = await executeTransaction(connection, multisigPda, transactionIndex, devAccount);
	console.log('BuddyLink - Transaction executed:', signature);
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
	let { signature, transactionIndex } = await updateThreshold(connection, multisigPda, devAccount, threshold);
	console.log('Threshold Update - Proposal created:', signature);

	// Approve the transaction
	signature = await approveProposal(connection, multisigPda, transactionIndex, devAccount);
	console.log('Threshold Update - Transaction approved:', signature);

	// Execute the transaction
	signature = await executeTransaction(connection, multisigPda, transactionIndex, devAccount);
	console.log('Threshold Update - Transaction executed:', signature);
}

function getNewConnection(): Connection {
	if (ENV === 'prod') {
		return new Connection(config.rpc);
	} else {
		console.log('Running in DEV mode');
		return new Connection('http://localhost:8899', 'confirmed');
	}
}

async function getDevAccount(connection: Connection): Promise<Keypair> {
	const creator = getDevKeypair(config.devAccount.private);

	if (ENV !== 'prod') {
		await airdrop(connection, creator, 1);
	}

	return creator;
}

function getDevKeypair(privateKeyString?: string) {
	if (ENV === 'prod' && privateKeyString) {
		const privateKeyArray = bs58.decode(privateKeyString);
		return Keypair.fromSecretKey(privateKeyArray);
	} else {
		return Keypair.generate();
	}
}

createNewSquadWithBuddyLink();
