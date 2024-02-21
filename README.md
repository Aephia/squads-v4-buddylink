# Squads-v4-BuddyLink

Set up a brand new Squads MultiSig (Version 4), with a Buddylink (Version 4) referral link.

Note: Squads V4 offers a cool Permission system, but for the sake of keeping things simple this script will simply give each member full permissions.
If this is not your intent, feel free to implement support for custom permissions and submit a PR.

## Prepare

If you are not a coder, you will need to download NodeJS first.

1. Go to https://nodejs.org/en and download the latest LTS version (left button)
2. Now click the green `<> Code`-button at the top of this page and select "Download ZIP"
3. Unzip at a location of your choosing
4. Open a CLI tool (Terminal on Mac), navigate to the folder and follow the steps in the next section

## Create DEV-account
In the interest of security, you will need to create a new Solana account (wallet). You do not need a new seed, simply creating a new account is enough (but this is up to you of course).

Now, you will need to fund it with at least 0.07 SOL (more is fine, but not required). Funding it can be done by simply sending it SOL from one of your other accounts. Note that from this 0.07 SOL, 0.04 SOL will be sent to the Multi-Sig Vault, as the Vault needs to pay for transactions as well.

## Steps

1. Get access to a proper RPC server. There are several easy and free options. Here is one:
 - Go to https://dev.helius.xyz/dashboard/app
 - Connect a random Wallet
 - Sign the message
 - Take note of the RPC addresses
2. If you have not done so already, Create a DEV-account by following the steps in the section above. Export the private key for the next step. Check your wallet docs to figure out how.
3. Duplicate `config.example.json` to `config.json` and make sure to overwrite the dummy data:
 - `rpc`: overwrite the mainnet and devnet values with the ones gotten in the first step
 - `mainnetAccount`: the public & private key of your dev-only account
 - `squads.members`: Array of public keys you want to include in the Squad
 - `squads.threshold`: The minimum number of approvals required to execute a transaction
 - `buddyLink.memberName`: the name you want to use for your referral link. This needs to be between 3 and 18 lowercase characters. Only alphanumeric values are allowed, no spaces or dashes!
4. You will need to supply a devnet DEV-account as well. It is recommended to repeat the Solana account creation (See "Create DEV-account") to have a different, separate devnet-account. You can use the same account as mainnet of course, but having a separate one might be safer. Once you created the devnet-only account:
 - You need to fund it. You can fund devnet accounts here: https://solfaucet.com
 - Export the account's private key and enter the account details in the `config.json`'s `devnetAccount` property.
5. Run `npm i` to install all the dependcies for the project. [You only need to do this once if successful]
6. Run `npm run build` to build the project. [You only need to do this once if successful]
7. Run `npm run execute` to execute the script
 
The above will run the whole thing on devnet. If everything worked as intended, you should:
- See a referral link in the output
- Have a new `settings.json` file in the root-folder of the project

You can then continue repeating this on mainnet:
8. Delete the `settings.json` file that now was created
9. In your `config.json`-file, change the `mode` to "prod"

## What It Does

No doubt you'd like to know what happens when you execute the script. In short, the following:

1. Creates a new Squad with the members supplied, but adds the dev-account you created on top of these. The Squad is being created with its threshold set to 1 (this is temporary), as that allows the dev-account to run the show for now
2. Creates a BuddyLink referral proposal in the Squad with the memberName you provided
3. Uses the dev-account to approve & execute the transaction
4. Updates the threshold of the Squad to the value provided in config.json
5. Limit permission of the dev-only account to `Initiate` only. This limits the account to only be able to create proposals and nothing else.

Lastly, it stores your vault details in a `settings.json` file.

## Squad

You can view your Squad using the following URL:
https://v4.squads.so/squads/<your Vault PDA>/home

If all goes well, you see all the members you provided + your dev-account. Note that your dev-account now has limited permissions. It can only create proposals, but not vote on any.

## Config

Valid options for `mode` are:
- local
- dev
- prod

# Claiming Rewards

If everything went as planned, a new `settings.json` file was created. Please leave the `config.json` and `settings.json` files intact, regard them are *read-only* from now on.

If you run the script again with `npm run execute` it will not create a new Squad, but will instead only check your outstanding BuddyLink rewards. If there are any claimable rewards, you will be asked if you want to create a proposal to claim any of these.

Note that this will create a new proposal using the `mainnetAccount` from your config file. If something went wrong, make sure this account still has authorisation to create proposals within your Squad. By default, this should be the case. 

## Claim Proposals

When you claim a reward through this tool, it is not actually claimed. Instead, a transaction-proposal will be created for your Squad to approve.

Until you do, the claimable rewards will remain the same as far as Buddy Link is concerned. This means this tool will show you the same pending rewards when you run it again. The idea is to get the claims approved first and then run the tool again to (potentially) create new claim proposals.

# Development

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
