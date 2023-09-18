import {
	Connection,
	Keypair,
	PublicKey,
	TransactionInstruction,
	TransactionMessage,
	TransactionSignature,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig/lib/index.js';
import { confirmTransaction } from '../utils.js';
const { Permissions } = multisig.types;
import { Multisig } from '@sqds/multisig/lib/generated/accounts/Multisig.js';
import { Proposal } from '@sqds/multisig/lib/generated/accounts/Proposal.js';
// const { Multisig, Proposal } = multisig.accounts;

/**
 * Create a Squad where all members have max permissions, and there is no timelock and no configAuhority
 *
 * @param connection RPC Connection
 * @param creator Keypair that is going to pay for all this (create a burner, fund it and import the keys)
 * @param memberList List of public keys for the initial Squad members
 * @param threshold Minimum approvals required to let a vote pass (has to be <= memberList size)
 * @returns The Multisig PDA and transaction signanture
 */
export async function createSimpleSquad(
	connection: Connection,
	creator: Keypair,
	memberList: PublicKey[],
	threshold: number
): Promise<{ multisigPda: PublicKey; signature: TransactionSignature }> {
	if (threshold > memberList.length) {
		throw "Threshold can't be greater than the total number of Squad members";
	}

	const createKey = Keypair.generate().publicKey;
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
	});

	await confirmTransaction(connection, signature);

	return {
		multisigPda,
		signature,
	};
}

export async function createSquadProposal(
	connection: Connection,
	multisigPda: PublicKey,
	instructions: TransactionInstruction[],
	feePayer: Keypair
): Promise<{ signature: TransactionSignature; transactionIndex: bigint }> {
	const vaultPda = getVaultPdaForMultiSig(multisigPda);
	const transactionIndex = await getNextTransactionIndex(connection, multisigPda);

	// Here we are adding all the instructions that we want to be executed in our transaction
	const transactionMessage = new TransactionMessage({
		payerKey: vaultPda,
		recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
		instructions,
	});

	const txSignature = await multisig.rpc.vaultTransactionCreate({
		connection,
		feePayer,
		multisigPda,
		transactionIndex,
		creator: feePayer.publicKey,
		vaultIndex: 0,
		ephemeralSigners: 0,
		transactionMessage,
	});

	console.log('Vault Transaction created: ', txSignature);
	await confirmTransaction(connection, txSignature);

	let signature = await multisig.rpc.proposalCreate({
		connection,
		feePayer,
		multisigPda,
		transactionIndex,
		creator: feePayer,
	});

	console.log('Proposal created: ', signature);
	await confirmTransaction(connection, signature);
	return { signature, transactionIndex };
}

export async function approveProposal(
	connection: Connection,
	multisigPda: PublicKey,
	transactionIndex: bigint,
	creator: Keypair
): Promise<TransactionSignature> {
	const signature = await multisig.rpc.proposalApprove({
		connection,
		feePayer: creator,
		multisigPda,
		transactionIndex,
		member: creator,
	});

	await confirmTransaction(connection, signature);
	return signature;
}

export async function executeTransaction(
	connection: Connection,
	multisigPda: PublicKey,
	transactionIndex: bigint,
	creator: Keypair
): Promise<TransactionSignature> {
	const signature = await multisig.rpc.vaultTransactionExecute({
		connection,
		feePayer: creator,
		multisigPda,
		transactionIndex,
		member: creator.publicKey,
		signers: [creator],
	});

	await confirmTransaction(connection, signature);
	return signature;
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
