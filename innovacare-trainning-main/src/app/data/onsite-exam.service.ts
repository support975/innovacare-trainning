import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { firstValueFrom, take } from 'rxjs';
import { AuthService } from '../core/auth';
import { CandidateApplicationService } from '../shared/certification-authority/candidate-application.service';
import { ExamSession } from './models';

/** A kiosk/onsite exam candidate merged from verification, agreement and attempt records. */
export interface OnsiteCandidateDocument {
  id: string;
  type: string;
  name: string;
  url: string;
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: number;
}

export interface OnsiteCandidate {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  verified: boolean;
  examCompleted: boolean;
  candidacyApproved: boolean | null;
  documents: OnsiteCandidateDocument[];
  enrolledAt?: any;
  verifiedAt?: any;
  applicationId?: string;
  agreement?: {
    agreedAt?: any;
    language?: string;
    stationId?: string;
  };
  attempt?: OnsiteAttempt;
}

export interface OnsiteAttempt {
  id: string;
  score: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  completedAt?: any;
  resultPublishedAt?: any;
  details?: any[];
  cardIssuedAt?: any;
  membershipNumber?: string;
}

@Injectable({ providedIn: 'root' })
export class OnsiteExamService {
  private afs = inject(Firestore);
  private auth = inject(AuthService);
  private applicationsSvc = inject(CandidateApplicationService);

