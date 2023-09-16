import {
	Connection,
	Keypair,
	LAMPORTS_PER_SOL,
	PublicKey,
	TransactionInstruction,
	SystemProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
//import { getCreateMemberInstructions } from './libs/buddylink.js';
import {
	createSquadProposal,
	createSimpleSquad,
	getVaultPdaForMultiSig,
	approveProposal,
	executeTransaction,
	getProposalDetails,
	getSquadDetails,
} from './lib/squads.js';
// @ts-ignore
import config from './config.json' assert { type: 'json' };

const ENV: 'prod' | 'dev' = 'dev';
// const BL_ORGANIZATION = 'staratlas';

async function createNewSquadWithBuddyLink() {
	const connection = getNewConnection();
	const creator = getCreatorKeypair(config.feePayer.private);
	const members = config.members.map((keyString: string) => new PublicKey(keyString));

	if (ENV !== 'prod') {
		await airdrop(connection, creator);
	}

	// Add the temporary creator to the member-list; this key will be removed at the end
	members.unshift(creator.publicKey);
	console.log(`Creator & Fee payer: ${creator.publicKey}`);

	// Create the Squad with temporary threshold 1, so that our creator can finish setting things up
	const { multisigPda, signature: creationSignature } = await createSimpleSquad(connection, creator, members, 1);
	console.log('Multisig created:', creationSignature);

	const multisigAccount = await getSquadDetails(connection, multisigPda);
	console.log('MultiSig:', JSON.stringify(multisigAccount, undefined, ' '));

	// const data = await connection.getAccountInfo(creator.publicKey);
	// console.log(data);

	const vaultPda = getVaultPdaForMultiSig(multisigPda);
	console.log('Vault account:', vaultPda);

	// Get the BuddyLink creation instruction
	let instructions: TransactionInstruction[];
	try {
		//instructions = await getCreateMemberInstructions(connection, vaultPda, BL_ORGANIZATION, config.buddyLinkKey);
		instructions = [await getTransferInstruction(vaultPda, creator.publicKey)];
	} catch (err) {
		console.error(err);
		return;
	}

	// Create a MultiSig transaction using the BuddyLink instructions
	let { signature, transactionIndex } = await createSquadProposal(connection, multisigPda, instructions, creator);
	console.log('BuddyLink referral Transaction created:', signature);

	const proposal = await getProposalDetails(connection, multisigPda, transactionIndex);
	console.log('Proposal:', JSON.stringify(proposal, undefined, ' '));

	// Approve the transaction
	signature = await approveProposal(connection, multisigPda, transactionIndex, creator);
	console.log('Transaction approved:', signature);

	// Execute the transaction
	signature = await executeTransaction(connection, multisigPda, transactionIndex, creator);
	console.log('Transaction executed:', signature);
}

function getNewConnection(): Connection {
	if (ENV === 'prod') {
		return new Connection(config.rpc);
	} else {
		console.log('Running in DEV mode');
		return new Connection('http://localhost:8899', 'confirmed');
	}
}

function getCreatorKeypair(privateKeyString?: string) {
	if (ENV === 'prod' && privateKeyString) {
		const privateKeyArray = bs58.decode(privateKeyString);
		return Keypair.fromSecretKey(privateKeyArray);
	} else {
		return Keypair.generate();
	}
}

async function airdrop(connection: Connection, creator: Keypair) {
	const airdropSignature = await connection.requestAirdrop(creator.publicKey, 1 * LAMPORTS_PER_SOL);
	return connection.confirmTransaction(airdropSignature);
}

function getTransferInstruction(vaultPda: PublicKey, to: PublicKey) {
	// The transfer is being signed from the Squads Vault, that is why we use the VaultPda
	return SystemProgram.transfer({
		fromPubkey: vaultPda,
		lamports: LAMPORTS_PER_SOL,
		toPubkey: to,
	});
}

createNewSquadWithBuddyLink();