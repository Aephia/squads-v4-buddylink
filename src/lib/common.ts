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
