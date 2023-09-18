import {
	Connection,
	Keypair,
	LAMPORTS_PER_SOL,
	PublicKey,
	Transaction,
	TransactionSignature,
	SystemProgram,
	sendAndConfirmTransaction,
} from '@solana/web3.js';
import { confirmTransaction } from '../utils.js';

export async function airdrop(connection: Connection, creator: Keypair, amountInSOL: number) {
	const airdropSignature = await connection.requestAirdrop(creator.publicKey, amountInSOL * LAMPORTS_PER_SOL);
	return confirmTransaction(connection, airdropSignature);
}

export function getTransferInstruction(from: PublicKey, to: PublicKey, amountInSOL: number) {
	return SystemProgram.transfer({
		fromPubkey: from,
		lamports: amountInSOL * LAMPORTS_PER_SOL,
		toPubkey: to,
	});
}

export function transfer(
	connection: Connection,
	from: Keypair,
	to: PublicKey,
	amountInSOL: number
): Promise<TransactionSignature> {
	const transaction = new Transaction().add(getTransferInstruction(from.publicKey, to, amountInSOL));
	return sendAndConfirmTransaction(connection, transaction, [from]);
}