  /** Merge candidateVerifications + ruleAgreements + examAttempts for a session. */
  async loadCandidates(sessionId: string): Promise<OnsiteCandidate[]> {
    const [verifSnap, agreementSnap, attemptSnap] = await Promise.all([
      getDocs(collection(this.afs, `examSessions/${sessionId}/candidateVerifications`)),
      getDocs(collection(this.afs, `examSessions/${sessionId}/ruleAgreements`)),
      getDocs(query(collection(this.afs, 'examAttempts'), where('sessionId', '==', sessionId))),
    ]);

    const agreements = new Map<string, any>();
    for (const d of agreementSnap.docs) {
      const data = d.data() as any;
      agreements.set(data['candidateUid'], data);
    }

    const attempts = new Map<string, OnsiteAttempt>();
    for (const d of attemptSnap.docs) {
      const data = d.data() as any;
      const existing = attempts.get(data['candidateUid']);
      const attempt: OnsiteAttempt = {
        id: d.id,
        score: data['score'] ?? 0,
        passed: data['passed'] === true,
        correctCount: data['correctCount'] ?? 0,
        totalQuestions: data['totalQuestions'] ?? 0,
        completedAt: data['completedAt'],
        resultPublishedAt: data['resultPublishedAt'],
        details: data['details'] || [],
        cardIssuedAt: data['cardIssuedAt'],
        membershipNumber: data['membershipNumber'],
      };
      // Keep the most recent attempt per candidate
      const newer =
        !existing ||
        (attempt.completedAt?.toMillis?.() ?? 0) >= (existing.completedAt?.toMillis?.() ?? 0);
      if (newer) attempts.set(data['candidateUid'], attempt);
    }

    const candidates: OnsiteCandidate[] = [];
    for (const d of verifSnap.docs) {
      const data = d.data() as any;
      const uid = data['candidateUid'] || d.id;
      const agreement = agreements.get(uid);
      candidates.push({
        uid,
        name: data['displayName'] || data['name'] || 'Candidate',
        email: data['email'] || '',
        phone: data['phone'] || '',
        verified: data['verified'] === true,
        examCompleted: data['examCompleted'] === true,
        candidacyApproved:
          data['candidacyApproved'] === true ? true : data['candidacyApproved'] === false ? false : null,
        documents: (data['documents'] || []) as OnsiteCandidateDocument[],
        enrolledAt: data['enrolledAt'],
        verifiedAt: data['verifiedAt'],
        applicationId: data['applicationId'],
        agreement: agreement
          ? {
              agreedAt: agreement['agreedAt'],
              language: agreement['language'],
              stationId: agreement['stationId'],
            }
          : undefined,
        attempt: attempts.get(uid),
      });
    }

    return candidates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  /** Approve or reject a single submitted document. */
  async reviewDocument(
    sessionId: string,
    candidate: OnsiteCandidate,
    docId: string,
    status: 'approved' | 'rejected'
  ): Promise<void> {
    const documents = candidate.documents.map((d) => (d.id === docId ? { ...d, status } : d));
    await setDoc(
      doc(this.afs, `examSessions/${sessionId}/candidateVerifications/${candidate.uid}`),
      { documents },
      { merge: true }
    );
  }

  /** Authorize (or reject) the candidacy — required before the proctor verifies onsite. */
  async setCandidacy(sessionId: string, candidate: OnsiteCandidate, approved: boolean): Promise<void> {
    await setDoc(
      doc(this.afs, `examSessions/${sessionId}/candidateVerifications/${candidate.uid}`),
      {
        candidacyApproved: approved,
        candidacyReviewedBy: this.auth.currentUid ?? null,
        candidacyReviewedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (candidate.email) {
      await addDoc(collection(this.afs, 'mail'), {
        to: [candidate.email],
        message: {
          subject: approved
            ? '✓ Your exam candidacy is approved'
            : 'Your exam candidacy requires attention',
          html: approved
            ? `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2b4a">
                <h2 style="color:#166534">Candidacy approved</h2>
                <p>Hello ${candidate.name},</p>
                <p>Your documents have been reviewed and your exam candidacy is <strong>approved</strong>.</p>
                <p>On exam day, bring a <strong>photo ID</strong> and your <strong>account password</strong>. The proctor will verify your identity at the center before your exam starts.</p>
               </div>`
            : `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2b4a">
                <h2 style="color:#b91c1c">Candidacy not approved</h2>
                <p>Hello ${candidate.name},</p>
                <p>Your exam candidacy could not be approved with the documents provided. Please review your submitted documents in the Onsite Exams page and contact your organization if you need assistance.</p>
               </div>`,
        },
      });
    }
  }

  /** Queue the card + certificate PDFs email (processed by a Cloud Function). */
  async emailCredentials(applicationId: string): Promise<void> {
    await addDoc(collection(this.afs, 'credentialEmailRequests'), {
      status: 'pending',
      applicationId,
      requestedByUid: this.auth.currentUid ?? '',
      createdAt: serverTimestamp(),
    });
  }

  /** Publish a result: queue email + SMS with the score and stamp the attempt. */
  async publishResult(
    sessionId: string,
    candidate: OnsiteCandidate,
    examTitle: string
  ): Promise<void> {
    const attempt = candidate.attempt;
    if (!attempt) throw new Error('No exam attempt to publish.');

    if (candidate.email) {
      await addDoc(collection(this.afs, 'mail'), {
        to: [candidate.email],
        message: {
          subject: attempt.passed
            ? `✓ Exam Result: PASSED — ${examTitle}`
            : `Exam Result — ${examTitle}`,
          html: buildResultEmailHtml({
            name: candidate.name,
            examTitle,
            score: attempt.score,
            passed: attempt.passed,
            correctCount: attempt.correctCount,
            totalQuestions: attempt.totalQuestions,
          }),
        },
      });
    }

    if (candidate.phone) {
      await addDoc(collection(this.afs, 'sms'), {
        to: candidate.phone,
        body: attempt.passed
          ? `Innovacare: Congratulations ${candidate.name}! You PASSED your exam with ${attempt.score}%. Your membership card will follow shortly.`
          : `Innovacare: ${candidate.name}, your exam result is ${attempt.score}%. Unfortunately you did not pass. Contact your center for retake options.`,
      });
    }

    await updateDoc(doc(this.afs, `examAttempts/${attempt.id}`), {
      resultPublishedAt: serverTimestamp(),
      resultPublishedBy: this.auth.currentUid ?? null,
    });
  }

  /**
   * Issue a membership card to a passed onsite candidate. Creates (or reuses) a
   * candidateApplication and pushes it through the existing certification
   * pipeline — card + certificate + member directory + email + SMS.
   */
  async issueCard(
    sessionId: string,
    candidate: OnsiteCandidate,
    options: { profession?: string; membershipNumber?: string }
  ): Promise<{ membershipNumber: string; certificateNumber: string; applicationId: string }> {
    const attempt = candidate.attempt;
    if (!attempt?.passed) throw new Error('Candidate has not passed the exam.');

    const profile = await firstValueFrom(this.auth.profile$.pipe(take(1)));
    if (!profile?.orgId) throw new Error('Organization missing from your profile.');

    let applicationId = candidate.applicationId || '';
    if (!applicationId) {
      const ref = await addDoc(collection(this.afs, 'candidateApplications'), {
        origin: 'onsite_exam',
        sessionId,
        candidateUserId: candidate.uid,
        organizationId: profile.orgId,
        status: 'exam_completed',
        educationPath: 'ONSITE_EXAM',
        paymentStatus: 'paid',
        profileSnapshot: {
          displayName: candidate.name,
          email: candidate.email,
          phone: candidate.phone || '',
          profession: options.profession || '',
        },
        examResult: {
          percent: attempt.score,
          passed: attempt.passed,
          correct: attempt.correctCount,
          total: attempt.totalQuestions,
          completedAt: attempt.completedAt ?? null,
          attemptId: attempt.id,
        },
        examCompletedAt: attempt.completedAt ?? serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      applicationId = ref.id;

      // Remember the link so re-issuing reuses the same application
      await setDoc(
        doc(this.afs, `examSessions/${sessionId}/candidateVerifications/${candidate.uid}`),
        { applicationId },
        { merge: true }
      );
    }

    const { membershipNumber, certificateNumber } =
      await this.applicationsSvc.approveAndIssueCertification(applicationId, {
        membershipNumber: options.membershipNumber,
        profession: options.profession,
      });

    await updateDoc(doc(this.afs, `examAttempts/${attempt.id}`), {
      cardIssuedAt: serverTimestamp(),
      cardIssuedBy: this.auth.currentUid ?? null,
      membershipNumber,
      applicationId,
    });

    return { membershipNumber, certificateNumber, applicationId };
  }
}

function buildResultEmailHtml(input: {
  name: string;
  examTitle: string;
  score: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
}): string {
  const color = input.passed ? '#22c55e' : '#ef4444';
  const status = input.passed ? 'PASSED ✓' : 'NOT PASSED ✕';
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1a2b4a">
      <div style="background:${color};color:white;padding:24px;text-align:center;border-radius:12px 12px 0 0">
        <h1 style="margin:0;font-size:30px">${status}</h1>
        <p style="margin:8px 0 0 0;font-size:17px">${input.examTitle}</p>
      </div>
      <div style="background:#f9fafb;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none">
        <p>Hello ${input.name},</p>
        <p>Your official onsite exam has been reviewed and your result is now published:</p>
        <div style="background:white;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid ${color}">
          <p style="margin:0"><strong>Score:</strong> ${input.score}%</p>
          <p style="margin:8px 0 0 0"><strong>Correct answers:</strong> ${input.correctCount} / ${input.totalQuestions}</p>
        </div>
        ${input.passed
          ? '<p style="color:#22c55e"><strong>Congratulations!</strong> Your digital membership card will be delivered to you by email and SMS shortly.</p>'
          : '<p style="color:#ef4444">Unfortunately you did not reach the passing score. Please contact your exam center about retake options.</p>'}
        <p style="color:#9ca3af;font-size:12px;margin-top:32px">This is an official result notification from your training portal.</p>
      </div>
    </div>
  `;
}
