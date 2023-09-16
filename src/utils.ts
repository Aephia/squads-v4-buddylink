import { Connection, TransactionSignature, RpcResponseAndContext, SignatureResult } from '@solana/web3.js';

export async function confirmTransaction(
	connection: Connection,
	signature: TransactionSignature
): Promise<RpcResponseAndContext<SignatureResult>> {
	const latestBlockHash = await connection.getLatestBlockhash();

	return connection.confirmTransaction({
		blockhash: latestBlockHash.blockhash,
		lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
		signature: signature,
	});
}
