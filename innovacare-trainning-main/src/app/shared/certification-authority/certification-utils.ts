import { AppProfile } from '../../core/auth';

export function cleanObject<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => cleanObject(entry)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, cleanObject(entry)])
    ) as T;
  }

  return value;
}

export function requireOrgId(profile: AppProfile | null): string {
  const orgId = profile?.orgId?.trim();
  if (!orgId) {
    throw new Error('This account is not linked to an organization.');
  }
  return orgId;
}

export function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return splitCsv(value);
  return [];
}
