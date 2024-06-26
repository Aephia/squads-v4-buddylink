import { Connection, Keypair, PublicKey, Signer, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Buddy, Client, Treasury } from '@ladderlabs/buddy-sdk';
import { Environment } from '../types.js';
import { confirmTransaction } from './solana.js';
import { Member, MemberStatisticsAccount } from '@ladderlabs/buddy-sdk/dist/esm/models/Member.js';

const PROGRAM_ID_DEVNET = '9zE4EQ5tJbEeMYwtS2w8KrSHTtTW4UPqwfbBSEkUrNCA';

export async function getCreateMemberInstructions(connection: Connection, signerKey: PublicKey, orgName: string, memberName: string, env = Environment.PROD): Promise<TransactionInstruction[]> {
	const client = getClient(connection, signerKey, env);
	const isAvailable = await client.member.isMemberAvailable(orgName, memberName);
	
	if (!isAvailable) {
		throw `MemberName "${memberName}" is not available`;
	}
	const instructions = [];

	const atlasMint = new PublicKey('ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx');
	const buddyName = Client.generateProfileName();

	instructions.push(...(await client.initialize.createMemberWithRewards(orgName, memberName, atlasMint, undefined, null, buddyName)));
	instructions.push(...(await client.initialize.createMemberStatistics(orgName, memberName)));

	return instructions;
}

export async function getMember(
	connection: Connection,
	orgName: string,
	memberName: string,
	signerKey: PublicKey,
	env = Environment.PROD
) {
	const client = getClient(connection, signerKey, env);
	return client.member.getByName(orgName, memberName);
}

export async function getMemberStatistics(member: Member): Promise<MemberStatisticsAccount | null> {
	return member.getStatistics();
}

export async function getTreasuries(connection: Connection, signerKey: PublicKey, env = Environment.PROD): Promise<Treasury[]> {
	const client = getClient(connection, signerKey, env);
	const profile = await client.buddy.getProfile(signerKey);

	if (profile) {
		return client.treasury.getAllByBuddy(profile?.account.pda);
	}

	return [];
}

export async function getProfile(connection: Connection, signerKey: PublicKey, env = Environment.PROD): Promise<Buddy | null> {
	const client = getClient(connection, signerKey, env);
	return client.buddy.getProfile(signerKey);
}

export function getClaimableBalance(treasury: Treasury): Promise<number> {
	return treasury.getClaimableBalance();
}

export async function getClaimableTickets(member: Member): Promise<number> {
	const stats = await member.getStatistics();
	if (!stats?.totalReferrerVolume) {
		return 0;
	}

	const pendingTickets = stats?.totalReferrerVolume.sub(stats?.numberOfClaimedRewardsInVolume ?? 0);
	return pendingTickets.divn(500).divn(1e6).toNumber();
}

export async function getTreasuryContributors(client: Client, treasury: Treasury): Promise<Member[]> {
	return client.member.getByTreasuryReferrer(treasury.account.pda);
}

export function getClaimTreasuryInstructions(treasury: Treasury): Promise<TransactionInstruction[]> {
	return treasury.claim();
}

export async function getClaimGoldenTicketInstructions(member: Member, amount = 1): Promise<TransactionInstruction[]> {
	return member.claimStarAtlas(amount);
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

export const getBuddyLinkClient = getClient;

function getClient(connection: Connection, signerKey: PublicKey | undefined, env: Environment): Client {
	if (env === Environment.DEV) {
		return new Client(connection, signerKey, PROGRAM_ID_DEVNET);
	}
	return new Client(connection, signerKey);
}