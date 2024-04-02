import { writeFile, readFile } from 'fs/promises';
import { dirname } from 'path';
import chalk from 'chalk';
import { LogType } from './types.js';

export interface RecentPrioritizationFee {
	slot: number;
	prioritizationFee: number;
}

export interface RecentPrioritizationResponse {
	jsonrpc: '2.0';
	id: 1;
	result: RecentPrioritizationFee[];
}

export async function getEstimatedPriorityFee(programAddress: string, max = false) {
	let recentFees = (await getRecentPriorityFee(programAddress))
		.filter(({ prioritizationFee }) => prioritizationFee > 0)
		.map(({ prioritizationFee }) => prioritizationFee);

	const itemsLenth = Math.min(3, recentFees.length);
	recentFees = recentFees.splice(recentFees.length - itemsLenth);
	if (max) {
		return Math.max(...recentFees);
	}
	return Math.ceil(recentFees.reduce((total, fee, idx) => total + fee * (idx + 1), 0) / factorialize(itemsLenth));
}

export async function getRecentPriorityFee(programAddress: string): Promise<RecentPrioritizationFee[]> {
	const requestBody = {
		jsonrpc: '2.0',
		id: 1,
		method: 'getRecentPrioritizationFees',
		params: [[programAddress]],
	};
	const response = await fetch('https://api.devnet.solana.com', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		throw new Error(`Error fetching priority fee history: ${response.status}`);
	}

	const data = (await response.json()) as RecentPrioritizationResponse;
	return data.result;
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

function factorialize(num: number) {
	if (num === 0 || num === 1) return 1;
	for (let i = num - 1; i >= 1; i--) {
		num *= i;
	}
	return num;
}
