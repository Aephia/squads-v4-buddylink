export enum Environment {
	PROD,
	DEV,
	LOCAL,
}

export interface Settings {
	createKey: string;
	multisigPda?: string;
	vaultPda?: string;
}

export interface Configuration {
	mode: string;
	rpc: {
		mainnet: string;
		devnet: string;
		local: string;
	};
	devnetAccount: {
		public: string;
		private: string;
	};
	mainnetAccount: {
		public: string;
		private: string;
	};
	squads: SquadConfig;
	buddyLink: BuddyLinkConfig;
}

export interface SquadConfig {
	createKey?: string;
	members: string[];
	threshold: number;
}

export interface BuddyLinkConfig {
	orgName: string;
	memberName: string;
}

export enum LogType {
	NORMAL,
	SIGNATURE,
	DETAILS,
	HIGHLIGHT,
	SPOTLIGHT,
	ERROR,
}