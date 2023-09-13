# Squad-v4-buddylink

Set up a brand new Squad (Version 4), with a Buddylink (Version 4) referral link.

Note: All Squad members will have all permissions. If this is not your intent, feel free to implement support for custom permissions and please do submit a PR.

## Steps

1. Create a (new) dev-only Solana account, fund it with 0.1 SOL (or thereabouts) and export the private key
2. Duplicate `config.example.json` to `config.json` and make sure to overwrite the dummy data:
 - feePayer: the public & private key of your dev-only account
 - members: Array of public keys you want to include in the Squad
 - buddyLinkKey: the name (alphanumeric values only! no spaces or dashes) you want to use for your referral link
 3. Run `npm run build` followed by `npm run execute`
 4. Copy the output for now and store it somewhere in your notes

## Workflow

1. Create a new Squad with the members supplied + the dev-only account and with threshold set to 1
2. Create a BuddyLink referral proposal in the Squad
3. Use the dev-only account to apporve & execute the transaction

TODO:
4. Update the threshold of the Squad to the value provided in config.json
5. Remove dev-only from the Squad

Done.

## Development

To set up a local testserver, follow these steps:

1. Install the Solana CLI tools if you haven't already. Go to https://docs.solana.com/cli/install-solana-cli-tools for instructions
2. navigate to a suitable folder/directory and run the following in this order:
3. `solana program dump --url mainnet-beta BUDDYtQp7Di1xfojiCSVDksiYLQx511DPdj2nbtG9Yu5 buddylink.so`
You should now see "Wrote program to buddylink.so"
4. `solana program dump --url mainnet-beta SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf squads.so`
You should now see "Wrote program to squads.so"
3. Run `solana-test-validator --bpf-program BUDDYtQp7Di1xfojiCSVDksiYLQx511DPdj2nbtG9Yu5 buddylink.so --bpf-program SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf squads.so --reset`

## Future development

- Make it work
- Finalize workflow steps 4 + 5
- Add code to create a transaction to claim all earned BuddyLink assets

