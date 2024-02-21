import { Connection, Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import inquirer, { ChoiceOptions, ListQuestionOptions } from 'inquirer';
import { BuddyLinkConfig, Environment, LogType, Settings } from './types.js';
import { log } from './utils.js';
import {
	getClaimGoldenTicketInstructions,
	getClaimTreasuryInstructions,
	getClaimableBalance,
	getClaimableTickets,
	getBuddyLinkClient,
	getMember,
	getMemberStatistics,
	getProfile,
	getTreasuries,
	getTreasuryContributors,
} from './lib/buddylink.js';
import { Client, Member, Treasury } from '@ladderlabs/buddy-sdk';
import { createSquadProposal } from './lib/squads.js';
import { MemberStatisticsAccount } from '@ladderlabs/buddy-sdk/dist/esm/models/Member.js';

interface Answers {
	claim: RewardType;
}

enum RewardType {
	NONE = 'NONE',
	ATLAS = 'ATLAS',
	USDC = 'USDC',
	GOLDEN_TICKETS = 'GoldenTickets',
}

interface PendingReward {
	mint: string;
	symbol: string;
	balance: number;
	prettyBalance: number;
}

interface BuddyLinkDetails {
	member: Member | null;
	treasuries: Treasury[];
	pendingRewards: PendingReward[];
}

interface ClaimPendingRewardConfig {
	reward: PendingReward;
	member: Member | null;
	treasuries: Treasury[];
	multisigPda: string;
	creator: Keypair;
}
const rewardOptions: Record<string, ChoiceOptions> = {
	[RewardType.ATLAS]: {
		name: 'ATLAS',
		value: RewardType.ATLAS,
	},
	[RewardType.USDC]: {
		name: 'USDC',
		value: RewardType.USDC,
	},
	[RewardType.GOLDEN_TICKETS]: {
		name: 'Golden Tickets',
		value: RewardType.GOLDEN_TICKETS,
	},
};

export async function manageReferralRewards(
	connection: Connection,
	creator: Keypair,
	settings: Settings,
	config: BuddyLinkConfig,
	env: Environment
) {
	const { member, treasuries, pendingRewards } = await showBuddyLinkData(
		connection,
		settings,
		config,
		env
	);
	if (!pendingRewards.length) {
		return;
	}

	let claimCreatedFor: RewardType | undefined;
	while (pendingRewards.length > 0 && claimCreatedFor !== RewardType.NONE) {
		const claimCreatedFor = await promptClaimReward(pendingRewards);

		if (claimCreatedFor === RewardType.NONE) {
			return;
		}

		const reward = pendingRewards.find(({ symbol }) => symbol === claimCreatedFor)!;
		await claimPendingReward(connection, {
			reward,
			member,
			treasuries,
			multisigPda: settings?.multisigPda!,
			creator,
		});

		const index = pendingRewards.findIndex(({ symbol }) => symbol === claimCreatedFor)!;
		pendingRewards.splice(index, 1);
	}

	if (!pendingRewards.length) {
		log('There are no (more) pending reward outstanding!', LogType.DETAILS);
	}
}

export async function showBuddyLinkData(
	connection: Connection,
	settings: Settings,
	config: BuddyLinkConfig,
	env: Environment
): Promise<BuddyLinkDetails> {
	const vaultPda = new PublicKey(settings.vaultPda!);
	const member = await getMember(connection, config.orgName, config.memberName, vaultPda, env);
	const client = getBuddyLinkClient(connection, vaultPda, env);

	log('Buddy Link:', LogType.HIGHLIGHT);
	if (member) {
		log(`https://play.staratlas.com/?r=${member?.account.name}`, LogType.SPOTLIGHT);
	} else {
		log('BuddyLink Member does not exist!', LogType.ERROR);
	}
	
	const profile = await getProfile(connection, vaultPda, env);
	if (profile) {
		log(profile?.account.authority.toString(), LogType.DETAILS, 'Authority:');
	} else {
		log('BuddyLink Profile does not exist!', LogType.ERROR);
	}

	let stats: MemberStatisticsAccount | null = null;
	if (member) {
		try {
			stats = await getMemberStatistics(member!);
		} catch (err) {
			log('An error occured while fetching the BuddyLink Member Stats!', LogType.ERROR);
			log(err as string, LogType.NORMAL);
		}
	}
	if (stats) {
		log(`${stats.totalReferrerVolume.divn(1e6).toString()} USDC`, LogType.DETAILS, 'Total referred volume:');
	}

	const treasuries = await getTreasuries(connection, vaultPda, env);
	const balances = await Promise.all(treasuries.map((treasury) => getClaimableBalance(treasury)));
	const referees = await getReferrees(client, treasuries);
	const claimableBalanceNum = balances.filter((balance) => !!balance).length;
	const pendingRewards: PendingReward[] = [];
	
	log(`${referees.length}`, LogType.DETAILS, `Referees:`);
	log('', LogType.NORMAL);

	log(`Treasuries (${treasuries.length}):`, LogType.HIGHLIGHT);
	if (!treasuries.length) {
		log('No treasuries could be found!', LogType.ERROR);
	} else if (!claimableBalanceNum) {
		log(`No claimable balances`, LogType.DETAILS);
	} else if (claimableBalanceNum) {
		log(`${claimableBalanceNum} claimable balances:`, LogType.DETAILS);
		
		balances.forEach((balance, idx) => {
			const mint = treasuries[idx].account.mint.toString();
			const symbol = getTokenSymbolForMint(mint)!;
			const prettyBalance = getPrettyBalanceForMint(balance, mint)!;
			log(`${prettyBalance}`, LogType.DETAILS, `${symbol}:`);
			pendingRewards.push({
				mint,
				symbol,
				balance,
				prettyBalance,
			});
		});
	}
	log('', LogType.NORMAL);

	if (member) {
		const pendingTickets = await getClaimableTickets(member);
		if (pendingTickets > 0) {
			pendingRewards.push({
				mint: 'gt',
				symbol: RewardType.GOLDEN_TICKETS,
				balance: pendingTickets,
				prettyBalance: pendingTickets,
			});
		}
		log(`Golden Tickets:`, LogType.HIGHLIGHT);
		log(`${pendingTickets}`, LogType.DETAILS, `Claimable tickets:`);
		if (stats) {
			log(`${stats?.numberOfClaimedRewards.toNumber()}`, LogType.DETAILS, `Claimed tickets:`);
			log(`${stats?.lastClaimed.toString().length === 0 ? 'never' : new Date(+`${stats?.lastClaimed.toString()}000`)}`, LogType.DETAILS, 'Last claimed:');
		}
		log('', LogType.NORMAL);
	}

	return {
		member,
		treasuries,
		pendingRewards,
	};
}

async function claimPendingReward(connection: Connection, config: ClaimPendingRewardConfig) {
	const { reward, member, treasuries, multisigPda, creator } = config;
	let instructions: TransactionInstruction[] = [];
	if (reward.symbol === RewardType.ATLAS || reward.symbol === RewardType.USDC) {
		const treasury = treasuries.find((treasury) => treasury.account.mint.toString() === reward.mint)!;
		try {
			instructions = await getClaimTreasuryInstructions(treasury);
		} catch(err) {
			log(err as string, LogType.ERROR);
		}
	} else if (member) {
		try {
			instructions = await getClaimGoldenTicketInstructions(member, reward.balance);
		} catch(err) {
			log(err as string, LogType.ERROR);
		}
	}

	if (!instructions.length) {
		throw 'Failed to create Claim Proposal';
	}

	// Create a MultiSig transaction using the BuddyLink instructions
	let { signatures } = await createSquadProposal(
		connection,
		new PublicKey(multisigPda),
		instructions,
		creator,
		`Claim BuddyLink ${reward.symbol} reward`
	);
	log(`Transaction & Proposal created to claim ${reward.symbol}!`, LogType.HIGHLIGHT);
	log(signatures[0], LogType.SIGNATURE);
	log(signatures[1], LogType.SIGNATURE);
	log('', LogType.NORMAL);
}

async function promptClaimReward(pendingRewards: PendingReward[]): Promise<RewardType> {
	const choices: ChoiceOptions[] = [];
	pendingRewards.forEach((reward) => {
		choices.push(rewardOptions[reward.symbol]);
	});

	const question: ListQuestionOptions = {
		name: 'claim',
		message: 'For which claimable reward do you want to create a "Claim"-proposal?',
		default: 'none',
		type: 'list',
		choices: [
			{
				name: 'None at this time',
				value: RewardType.NONE,
			},
			...choices,
		],
	};

	try {
		const answers = await inquirer.prompt<Answers>([question]);
		return answers.claim;
	} catch (err) {
		console.log(err);
		return RewardType.NONE;
	}
}

async function getReferrees(client: Client, treasuries: Treasury[]): Promise<string[]> {
	const members = await Promise.all(treasuries.map((treasury) => getTreasuryContributors(client, treasury)));
	const referees = new Set<string>;
	treasuries.forEach((_, index) => {
		members[index].forEach((member) => referees.add(member.account.owner.toString()));
		//console.log([...referees[index].values()]);
	});

	return [...referees.values()];
}

function getTokenSymbolForMint(mint: string) {
	if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
		return RewardType.USDC;
	} else if (mint === 'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx') {
		return RewardType.ATLAS;
	}
}

function getPrettyBalanceForMint(balance: number, mint: string) {
	if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
		return balance / Math.pow(10, 6);
	} else if (mint === 'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx') {
		return balance / Math.pow(10, 8);
	}
}
