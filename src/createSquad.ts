import {
	Connection,
	Keypair,
	PublicKey,
	TransactionInstruction,
} from '@solana/web3.js';
import { getTransferSolInstruction, transferSol } from './lib/solana.js';
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
	createPermissionChangeProposal,
	createCombinedPermissionChangeAndThresholdProposal,
} from './lib/squads.js';
import { BuddyLinkConfig, Environment, LogType, SquadConfig } from './types.js';
import { Permissions, Permission } from '@sqds/multisig/lib/types.js';
import { log } from './utils.js';

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

	// Create the Squad with temporary threshold 1, so that our dev account can set everything up
	const { multisigPda, vaultPda, signature: creationSignature } = await createSimpleSquad(connection, createKey, creator, memberKeys, 1);
	log('Created new Squads MultiSig:', LogType.HIGHLIGHT);
	log(multisigPda.toString(), LogType.DETAILS, 'MultiSig PDA:');
	log(vaultPda.toString(), LogType.DETAILS, 'Vault PDA:');
	log(creationSignature, LogType.SIGNATURE);
	log('', LogType.NORMAL);
	
	let success: boolean;

	if (env === Environment.LOCAL) {
		success = await transferFromVault(connection, multisigPda, creator); // Use this to test only Squads-code (required on LOCAL env)
		if (!success) {
			throw('Could not execute SOL Transfer');
		}
	} else {
		const success = await createBuddyLinkMember(
			connection,
			multisigPda,
			creator,
			buddyLinkConfig.orgName,
			buddyLinkConfig.memberName,
			env,
		);

		if (!success) {
			throw('Could not create BuddyLink Member');
		}
	}
	
	await tidyUpSquad(connection, multisigPda, creator, squadConfig.threshold);

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
async function createBuddyLinkMember(connection: Connection, multisigPda: PublicKey, creator: Keypair, orgName: string, memberName: string, env: Environment): Promise<boolean> {
	const vaultPda = getVaultPdaForMultiSig(multisigPda);

	// Get the BuddyLink creation instruction
	let instructions: TransactionInstruction[];
	try {
		instructions = await getCreateMemberInstructions(connection, vaultPda, orgName, memberName, env);
	} catch (err) {
		log(err as string, LogType.ERROR);
		return false;
	}

	// Wire some funds to the Vault
	let signature = await transferSol(connection, creator, vaultPda, 0.04);
	log('The Vault was funded', LogType.HIGHLIGHT);
	log(signature, LogType.SIGNATURE);
	log('', LogType.NORMAL);

	// Create a MultiSig transaction using the BuddyLink instructions
	let { signatures, transactionIndex } = await createSquadProposal(connection, multisigPda, instructions, creator, "Create a BuddyLink referral");
	log('Transaction & Proposal created for BuddyLink Creation', LogType.HIGHLIGHT);
	log(signatures[0], LogType.SIGNATURE);
	log(signatures[1], LogType.SIGNATURE);
	log('', LogType.NORMAL);

	// Approve the transaction
	signature = await approveProposal(connection, multisigPda, transactionIndex, creator);
	log('Proposal approved', LogType.HIGHLIGHT);
	log(signature, LogType.SIGNATURE);
	log('', LogType.NORMAL);

	// Execute the transaction
	signature = await executeTransactionWithComputeLimit(connection, multisigPda, transactionIndex, creator, 500000, 1);
	log('Transaction executed - BuddyLink Member created', LogType.HIGHLIGHT);
	log(signature, LogType.SIGNATURE);
	log('', LogType.NORMAL);

	return true;
}

/**
 * Create and execute a proposal to transfer some SOL to the devAccount
 * 
 * Note: This is only used to check the full Squads-runthrough without using
 * any BuddyLink dependency.
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @param devAccount Solana account that is going to pay for all this
 * @returns 
 */
async function transferFromVault(connection: Connection, multisigPda: PublicKey, devAccount: Keypair): Promise<boolean> {
	const vaultPda = getVaultPdaForMultiSig(multisigPda);

	// Get the Transfer instruction
	let instructions: TransactionInstruction[];
	try {
		// The transfer is being signed from the Squads Vault, that is why we use the VaultPda
		instructions = [await getTransferSolInstruction(vaultPda, devAccount.publicKey, 0.01)];
	} catch (err) {
		log(err as string, LogType.ERROR);
		return false;
	}

	// Create a MultiSig transaction using the Transfer instructions
	let { signatures, transactionIndex } = await createSquadProposal(connection, multisigPda, instructions, devAccount);
	log('Transaction & Proposal created for SOL Transfer', LogType.HIGHLIGHT);
	log(signatures[0], LogType.SIGNATURE);
	log(signatures[1], LogType.SIGNATURE);
	log('', LogType.NORMAL);

	// Approve the transaction
	let signature = await approveProposal(connection, multisigPda, transactionIndex, devAccount);
	log('Proposal approved', LogType.HIGHLIGHT);
	log(signature, LogType.SIGNATURE);
	log('', LogType.NORMAL);

	// Wire some funds to the Vault
	signature = await transferSol(connection, devAccount, vaultPda, 0.01);
	log('The Vault was funded', LogType.HIGHLIGHT);
	log(signature, LogType.SIGNATURE);
	log('', LogType.NORMAL);

	// Execute the transaction
	signature = await executeTransaction(connection, multisigPda, transactionIndex, devAccount);
	log('Transaction executed - SOL Transfer complete', LogType.HIGHLIGHT);
	log(signature, LogType.SIGNATURE);
	log('', LogType.NORMAL);

	return true;
}

