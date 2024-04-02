import {
	Connection,
	Keypair,
	LAMPORTS_PER_SOL,
	PublicKey,
	Transaction,
	TransactionSignature,
	SystemProgram,
	sendAndConfirmTransaction,
	ComputeBudgetProgram,
	TransactionInstruction,
	RpcResponseAndContext,
	SignatureResult,
} from '@solana/web3.js';
import { getEstimatedPriorityFee } from '../utils.js';
import { Configuration, Environment } from '../types.js';

export function getNewConnection(env: Environment, rpcOptions: Configuration['rpc']): Connection {
	if (env === Environment.PROD) {
		return new Connection(rpcOptions.mainnet);
	} else if (env === Environment.DEV) {
		return new Connection(rpcOptions.devnet, 'confirmed');
	} else {
		return new Connection(rpcOptions.local, 'confirmed');
	}
}

export function getSetComputeLimitInstruction(limit: number): TransactionInstruction {
	return ComputeBudgetProgram.setComputeUnitLimit({ units: limit });
}

export function getSetComputePriceInstruction(lamports: number): TransactionInstruction {
	return ComputeBudgetProgram.setComputeUnitPrice({ microLamports: lamports });
}

export async function addFeeToInstructions(
	mainInstructions: TransactionInstruction[],
	priorityFee: number,
	programAddress: string,
	computeLimit?: number
) {
	const instructions: TransactionInstruction[] = [];
	if (computeLimit) {
		instructions.push(getSetComputeLimitInstruction(computeLimit));
	}

	if (priorityFee === 1) {
		priorityFee = await getEstimatedPriorityFee(programAddress, true);
	}
	if (priorityFee) {
		console.log(`Using priority fee: ${priorityFee}`);
	}

	instructions.push(getSetComputePriceInstruction(priorityFee));
	instructions.push(...mainInstructions);
	return instructions;
}

export async function confirmTransaction(
	connection: Connection,
	signature: TransactionSignature
): Promise<RpcResponseAndContext<SignatureResult>> {
	const latestBlockHash = await connection.getLatestBlockhash();
	try {
		const result = await connection.confirmTransaction({
			blockhash: latestBlockHash.blockhash,
			lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
			signature: signature,
		});
		return result;
	} catch (err) {
		if (typeof err === 'string') {
			console.log(err)
		} else {
			console.error(`The following error occured while trying to confirm the transaction: ${(err as Error).name}`);
			console.log((err as Error).message);
		}
		throw err;
	}
}

export async function airdrop(
	connection: Connection,
	to: PublicKey,
	amountInSOL: number
): Promise<RpcResponseAndContext<SignatureResult>> {
	const airdropSignature = await connection.requestAirdrop(to, amountInSOL * LAMPORTS_PER_SOL);
	return confirmTransaction(connection, airdropSignature);
}

export function getTransferSolInstruction(from: PublicKey, to: PublicKey, amountInSOL: number): TransactionInstruction {
	return SystemProgram.transfer({
		fromPubkey: from,
		lamports: amountInSOL * LAMPORTS_PER_SOL,
		toPubkey: to,
	});
}

export function transferSol(
	connection: Connection,
	from: Keypair,
	to: PublicKey,
	amountInSOL: number
): Promise<TransactionSignature> {
	const transaction = new Transaction().add(getTransferSolInstruction(from.publicKey, to, amountInSOL));
	return sendAndConfirmTransaction(connection, transaction, [from]);
}
