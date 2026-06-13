export function json(status: number, body: unknown, headers?: Record<string, string>): Response;

export function trimString(value: unknown): string;

export function parseTimestampMs(value: unknown): number;

export function getClientIp(request: Request): string;

export function timingSafeCompare(a: unknown, b: unknown): boolean;

export function stableStringify(value: unknown): string;
