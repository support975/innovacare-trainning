import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { AuthService } from '../core/auth';
import { ProctorAuditLog, RemoteProctoringRecord } from './models';

export interface RemoteProctoringCandidate {
  uid: string;
  name: string;
  email: string;
  record: RemoteProctoringRecord;
}

/**
 * Manager/proctor-side operations for the remote (vendor-proctored)
 * pipeline. Kept separate from OnsiteExamService (src/app/data/onsite-exam.service.ts)
 * since remote candidacy has a different shape (no documents/candidacy
 * approval step — that's the vendor's identity check instead). Vendor
 * state (status, identityVerified, and most flag fields) is written only
 * by the Cloud Functions webhook; this service only ever writes the
 * human-review fields the firestore.rules for remoteProctoring allow staff
 * to touch: flags[*].reviewDecision/reviewedBy/reviewedAt, finalDecision,
 * reviewedBy, reviewedAt, reviewNotes.
 */
@Injectable({ providedIn: 'root' })
export class RemoteProctoringService {
  private readonly afs = inject(Firestore);
  private readonly auth = inject(AuthService);

  async loadCandidates(sessionId: string): Promise<RemoteProctoringCandidate[]> {
    const snap = await getDocs(collection(this.afs, `examSessions/${sessionId}/remoteProctoring`));
    const results: RemoteProctoringCandidate[] = [];

    for (const docSnap of snap.docs) {
      const record = docSnap.data() as RemoteProctoringRecord;
      let name = docSnap.id;
      let email = '';
      try {
        const userSnap = await getDoc(doc(this.afs, `users/${docSnap.id}`));
        const user = userSnap.data() as { displayName?: string; name?: string; email?: string } | undefined;
        name = user?.displayName || user?.name || user?.email || docSnap.id;
        email = user?.email || '';
      } catch {
        // Keep the fallback name/email if the user profile can't be read.
      }
      results.push({ uid: docSnap.id, name, email, record: { ...record, id: docSnap.id } });
    }

    return results;
  }

  /** Record a decision on a single AI-flagged incident (dismiss, escalate, or confirm as a real violation). */
  async reviewFlag(
    sessionId: string,
    candidate: RemoteProctoringCandidate,
    flagId: string,
    decision: 'dismissed' | 'escalated' | 'confirmed_violation'
  ): Promise<void> {
    const reviewerUid = this.auth.currentUid ?? '';
    const flags = (candidate.record.flags || []).map((f) =>
      f.id === flagId
        ? { ...f, reviewDecision: decision, reviewedBy: reviewerUid, reviewedAt: serverTimestamp() }
        : f
    );

    await setDoc(
      doc(this.afs, `examSessions/${sessionId}/remoteProctoring/${candidate.uid}`),
      { flags, updatedAt: serverTimestamp() },
      { merge: true }
    );

    await this.logAudit(sessionId, candidate.uid, 'proctoring_reviewed', `flag=${flagId} decision=${decision}`);
  }

  /** Finalize the review for a candidate's whole session, gating result release. */
  async finalizeDecision(
    sessionId: string,
    candidate: RemoteProctoringCandidate,
    decision: 'cleared' | 'flagged_pass' | 'invalidated',
    notes?: string
  ): Promise<void> {
    const reviewerUid = this.auth.currentUid ?? '';

    await setDoc(
      doc(this.afs, `examSessions/${sessionId}/remoteProctoring/${candidate.uid}`),
      {
        finalDecision: decision,
        reviewedBy: reviewerUid,
        reviewedAt: serverTimestamp(),
        reviewNotes: notes || '',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await this.logAudit(sessionId, candidate.uid, 'proctoring_reviewed', `finalDecision=${decision}`);

    if (candidate.email) {
      await addDoc(collection(this.afs, 'mail'), {
        to: [candidate.email],
        message: {
          subject: decision === 'invalidated'
            ? 'Your exam result requires attention'
            : 'Your exam proctoring review is complete',
          html: buildProctoringReviewEmailHtml({ name: candidate.name, decision, notes }),
        },
      });
    }
  }

  private async logAudit(
    sessionId: string,
    candidateUid: string,
    action: ProctorAuditLog['action'],
    details: string
  ): Promise<void> {
    await addDoc(collection(this.afs, 'proctorAuditLogs'), {
      sessionId,
      proctorUid: this.auth.currentUid ?? '',
      candidateUid,
      action,
      details,
      timestamp: serverTimestamp(),
    });
  }
}

function buildProctoringReviewEmailHtml(input: {
  name: string;
  decision: 'cleared' | 'flagged_pass' | 'invalidated';
  notes?: string;
}): string {
  const heading = input.decision === 'invalidated'
    ? 'Your exam attempt was invalidated'
    : 'Your proctoring review is complete';
  const color = input.decision === 'invalidated' ? '#b91c1c' : '#166534';
  const body = input.decision === 'invalidated'
    ? 'After reviewing the monitoring for your session, your exam attempt could not be validated. Please contact your organization for next steps.'
    : 'Your exam session has been reviewed and your result will proceed as normal.';

  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2b4a">
    <h2 style="color:${color}">${heading}</h2>
    <p>Hello ${input.name},</p>
    <p>${body}</p>
    ${input.notes ? `<p style="color:#555;font-size:0.9em">Reviewer notes: ${input.notes}</p>` : ''}
  </div>`;
}
