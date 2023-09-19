import {
	Connection,
	Keypair,
	PublicKey,
	TransactionInstruction,
} from '@solana/web3.js';
import { getTransferSolInstruction, transferSol } from './lib/common.js';
import { getCreateMemberInstructions } from './lib/buddylink.js';
import {
	createSquadProposal,
	createSimpleSquad,
	getVaultPdaForMultiSig,
	approveProposal,
	executeTransaction,
	createThresholdUpdateProposal,
	executeTransactionWithComputeLimit,
	executeConfigTransaction,
	// getProposalDetails,
	// getSquadDetails,
} from './lib/squads.js';
import { BuddyLinkConfig, Environment, SquadConfig } from './types.js';

export async function createNewSquadWithBuddyLink(
	connection: Connection,
	creator: Keypair,
	squadConfig: SquadConfig,
	buddyLinkConfig: BuddyLinkConfig,
	env: Environment,
): Promise<{ createKey: PublicKey; multisigPda: PublicKey; vaultPda: PublicKey }> {
	const memberKeys = squadConfig.members.map((keyString: string) => new PublicKey(keyString));
	const createKey = squadConfig.createKey ? new PublicKey(squadConfig.createKey) : Keypair.generate().publicKey;

	// Add the devAccount to the member-list
	memberKeys.unshift(creator.publicKey);
	console.log(`Creator & Fee payer: ${creator.publicKey}`);

	// Create the Squad with temporary threshold 1, so that our dev account can set everything up
	const { multisigPda, vaultPda, signature: creationSignature } = await createSimpleSquad(connection, createKey, creator, memberKeys, 1);
	console.log('Multisig created:', creationSignature);

	buddyLinkConfig;
	env;

	// const multisigAccount = await getSquadDetails(connection, multisigPda);
	// console.log('MultiSig:', JSON.stringify(multisigAccount, undefined, ' '));

	// await createBuddyLinkMember(
	// 	connection,
	// 	multisigPda,
	// 	creator,
	// 	buddyLinkConfig.orgName,
	// 	buddyLinkConfig.memberName,
	// 	env
	// );
	await transferFromVault(connection, multisigPda, creator);
	await updateSquadThreshold(connection, multisigPda, creator, squadConfig.threshold);

	return {
		createKey,
		multisigPda,
		vaultPda,
	};
}

/**
 * Create and execute a proposal to create a new BuddyLink Member
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @param devAccount Solana account that is going to pay for all this
 * @returns 
 */
async function createBuddyLinkMember(connection: Connection, multisigPda: PublicKey, creator: Keypair, orgName: string, memberName: string, env: Environment) {
	const vaultPda = getVaultPdaForMultiSig(multisigPda);
	console.log('Vault account:', vaultPda.toString());

	// Get the BuddyLink creation instruction
	let instructions: TransactionInstruction[];
	try {
		instructions = await getCreateMemberInstructions(connection, vaultPda, orgName, memberName, env);
	} catch (err) {
		console.error(err);
		return;
	}

	// Create a MultiSig transaction using the BuddyLink instructions
	let { signature, transactionIndex } = await createSquadProposal(connection, multisigPda, instructions, creator);
	console.log('BuddyLink - Transaction created:', signature);

	// const proposal = await getProposalDetails(connection, multisigPda, transactionIndex);
	// console.log('Proposal:', JSON.stringify(proposal, undefined, ' '));

	// Approve the transaction
	signature = await approveProposal(connection, multisigPda, transactionIndex, creator);
	console.log('BuddyLink - Transaction approved:', signature);

	// Wire some funds to the Vault
	signature = await transferSol(connection, creator, vaultPda, 0.1);
	console.log('BuddyLink - Funds transfered to Vault:', signature);

	// Execute the transaction
	signature = await executeTransactionWithComputeLimit(connection, multisigPda, transactionIndex, creator, 300000);
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
	signature = await executeConfigTransaction(connection, multisigPda, transactionIndex, devAccount);
	console.log('Threshold Update - Transaction executed:', signature);
}
