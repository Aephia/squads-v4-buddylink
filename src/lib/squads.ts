import {
	Connection,
	Keypair,
	PublicKey,
	TransactionInstruction,
	TransactionMessage,
	TransactionSignature,
	VersionedTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig/lib/index.js';
import { Permissions } from '@sqds/multisig/lib/types.js';
import { Multisig } from '@sqds/multisig/lib/generated/accounts/Multisig.js';
import { Proposal } from '@sqds/multisig/lib/generated/accounts/Proposal.js';
import { translateAndThrowAnchorError } from '@sqds/multisig/lib/errors.js';
import {
	addFeeToInstructions,
	confirmTransaction,
	createOptimizedTransaction,
	getSetComputeLimitInstruction,
	getSetComputePriceInstruction,
} from './solana.js';

/**
 * Create a Squad where all members have max permissions, and there is no timelock and no configAuhority
 *
 * @param connection RPC Connection
 * @param creator Solana account that is going to pay for all this
 * @param memberList List of public keys for the initial Squad members
 * @param threshold Minimum approvals required to let a vote pass (has to be <= memberList size)
 * @returns The Multisig PDA and transaction signanture
 */
export async function createSimpleSquad(
	connection: Connection,
	createKey: PublicKey,
	creator: Keypair,
	memberList: PublicKey[],
	threshold: number,
	memo?: string
): Promise<{ multisigPda: PublicKey; vaultPda: PublicKey; signature: TransactionSignature }> {
	if (threshold > memberList.length) {
		throw "Threshold can't be greater than the total number of Squad members";
	}

	const [multisigPda] = multisig.getMultisigPda({ createKey });
	const signature = await multisig.rpc.multisigCreate({
		connection,
		createKey, // One time random Key (a UUID of sorts)
		creator, // The creator & fee payer
		multisigPda, // The PDA of the multisig
		configAuthority: null, // Config authority will be the system program
		threshold,
		members: memberList.map((memberKey) => ({
			key: memberKey,
			permissions: Permissions.all(),
		})),
		timeLock: 0, // Create without any time-lock
		memo,
	});

	await confirmTransaction(connection, signature);
	const vaultPda = getVaultPdaForMultiSig(multisigPda);

	return {
		multisigPda,
		vaultPda,
		signature,
	};
}

/**
 * Create a proposal to execute a custom transaction
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @param instructions The custom instructions that you want to execute in this transaction
 * @param proposingMember The proposing Solana account (must be a Squad member) 
 * @param memo Transaction/Proposal Description
 * @returns The signature of the proposal creation and related transaction index
 */
export async function createSquadProposal(
	connection: Connection,
	multisigPda: PublicKey,
	txInstructions: TransactionInstruction[],
	proposingMember: Keypair,
	memo?: string,
): Promise<{ signatures: TransactionSignature[]; transactionIndex: bigint }> {
	const transactionIndex = await getNextTransactionIndex(connection, multisigPda);
	const txSignature = await createNewSquadTransaction(
		connection,
		multisigPda,
		txInstructions,
		transactionIndex,
		proposingMember,
		memo,
	);

	// As this seems to be an unnecessary step, leave it out.
	//const propSignature = await createProposalForSquadTx(connection, multisigPda, transactionIndex, proposingMember);
	return {
		signatures: [txSignature /*, propSignature*/],
		transactionIndex,
	};
}

export async function createNewSquadTransaction(
	connection: Connection,
	multisigPda: PublicKey,
	txInstructions: TransactionInstruction[],
	transactionIndex: bigint,
	proposingMember: Keypair,
	memo?: string
): Promise<TransactionSignature> {
	const vaultPda = getVaultPdaForMultiSig(multisigPda);
	const blockhash = (await connection.getLatestBlockhash()).blockhash;

	// Add all the instructions that we want to execute with our Squad account
	const transactionMessage = new TransactionMessage({
		payerKey: vaultPda,
		recentBlockhash: blockhash,
		instructions: txInstructions,
	});

	// Wrap the instructions into the instruction that create the pending transactiom
	const mainInstruction = multisig.instructions.vaultTransactionCreate({
		multisigPda,
		transactionIndex,
		creator: proposingMember.publicKey,
		vaultIndex: 0,
		ephemeralSigners: 0,
		transactionMessage,
		memo,
	});

	// Create a transaction with correct compute limit and priority fee
	const { transaction: tx } = await createOptimizedTransaction({
		connection,
		programAddress: multisig.PROGRAM_ADDRESS,
		instructions: [mainInstruction],
		signerKey: proposingMember.publicKey,
	});
	
	tx.sign([proposingMember]);
	let txSignature: TransactionSignature;
	try {
		txSignature = await connection.sendTransaction(tx, {
			maxRetries: 5,
		});
	} catch (err) {
		translateAndThrowAnchorError(err);
	}

	await confirmTransaction(connection, txSignature);
	return txSignature;
}

export async function createProposalForSquadTx(
	connection: Connection,
	multisigPda: PublicKey,
	transactionIndex: bigint,
	proposingMember: Keypair
): Promise<TransactionSignature> {
	const blockhash = (await connection.getLatestBlockhash()).blockhash;
	const mainInstruction = multisig.instructions.proposalCreate({
		multisigPda,
		creator: proposingMember.publicKey,
		transactionIndex,
	});

	const instructions = await addFeeToInstructions([mainInstruction], 1, multisig.PROGRAM_ADDRESS);
	const message = new TransactionMessage({
		payerKey: proposingMember.publicKey,
		recentBlockhash: blockhash,
		instructions,
	}).compileToV0Message();

	const tx = new VersionedTransaction(message);
	tx.sign([proposingMember]);

	let txSignature: TransactionSignature;
	try {
		txSignature = await connection.sendTransaction(tx, {
			maxRetries: 5,
		});
	} catch (err) {
		translateAndThrowAnchorError(err);
	}

	await confirmTransaction(connection, txSignature);
	return txSignature;
}

export async function approveProposal(
	connection: Connection,
	multisigPda: PublicKey,
	transactionIndex: bigint,
	approvingMember: Keypair
): Promise<TransactionSignature> {
	const signature = await multisig.rpc.proposalApprove({
		connection,
		feePayer: approvingMember,
		multisigPda,
		transactionIndex,
		member: approvingMember,
	});
	await confirmTransaction(connection, signature);
	return signature;
}

export async function executeTransaction(
	connection: Connection,
	multisigPda: PublicKey,
	transactionIndex: bigint,
	executingMmember: Keypair
): Promise<TransactionSignature> {
	const signature = await multisig.rpc.vaultTransactionExecute({
		connection,
		feePayer: executingMmember,
		multisigPda,
		transactionIndex,
		member: executingMmember.publicKey,
		signers: [executingMmember],
	});
	await confirmTransaction(connection, signature);
	return signature;
}

export async function executeTransactionWithComputeLimit(
	connection: Connection,
	multisigPda: PublicKey,
	transactionIndex: bigint,
	executingMember: Keypair,
	computeLimit: number,
	microLamports: number,
): Promise<TransactionSignature> {
	const blockhash = (await connection.getLatestBlockhash()).blockhash;
	const cuInstruction = getSetComputeLimitInstruction(computeLimit);
	const cpInstruction = getSetComputePriceInstruction(microLamports);
	const { instruction, lookupTableAccounts } = await multisig.instructions.vaultTransactionExecute({
		connection,
		multisigPda,
		member: executingMember.publicKey,
		transactionIndex,
	});

	const message = new TransactionMessage({
		payerKey: executingMember.publicKey,
		recentBlockhash: blockhash,
		instructions: [cuInstruction, cpInstruction, instruction],
	}).compileToV0Message(lookupTableAccounts);

	const tx = new VersionedTransaction(message);
	tx.sign([executingMember]);

	let signature: TransactionSignature;
	try {
		signature = await connection.sendTransaction(tx);
	} catch (err) {
		translateAndThrowAnchorError(err);
	}
	await confirmTransaction(connection, signature);
	return signature;
}

export async function executeConfigTransaction(
	connection: Connection,
	multisigPda: PublicKey,
	transactionIndex: bigint,
	executingMember: Keypair
): Promise<TransactionSignature> {
	const signature = await multisig.rpc.configTransactionExecute({
		connection,
		feePayer: executingMember,
		multisigPda,
		transactionIndex,
		member: executingMember,
		rentPayer: executingMember,
		signers: [executingMember],
	});
	await confirmTransaction(connection, signature);
	return signature;
}

/**
 * Create a proposal to update the Squad's voting threshold
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @param proposingMember The proposing Solana account
 * @param newThreshold The new threshold
 * @returns The signature of the proposal creation and related transaction index
 */
export async function createThresholdUpdateProposal(
	connection: Connection,
	multisigPda: PublicKey,
	proposingMember: Keypair,
	newThreshold: number
): Promise<{ signatures: TransactionSignature[]; transactionIndex: bigint }> {
	const transactionIndex = await getNextTransactionIndex(connection, multisigPda);
	const txSignature = await multisig.rpc.configTransactionCreate({
		connection,
		feePayer: proposingMember,
		multisigPda,
		transactionIndex,
		creator: proposingMember.publicKey,	
		actions: [
			{
				__kind: 'ChangeThreshold',
				newThreshold,
			},
		],
	});
	await confirmTransaction(connection, txSignature);

	const propSignature = await multisig.rpc.proposalCreate({
		connection,
		feePayer: proposingMember,
		multisigPda,
		transactionIndex,
		creator: proposingMember,
	});
	await confirmTransaction(connection, propSignature);
	return { signatures: [txSignature, propSignature], transactionIndex };
}

/**
 * Create a proposal to update a member's permissions
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @param proposingMember The proposing Solana account
 * @param targetMember The member whose permissions need to be altered
 * @param newPermissions The new permissions for targetMember
 * @returns The signature of the proposal creation and related transaction index
 */
export async function createPermissionChangeProposal(
	connection: Connection,
	multisigPda: PublicKey,
	proposingMember: Keypair,
	targetMember: PublicKey,
	newPermissions: Permissions,
): Promise<{ signatures: TransactionSignature[]; transactionIndex: bigint }> {
	const transactionIndex = await getNextTransactionIndex(connection, multisigPda);
	const txSignature = await multisig.rpc.configTransactionCreate({
		connection,
		feePayer: proposingMember,
		multisigPda,
		transactionIndex,
		creator: proposingMember.publicKey,
		actions: [
			{
				__kind: 'RemoveMember',
				oldMember: targetMember,
			},
			{
				__kind: 'AddMember',
				newMember: {
					key: targetMember,
					permissions: newPermissions,
				},
			},
		],
	});
	await confirmTransaction(connection, txSignature);

	const propSignature = await multisig.rpc.proposalCreate({
		connection,
		feePayer: proposingMember,
		multisigPda,
		transactionIndex,
		creator: proposingMember,
	});
	await confirmTransaction(connection, propSignature);
	return { signatures: [txSignature, propSignature], transactionIndex };
}

/**
 * Create a proposal to update a member's permissions and change the threshold in one go
 *
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @param proposingMember The proposing Solana account
 * @param targetMember The member whose permissions need to be altered
 * @param newPermissions The new permissions for targetMember
 * @returns The signature of the proposal creation and related transaction index
 */
export async function createCombinedPermissionChangeAndThresholdProposal(
	connection: Connection,
	multisigPda: PublicKey,
	proposingMember: Keypair,
	targetMember: PublicKey,
	newPermissions: Permissions,
	newThreshold: number
): Promise<{ signatures: TransactionSignature[]; transactionIndex: bigint }> {
	const transactionIndex = await getNextTransactionIndex(connection, multisigPda);
	const txSignature = await multisig.rpc.configTransactionCreate({
		connection,
		feePayer: proposingMember,
		multisigPda,
		transactionIndex,
		creator: proposingMember.publicKey,
		actions: [
			{
				__kind: 'RemoveMember',
				oldMember: targetMember,
			},
			{
				__kind: 'AddMember',
				newMember: {
					key: targetMember,
					permissions: newPermissions,
				},
			},
			{
				__kind: 'ChangeThreshold',
				newThreshold,
			},
		],
	});
	await confirmTransaction(connection, txSignature);

	const propSignature = await multisig.rpc.proposalCreate({
		connection,
		feePayer: proposingMember,
		multisigPda,
		transactionIndex,
		creator: proposingMember,
	});
	await confirmTransaction(connection, propSignature);
	return { signatures: [txSignature, propSignature], transactionIndex };
}

/**
 * Derive the PDA for the Squads Vault
 *
 * @param multisigPda The MultiSig PDA
 * @returns The vault PDA
 */
export function getVaultPdaForMultiSig(multisigPda: PublicKey, vaultIndex = 0): PublicKey {
	const [vaultPda] = multisig.getVaultPda({
		multisigPda,
		index: vaultIndex,
	});
	return vaultPda;
}

export async function getSquadDetails(connection: Connection, multisigPda: PublicKey): Promise<Multisig> {
	return Multisig.fromAccountAddress(connection, multisigPda);
}

export async function getProposalDetails(
	connection: Connection,
	multisigPda: PublicKey,
	transactionIndex: bigint
): Promise<Proposal> {
	const [proposalPda] = multisig.getProposalPda({
		multisigPda,
		transactionIndex,
	});

	return Proposal.fromAccountAddress(connection, proposalPda);	
}

/**
 * Get the current (last) transaction index for the Squad
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @returns Current transaction index
 */
export async function getLastTransactionIndex(connection: Connection, multisigPda: PublicKey): Promise<bigint> {
	const multisigAccount = await getSquadDetails(connection, multisigPda);
	return multisig.utils.toBigInt(multisigAccount.transactionIndex);
}

/**
 * Get the next (available) transaction index for the Squad
 * 
 * @param connection RPC Connection
 * @param multisigPda The MultiSig PDA
 * @returns Next transaction index
 */
export async function getNextTransactionIndex(connection: Connection, multisigPda: PublicKey): Promise<bigint> {
	const index = await getLastTransactionIndex(connection, multisigPda);
	return index + 1n;
}
