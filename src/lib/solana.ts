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
	AddressLookupTableAccount,
	VersionedTransaction,
	TransactionMessage,
} from '@solana/web3.js';
import { getEstimatedPriorityFee } from '../utils.js';
import { Configuration, Environment } from '../types.js';

const CU_LIMIT_MULTIPLIER = 1.1;

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

export function getSetComputePriceInstruction(microLamports: number): TransactionInstruction {
	return ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
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

export async function getSimulationUnits(
	connection: Connection,
	instructions: TransactionInstruction[],
	payer: PublicKey,
	lookupTables: AddressLookupTableAccount[]
): Promise<number | undefined> {
	const testInstructions = [getSetComputeLimitInstruction(1_400_000), ...instructions];

	const testVersionedTxn = new VersionedTransaction(
		new TransactionMessage({
			instructions: testInstructions,
			payerKey: payer,
			recentBlockhash: PublicKey.default.toString(),
		}).compileToV0Message(lookupTables)
	);

	const simulation = await connection.simulateTransaction(testVersionedTxn, {
		replaceRecentBlockhash: true,
		sigVerify: false,
	});
	if (simulation.value.err) {
		return undefined;
	}
	return simulation.value.unitsConsumed;
}

interface OptimizeInstructionParams {
	connection: Connection;
	instructions: TransactionInstruction[];
	signerKey: PublicKey;
	programAddress?: string;
	lookupTables?: AddressLookupTableAccount[];
}

export async function createOptimizedTransaction({
	connection,
	instructions,
	signerKey,
	programAddress,
	lookupTables,
}: OptimizeInstructionParams) {
	const [microLamports, units, recentBlockhash] = await Promise.all([
		programAddress ? getEstimatedPriorityFee(programAddress, true) : 100,
		getSimulationUnits(connection, instructions, signerKey, lookupTables ?? []),
		connection.getLatestBlockhash(),
	]);

	console.log(`Using priority fee: ${microLamports}`);
	let optInstructions = [getSetComputePriceInstruction(microLamports)];
	if (units) {
		// probably should add some margin of error to units
		console.log(`Using CU limit: ${units * CU_LIMIT_MULTIPLIER}`);
		optInstructions.unshift(getSetComputeLimitInstruction(units * CU_LIMIT_MULTIPLIER));
	}

	return {
		transaction: new VersionedTransaction(
			new TransactionMessage({
				instructions: [...optInstructions, ...instructions],
				recentBlockhash: recentBlockhash.blockhash,
				payerKey: signerKey,
			}).compileToV0Message(lookupTables)
		),
		recentBlockhash,
	};
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