/**
 * Create and execute a proposal to update the Squad threshold
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @param devAccount Solana account that is going to pay for all this
 * @param newThreshold The new threshold
 * @returns 
 */
async function updateSquadThreshold(
	connection: Connection,
	multisigPda: PublicKey,
	devAccount: Keypair,
	newThreshold: number
) {
	let { signatures, transactionIndex } = await createThresholdUpdateProposal(
		connection,
		multisigPda,
		devAccount,
		newThreshold
	);
	log(`Transaction & Proposal created for Threshold change (to ${newThreshold})`, LogType.HIGHLIGHT);
	log(signatures[0], LogType.SIGNATURE);
	log(signatures[1], LogType.SIGNATURE);
	log('', LogType.NORMAL);

	// Approve the transaction
	let signature = await approveProposal(connection, multisigPda, transactionIndex, devAccount);
	log('Proposal approved', LogType.HIGHLIGHT);
	log(signature, LogType.SIGNATURE);
	log('', LogType.NORMAL);

	// Execute the transaction
	signature = await executeConfigTransaction(connection, multisigPda, transactionIndex, devAccount);
	log('Transaction executed - Threshold was updated', LogType.HIGHLIGHT);
	log(signature, LogType.SIGNATURE);
	log('', LogType.NORMAL);
}

/**
 * Create and execute a proposal to limit the devAccount's permissions to 'Initiate' only
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @param devAccount Solana account that is going to pay for all this
 */
async function limitDevAccountPermissions(connection: Connection, multisigPda: PublicKey, devAccount: Keypair) {
	let { signatures, transactionIndex } = await createPermissionChangeProposal(
		connection,
		multisigPda,
		devAccount,
		devAccount.publicKey,
		Permissions.fromPermissions([Permission.Initiate])
	);
	log(`Transaction & Proposal created for Permission Downgrade`, LogType.HIGHLIGHT);
	log(signatures[0], LogType.SIGNATURE);
	log(signatures[1], LogType.SIGNATURE);
	log('', LogType.NORMAL);

	// Approve the transaction
	let signature = await approveProposal(connection, multisigPda, transactionIndex, devAccount);
	log('Proposal approved', LogType.HIGHLIGHT);
	log(signature, LogType.SIGNATURE);
	log('', LogType.NORMAL);

	// Execute the transaction
	signature = await executeConfigTransaction(connection, multisigPda, transactionIndex, devAccount);
	log('Transaction executed - Permissions were downgraded', LogType.HIGHLIGHT);
	log(signature, LogType.SIGNATURE);
	log('', LogType.NORMAL);
}

/**
 * Create and execute a proposal to:
 * - limit the devAccount's permissions to 'Initiate' only
 * - update the Squad's threshold
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @param devAccount Solana account that is going to pay for all this
 * @param threshold The new threshold
 */
async function tidyUpSquad(connection: Connection, multisigPda: PublicKey, devAccount: Keypair, newThreshold: number) {
	let { signatures, transactionIndex } = await createCombinedPermissionChangeAndThresholdProposal(
		connection,
		multisigPda,
		devAccount,
		devAccount.publicKey,
		Permissions.fromPermissions([Permission.Initiate]),
		newThreshold
	);
	log(
		`Transaction & Proposal created for Permission downgrade & Threshold change (to ${newThreshold})`,
		LogType.HIGHLIGHT
	);
	log(signatures[0], LogType.SIGNATURE);
	log(signatures[1], LogType.SIGNATURE);
	log('', LogType.NORMAL);

	// Approve the transaction
	let signature = await approveProposal(connection, multisigPda, transactionIndex, devAccount);
	log('Proposal approved', LogType.HIGHLIGHT);
	log(signature, LogType.SIGNATURE);
	log('', LogType.NORMAL);

	// Execute the transaction
	signature = await executeConfigTransaction(connection, multisigPda, transactionIndex, devAccount);
	log('Transaction executed - Permissions were downgraded & Threshold was updated', LogType.HIGHLIGHT);
	log(signature, LogType.SIGNATURE);
	log('', LogType.NORMAL);
}
