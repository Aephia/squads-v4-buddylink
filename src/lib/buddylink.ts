import { Connection, Keypair, PublicKey, Signer, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Client } from '@ladderlabs/buddy-sdk';
import { Environment } from '../types.js';
import { confirmTransaction } from '../utils.js';

const PROGRAM_ID_DEVNET = '9zE4EQ5tJbEeMYwtS2w8KrSHTtTW4UPqwfbBSEkUrNCA';

export async function createMember(connection: Connection, feePayer: Keypair, orgName: string, memberName: string) {
	const instructions = await getCreateMemberInstructions(connection, feePayer.publicKey, orgName, memberName);
	const transaction = new Transaction();
	
	transaction.add(...instructions);
	await sendTransaction(transaction, connection, feePayer, []);
}

export async function getCreateMemberInstructions(connection: Connection, signerKey: PublicKey, orgName: string, memberName: string, env = Environment.PROD): Promise<TransactionInstruction[]> {
	const client = getClient(connection, signerKey, env);
	const isAvailable = await client.member.isMemberAvailable(orgName, memberName);
	
	console.log(orgName, memberName, isAvailable);
	if (!isAvailable) {
		const member = await client.member.getByName(orgName, memberName);
		console.log(member);
		throw `MemberName "${memberName}" is not available`;
	}

	return await client.initialize.createMember(orgName, memberName);
}

export async function sendTransaction(
	transaction: Transaction,
	connection: Connection,
	payer: Keypair,
	signers: Signer[]
) {
	const { blockhash } = await connection.getLatestBlockhash();

	transaction.feePayer = payer.publicKey;
	transaction.recentBlockhash = blockhash;

	for (const signer of signers) {
		transaction.partialSign(signer);
	}

	transaction.partialSign(payer);

	const signature = await connection.sendRawTransaction(transaction.serialize());

	await confirmTransaction(connection, signature);
}

function getClient(connection: Connection, signerKey: PublicKey, env: Environment): Client {
	if (env === Environment.DEV) {
		return new Client(connection, signerKey, PROGRAM_ID_DEVNET);
	}
	return new Client(connection, signerKey);
}