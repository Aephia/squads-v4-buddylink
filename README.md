# Squad-v4-buddylink

Set up a brand new Squad (Version 4), with a Buddylink (Version 4) referral link.

This script creates a brand new Squads V4 multisig and creates a BuddyLink referral attached to the multisig's Vault.

Squads V4 will offer a Permission system, but for the sake of keeping things simple this script assings full permissions
to all members. If this is not your intent, feel free to implement support for custom permissions and please do submit a PR.

## Steps

1. Get access to a proper RPC server. There are several easy and free options. Here is one:
 - Go to https://www.hellomoon.io/developers
 - Connect a random Wallet
 - Sign the message
 - Click "Start building for free".
 - Take note of the RPC addresses
2. Create a (new) dev-only Solana account, fund it with 0.1 SOL (or thereabouts) and export the private key
3. Duplicate `config.example.json` to `config.json` and make sure to overwrite the dummy data:
 - `mainnetAccount``: the public & private key of your dev-only account
 - `squads.members``: Array of public keys you want to include in the Squad
 - `squads.threshold``: The minimum number of approvals required to execute a transaction
 - `buddyLink.memberName`: the name (alphanumeric values only! no spaces or dashes) you want to use for your referral link
4. It is recommended to repeat the Solana account creation and supply a different address in order to have a separate devnet-account
 - You can fund the devnet account here: https://solfaucet.com
 - Note: You can use the same account as mainnet of course, but having a separate one might be safer
 - enter the devnet account details in the `config.json`'s `devnetAccount` property.
5. Run `npm i`
6. Run `npm run build` followed by `npm run execute`
 
The above will run the whole thing on devnet. If everything worked as intended, you should:
- See a referral link in the output
- Have a new `settings.json` file in the root-folder of the project

You can then continue repeating this on mainnet:
7. Delete the `settings.json` file that now was created.
8. In your `config.json`-file, change the `mode` to "prod"

## What It Does

1. Create a new Squad with the members supplied, but adds the dev-only account. The Squad is being created with its threshold set to 1 (this is temporary, but allows the dev-account to run the show for now)
2. Create a BuddyLink referral proposal in the Squad
3. Use the dev-only account to approve & execute the transaction
4. Update the threshold of the Squad to the value provided in config.json

[WIP:]
5. Create a proposal to limit permissions of dev-only account to `Initiate` only.

Lastly, it stores your vault details in a `settings.json` file.

## Next

If everything went as planned, leave the `settings.json` file intact. If you run the script again with `npm run execute` it will not create a new Squad, but instead only check your outstanding BuddyLink balances

## Future Development

- Finalize workflow step 5
- Add code to create a transaction+proposal to claim all earned BuddyLink assets. This is why the devAccount will get limited permissions, and is not simply removed. 
- Add code to claim GoldenTickets

## Development

If you want to help with development, or you run into crazy issues that require a more controlled environment for testing, please follow the below instructions:

If you don't already have a local Solana validator available, set up a local testserver by following these steps:

1. Install the Solana CLI tools if you haven't already. Go to https://docs.solana.com/cli/install-solana-cli-tools for instructions
2. Navigate to a suitable folder/directory and run the following in this order:
3. Run `solana program dump --url mainnet-beta BUDDYtQp7Di1xfojiCSVDksiYLQx511DPdj2nbtG9Yu5 buddylink.so`
You should now see "Wrote program to buddylink.so"
4. Run `solana program dump --url mainnet-beta SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf squads.so`
You should now see "Wrote program to squads.so"
5. Run `solana-test-validator --bpf-program BUDDYtQp7Di1xfojiCSVDksiYLQx511DPdj2nbtG9Yu5 buddylink.so --bpf-program SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf squads.so --reset`
6. In your `config.json` set the `mode` to "local"
