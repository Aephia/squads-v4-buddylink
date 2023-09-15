import {
	Connection,
	Keypair,
	PublicKey,
	TransactionInstruction,
	TransactionMessage,
	TransactionSignature,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
const { Permissions } = multisig.types;

/**
 * Create a Squad where all members have max permissions, and there is no timelock and no configAuhority
 *
 * @param connection RPC Connection
 * @param creator Keypair that is going to pay for all this (create a burner, fund it and import the keys)
 * @param memberList List of public keys for the initial Squad members
 * @param threshold Minimum approvals required to let a vote pass (has to be <= memberList size)
 * @returns
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
		sendOptions: {
			skipPreflight: true,
		},
	});

	return {
		multisigPda,
		signature,
	};
}

export async function createSquadTransaction(
	connection: Connection,
	multisigPda: PublicKey,
	instructions: TransactionInstruction[],
	feePayer: Keypair
): Promise<TransactionSignature> {
	const vaultPda = getVaultPdaForMultiSig(multisigPda);
	const transactionIndex = 1n;

	// Here we are adding all the instructions that we want to be executed in our transaction
	const transactionMessage = new TransactionMessage({
		payerKey: vaultPda,
		recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
		instructions,
	});

	console.log(
		JSON.stringify(
			{
				feePayer,
				multisigPda,
				creator: feePayer.publicKey,
				vaultIndex: 0,
				ephemeralSigners: 0,
				transactionMessage,
			},
			undefined,
			'  '
		)
	);

	return multisig.rpc.vaultTransactionCreate({
		connection,
		feePayer,
		multisigPda,
		transactionIndex,
		creator: feePayer.publicKey,
		vaultIndex: 0,
		ephemeralSigners: 0,
		transactionMessage,
	});
}

export function approveTransaction(
	connection: Connection,
	multisigPda: PublicKey,
	transactionIndex: bigint,
	creator: Keypair
): Promise<TransactionSignature> {
	return multisig.rpc.proposalApprove({
		connection,
		feePayer: creator,
		multisigPda,
		transactionIndex,
		member: creator,
	});
}

export async function executeTransaction(
	connection: Connection,
	multisigPda: PublicKey,
	transactionIndex: bigint,
	creator: Keypair
): Promise<TransactionSignature> {
	return await multisig.rpc.vaultTransactionExecute({
		connection,
		feePayer: creator,
		multisigPda,
		transactionIndex,
		member: creator.publicKey,
		signers: [creator],
	});
}

/**
 * Derive the PDA for the Squads Vault
 *
 * @param multisigPda The MultiSig PDA
 * @returns The vault PDA
 */
export function getVaultPdaForMultiSig(multisigPda: PublicKey): PublicKey {
	const [vaultPda] = multisig.getVaultPda({
		multisigPda,
		index: 0,
	});
	return vaultPda;
}
