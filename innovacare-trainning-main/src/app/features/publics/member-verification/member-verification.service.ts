import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { sanitizeMembershipDocId } from '../../../shared/certification-authority/candidate-application.service';

export type VerifyMembershipResponse =
  | { found: false }
  | {
      found: true;
      name: string;
      profession: string;
      organizationName: string;
      membershipNumber: string;
      status: 'active' | 'expired';
      issuedAt: string | null;
      expiresAt: string | null;
    };

function toIsoOrNull(value: any): string | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function toMillisOrNaN(value: any): number {
  if (!value) return NaN;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return new Date(value).getTime();
}

@Injectable({ providedIn: 'root' })
export class MemberVerificationService {
  private readonly firestore = inject(Firestore);

  /**
   * Looks up a sanitized directory entry (name, profession, org, status,
   * dates only) by membership number. Requires the caller to be signed in
   * (any role); reads directly from Firestore, no Cloud Function involved.
   */
  async verify(membershipNumber: string): Promise<VerifyMembershipResponse> {
    const number = membershipNumber.trim();
    if (!number) return { found: false };

    const snap = await getDoc(doc(this.firestore, `memberDirectory/${sanitizeMembershipDocId(number)}`));
    if (!snap.exists()) return { found: false };

    const data = snap.data() as any;
    const expiresMs = toMillisOrNaN(data.expiresAt);
    const isActive = Number.isFinite(expiresMs) && expiresMs > Date.now();

    return {
      found: true,
      name: data.name || '',
      profession: data.profession || '',
      organizationName: data.organizationName || '',
      membershipNumber: data.membershipNumber || number,
      status: isActive ? 'active' : 'expired',
      issuedAt: toIsoOrNull(data.issuedAt),
      expiresAt: toIsoOrNull(data.expiresAt),
    };
  }
}
