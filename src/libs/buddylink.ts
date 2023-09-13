import { Client } from '@ladderlabs/buddy-sdk';
import { Connection, Keypair, PublicKey, Signer, Transaction, TransactionInstruction } from '@solana/web3.js';

export async function createMember(connection: Connection, feePayer: Keypair, orgName: string, memberName: string) {
	const instructions = await getCreateMemberInstructions(connection, feePayer.publicKey, orgName, memberName);
	const transaction = new Transaction();
	
	transaction.add(...instructions);
	await sendTransaction(transaction, connection, feePayer, []);
}

export async function getCreateMemberInstructions(connection: Connection, signerKey: PublicKey, orgName: string, memberName: string): Promise<TransactionInstruction[]> {
	const client = new Client(connection, signerKey);
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
	signers: Signer[],
	commitment?: any
) {
	const { blockhash } = await connection.getLatestBlockhash();

	transaction.feePayer = payer.publicKey;
	transaction.recentBlockhash = blockhash;

	for (const signer of signers) {
		transaction.partialSign(signer);
	}

	transaction.partialSign(payer);

	const signature = await connection.sendRawTransaction(transaction.serialize());

	await connection.confirmTransaction(signature, commitment);
}
