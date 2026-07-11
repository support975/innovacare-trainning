import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  docData,
  getDoc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { firstValueFrom, map, of, switchMap, take } from 'rxjs';
import { AuthService } from '../../core/auth';
import { CandidateApplication } from './certification.models';
import { CertificationAuditService } from './certification-audit.service';
import { cleanObject, requireOrgId } from './certification-utils';

@Injectable({ providedIn: 'root' })
export class CandidateApplicationService {
  private readonly db = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(CertificationAuditService);

  listForCurrentOrganization() {
    return this.auth.profile$.pipe(
      switchMap((profile) => {
        if (!profile?.orgId) return of([] as CandidateApplication[]);
        const q = query(
          collection(this.db, 'candidateApplications'),
          where('organizationId', '==', profile.orgId)
        );
        return collectionData(q, { idField: 'id' }).pipe(
          map((items) => items as CandidateApplication[])
        );
      })
    );
  }

  listForCurrentCandidate() {
    return this.auth.profile$.pipe(
      switchMap((profile) => {
        if (!profile?.uid) return of([] as CandidateApplication[]);
        const q = query(
          collection(this.db, 'candidateApplications'),
          where('candidateUserId', '==', profile.uid)
        );
        return collectionData(q, { idField: 'id' }).pipe(
          map((items) => items as CandidateApplication[])
        );
      })
    );
  }

  application$(applicationId: string) {
    return docData(doc(this.db, `candidateApplications/${applicationId}`), {
      idField: 'id',
    }).pipe(map((item) => item as CandidateApplication));
  }

