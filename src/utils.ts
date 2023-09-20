import { Connection, TransactionSignature, RpcResponseAndContext, SignatureResult } from '@solana/web3.js';
import { writeFile, readFile } from 'fs/promises';
import { dirname } from 'path';
import chalk from 'chalk';
import { LogType } from './types.js';

export async function confirmTransaction(
	connection: Connection,
	signature: TransactionSignature
): Promise<RpcResponseAndContext<SignatureResult>> {
	const latestBlockHash = await connection.getLatestBlockhash();

	return connection.confirmTransaction({
		blockhash: latestBlockHash.blockhash,
		lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
		signature: signature,
	});
}

export async function createJSONFile(filePath: string, data: any) {
	try {
		return await writeFile(filePath, JSON.stringify(data, null, 4));
	} catch (error) {
		console.error(`Failed to create ${filePath}: ${error}`);
		throw error;
	}
}

export async function readJSONFile<T = Object>(filePath: string): Promise<T> {
	try {
		const fileContents = await readFile(filePath, 'utf-8');
		return JSON.parse(fileContents);
	} catch (error) {
		throw error;
	}
}

export function getScriptFolder(): string {
	// Get the path of the current script being executed
	const currentScriptPath = import.meta.url.slice(7); // Remove the "file://" prefix
	return dirname(currentScriptPath);
}

export function log(msg: string, type: LogType, prefix?: string): void {
	if (type === LogType.NORMAL) {
		console.log(chalk.white(msg));
	}
	if (type === LogType.ERROR) {
		console.log(chalk.red.bold(msg));
	}
	if (type === LogType.SIGNATURE) {
		console.log(chalk.cyan('\u2794 [sig]:') + chalk.cyan(msg));
	}
	if (type === LogType.HIGHLIGHT) {
		console.log(chalk.white.bold(msg));
	}
	if (type === LogType.SPOTLIGHT) {
		console.log(chalk.white('\u2794 ') + chalk.cyan.bold(msg));
	}
	if (type === LogType.DETAILS) {
		console.log(chalk.white('\u2794 ') + chalk.green(prefix ? `${prefix} ` : '') + chalk.white(msg));
	}
}
