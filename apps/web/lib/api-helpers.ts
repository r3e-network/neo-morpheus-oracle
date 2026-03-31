import { NextResponse } from 'next/server';

/**
 * Standardized API error response with machine-readable error_code.
 *
 * Usage:
 *   return apiError('ciphertext is required', 'MISSING_CIPHERTEXT', 400);
 */
export function apiError(message: string, code: string, status = 500) {
  return NextResponse.json({ error: message, error_code: code }, { status });
}

/**
 * Standardized API success response (thin wrapper for consistency).
 */
export function apiSuccess<T extends Record<string, unknown>>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}
