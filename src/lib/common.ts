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
import { confirmTransaction } from '../utils.js';
import { Configuration, Environment } from '../types.js';

export function getNewConnection(env: Environment, rpcOptions: Configuration['rpc']): Connection {
	if (env === Environment.PROD) {
		return new Connection(rpcOptions.mainnet);
	} else if (env === Environment.DEV) {
		console.log('Running in DEV mode');
		return new Connection(rpcOptions.devnet, 'confirmed');
	} else {
		console.log('Running in LOCAL DEV mode');
		return new Connection(rpcOptions.local, 'confirmed');
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

export function getSetComputeLimitInstruction(limit: number): TransactionInstruction {
	return ComputeBudgetProgram.setComputeUnitLimit({ units: limit });
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
