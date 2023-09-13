module.exports = {
	validator: {
		killRunningValidators: true,
		programs: [],
		accounts: [
			{
				label: 'BuddyLink',
				accountId: 'BUDDYtQp7Di1xfojiCSVDksiYLQx511DPdj2nbtG9Yu5',
				executable: true,
			},
			{
				label: 'Squads V4',
				accountId: 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf',
				executable: true,
			},
		],
		jsonRpcUrl: '127.0.0.1',
		websocketUrl: '',
		commitment: 'confirmed',
		ledgerDir: './test-ledger',
		resetLedger: true,
		verifyFees: false,
		detached: false,
	},
	relay: {
		enabled: true,
		killlRunningRelay: true,
	},
	storage: {
		enabled: true,
		storageId: 'mock-storage',
		clearOnStart: true,
	},
};
