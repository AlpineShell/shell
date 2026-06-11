export type LicensePlan = 'pro' | 'lifetime'

export type ActivationStatus = 'valid' | 'invalid' | 'expired' | 'seat_limit' | 'revoked'

export interface ActivationRequest {
  key: string
  deviceId: string
  appVersion: string
}

export interface ActivationResponse {
  status: ActivationStatus
  plan?: LicensePlan
  expiresAt?: string | null
  seats?: { used: number; total: number }
  signature?: string
}

export const LICENSE_KEY_PATTERN = /^ALP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/

export function isWellFormedKey(key: string): boolean {
  return LICENSE_KEY_PATTERN.test(key.trim().toUpperCase())
}

export function normalizeKey(key: string): string {
  return key.trim().toUpperCase()
}