  async getApplication(applicationId: string): Promise<CandidateApplication | null> {
    const snap = await getDoc(doc(this.db, `candidateApplications/${applicationId}`));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as CandidateApplication) : null;
  }

  async submitDraft(input: Partial<CandidateApplication>): Promise<string> {
    const profile = await firstValueFrom(this.auth.profile$.pipe(take(1)));
    const organizationId = input.organizationId || profile?.orgId || '';
    if (!organizationId) throw new Error('Certification organization is required.');
    if (!input.sessionId) throw new Error('Session is required.');
    if (!input.candidateUserId) throw new Error('Candidate user is required.');

    const ref = await addDoc(
      collection(this.db, 'candidateApplications'),
      cleanObject({
        sessionId: input.sessionId,
        candidateUserId: input.candidateUserId,
        organizationId,
        status: input.status || 'draft',
        profileSnapshot: input.profileSnapshot || {},
        educationPath: input.educationPath || 'OTHER',
        paymentStatus: input.paymentStatus || 'not_started',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await this.audit.write({
      organizationId,
      action: 'certification.application.submit',
      targetType: 'candidateApplication',
      targetId: ref.id,
    });
    return ref.id;
  }

  async updateReview(id: string, patch: Partial<CandidateApplication>): Promise<void> {
    const profile = await firstValueFrom(this.auth.profile$.pipe(take(1)));
    const organizationId = requireOrgId(profile);
    await updateDoc(doc(this.db, `candidateApplications/${id}`), {
      ...cleanObject(patch),
      updatedAt: serverTimestamp(),
    } as any);
    await this.audit.write({
      organizationId,
      action: 'certification.application.review',
      targetType: 'candidateApplication',
      targetId: id,
    });
  }

  async submitApplication(id: string): Promise<void> {
    const profile = await firstValueFrom(this.auth.profile$.pipe(take(1)));
    if (!profile?.uid) throw new Error('Sign in required.');
    const existing = await this.getApplication(id);
    if (!existing || existing.candidateUserId !== profile.uid) {
      throw new Error('Application not found.');
    }
    await updateDoc(doc(this.db, `candidateApplications/${id}`), {
      status: 'submitted',
      updatedAt: serverTimestamp(),
    } as any);
    await this.audit.write({
      organizationId: existing.organizationId,
      action: 'certification.application.submit',
      targetType: 'candidateApplication',
      targetId: id,
    });
  }

  async markExamCompleted(id: string, result: Record<string, any>): Promise<void> {
    const app = await this.getApplication(id);
    if (!app) return;
    await updateDoc(doc(this.db, `candidateApplications/${id}`), {
      status: 'exam_completed',
      examResult: result,
      examCompletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as any);
  }

  /**
   * Approve a candidate whose exam has passed: issues (or renews) a 1-year digital
   * membership card and a digital certificate of good standing, and queues a summary
   * email to the candidate via the `mail` collection (consumed by the Firebase
   * "Trigger Email from Firestore" extension, or an equivalent Cloud Function).
   */
  async approveAndIssueCertification(
    id: string,
    options?: { membershipNumber?: string; profession?: string }
  ): Promise<{ membershipNumber: string; certificateNumber: string }> {
    const profile = await firstValueFrom(this.auth.profile$.pipe(take(1)));
    const organizationId = requireOrgId(profile);

    const app = await this.getApplication(id);
    if (!app) throw new Error('Application not found.');

    if (options?.profession) {
      await this.updateProfession(id, options.profession);
    }

    const now = new Date();
    const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const manualNumber = options?.membershipNumber?.trim();
    const membershipNumber = manualNumber || app.membershipCard?.number || generateCredentialNumber('MC');
    const certificateNumber = generateCredentialNumber('CGS');

    const membershipCard = {
      number: membershipNumber,
      issuedAt: now,
      expiresAt: expires,
      status: 'active' as const,
    };
    const certificate = {
      number: certificateNumber,
      issuedAt: now,
      expiresAt: expires,
    };

    await updateDoc(doc(this.db, `candidateApplications/${id}`), {
      status: 'passed',
      membershipCard,
      certificate,
      certificationApprovedBy: this.auth.currentUid ?? null,
      certificationApprovedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as any);

    await addDoc(collection(this.db, `candidateApplications/${id}/decisions`), {
      applicationId: id,
      sessionId: app.sessionId,
      finalDecision: 'passed',
      authorizedForRegistry: true,
      decidedBy: this.auth.currentUid ?? '',
      decidedAt: serverTimestamp(),
      publishedAt: serverTimestamp(),
    });

    const candidateName = app.profileSnapshot?.['displayName'] || 'Candidate';
    const candidateEmail = app.profileSnapshot?.['email'];
    const candidatePhone = app.profileSnapshot?.['phone'];
    const candidateProfession = options?.profession || app.profileSnapshot?.['profession'] || '';
    const isRenewal = !!app.membershipCard?.number;

    // Sanitized public/internal directory entry for the "verify a member" lookup.
    // Only non-sensitive fields — no email/phone/documents.
    let organizationName = '';
    try {
      const orgSnap = await getDoc(doc(this.db, `organizations/${organizationId}`));
      organizationName = orgSnap.exists() ? ((orgSnap.data() as any)?.name || '') : '';
    } catch {
      organizationName = '';
    }
    await setDoc(doc(this.db, `memberDirectory/${sanitizeMembershipDocId(membershipNumber)}`), {
      organizationId,
      organizationName,
      applicationId: id,
      name: candidateName,
      profession: candidateProfession,
      membershipNumber,
      issuedAt: now,
      expiresAt: expires,
      updatedAt: serverTimestamp(),
    });

    if (candidateEmail) {
      await addDoc(collection(this.db, 'mail'), {
        to: [candidateEmail],
        message: {
          subject: isRenewal ? 'Your membership has been renewed' : 'Your certification has been approved',
          html: buildApprovalEmailHtml({
            candidateName,
            membershipNumber,
            certificateNumber,
            issuedAt: now,
            expiresAt: expires,
            isRenewal,
          }),
        },
      });
    }

    if (candidatePhone) {
      await addDoc(collection(this.db, 'sms'), {
        to: candidatePhone,
        body: isRenewal
          ? `Innovacare: Your membership card ${membershipNumber} has been renewed. Valid until ${expires.toLocaleDateString()}.`
          : `Innovacare: Congratulations! Your certification is approved. Membership card ${membershipNumber}, valid until ${expires.toLocaleDateString()}.`,
      });
    }

    // A renewal clears any pending renewal workflow state and resets the
    // reminder tracker so the next expiry cycle gets fresh reminders.
    await updateDoc(doc(this.db, `candidateApplications/${id}`), {
      renewalStatus: 'not_required',
      renewalRemindersSent: [],
    } as any);

    await this.audit.write({
      organizationId,
      action: 'certification.application.decide',
      targetType: 'candidateApplication',
      targetId: id,
      meta: { finalDecision: 'passed', membershipNumber, certificateNumber, isRenewal },
    });

    return { membershipNumber, certificateNumber };
  }

  /** Update the candidate's contact phone number (used for SMS notifications). */
  async updateContactPhone(id: string, phone: string): Promise<void> {
    const app = await this.getApplication(id);
    if (!app) throw new Error('Application not found.');
    await updateDoc(doc(this.db, `candidateApplications/${id}`), {
      profileSnapshot: { ...(app.profileSnapshot || {}), phone },
      updatedAt: serverTimestamp(),
    } as any);
  }

  /** Update the candidate's profession/title (shown on the membership card and certificate). */
  async updateProfession(id: string, profession: string): Promise<void> {
    const app = await this.getApplication(id);
    if (!app) throw new Error('Application not found.');
    await updateDoc(doc(this.db, `candidateApplications/${id}`), {
      profileSnapshot: { ...(app.profileSnapshot || {}), profession },
      updatedAt: serverTimestamp(),
    } as any);
  }

  async lookupMemberByNumber(organizationId: string, membershipNumber: string): Promise<CandidateApplication | null> {
    const q = query(
      collection(this.db, 'candidateApplications'),
      where('organizationId', '==', organizationId),
      where('membershipCard.number', '==', membershipNumber.trim())
    );
    const { getDocs } = await import('@angular/fire/firestore');
    const results = await getDocs(q);
    if (results.empty) return null;
    const first = results.docs[0];
    return { id: first.id, ...(first.data() as any) } as CandidateApplication;
  }

  /** Record the candidate's self-reported renewal course progress. */
  async submitRenewalProgress(
    id: string,
    input: { completedCourseIds: string[]; pointsEarned: number; ready: boolean }
  ): Promise<void> {
    await updateDoc(doc(this.db, `candidateApplications/${id}`), {
      renewalStatus: input.ready ? 'ready' : 'in_progress',
      renewalCoursesCompleted: input.completedCourseIds,
      renewalPointsEarned: input.pointsEarned,
      renewalSubmittedAt: input.ready ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    } as any);
  }
}

/** Firestore document IDs cannot contain "/"; membership numbers entered
 * manually by an admin (from an existing paper roster) might. */
export function sanitizeMembershipDocId(value: string): string {
  return value.trim().replace(/[/\s]+/g, '_').slice(0, 200);
}

function generateCredentialNumber(prefix: string): string {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${time}-${rand}`;
}

function buildApprovalEmailHtml(input: {
  candidateName: string;
  membershipNumber: string;
  certificateNumber: string;
  issuedAt: Date;
  expiresAt: Date;
  isRenewal?: boolean;
}): string {
  const issued = input.issuedAt.toLocaleDateString();
  const expires = input.expiresAt.toLocaleDateString();
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2b4a">
      <h2 style="color:#1a3f6f">${input.isRenewal ? 'Membership renewed' : 'Congratulations'}, ${input.candidateName}!</h2>
      <p>${input.isRenewal
        ? 'Your membership and certificate of good standing have been <strong>renewed</strong> for another year.'
        : 'Your official certification exam has been reviewed and <strong>approved</strong>.'}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr>
          <td style="padding:8px 0;color:#5a6a7e">Membership card number</td>
          <td style="padding:8px 0;font-weight:700">${input.membershipNumber}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#5a6a7e">Certificate of good standing</td>
          <td style="padding:8px 0;font-weight:700">${input.certificateNumber}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#5a6a7e">Issued on</td>
          <td style="padding:8px 0;font-weight:700">${issued}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#5a6a7e">Valid until</td>
          <td style="padding:8px 0;font-weight:700">${expires}</td>
        </tr>
      </table>
      <p>You can view and download your digital membership card and certificate at any time from your candidate profile.</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">This is an automated message from your training portal.</p>
    </div>
  `;
}
