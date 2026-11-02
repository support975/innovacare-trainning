import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  addDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, from, switchMap } from 'rxjs';
import {
  ExamSession,
  ProctorVerification,
  ProctorAuditLog,
  ExamCenter,
} from './models';

@Injectable({ providedIn: 'root' })
export class ProctorService {
  private afs = inject(Firestore);
  private sessionOrgCache = new Map<string, Promise<string | null>>();

  /**
   * Proctor records carry their session's orgId: the security rules only let
   * staff of that organization read them, so every query filters on it.
   */
  private orgIdForSession(sessionId: string): Promise<string | null> {
    let cached = this.sessionOrgCache.get(sessionId);
    if (!cached) {
      cached = getDoc(doc(this.afs, `examSessions/${sessionId}`))
        .then((snap) => ((snap.exists() ? snap.data()?.['orgId'] : null) as string | null) ?? null)
        .catch(() => null);
      this.sessionOrgCache.set(sessionId, cached);
    }
    return cached;
  }

  private orgFilter(orgId: string | null) {
    return orgId ? [where('orgId', '==', orgId)] : [];
  }

  // ExamCenter CRUD
  async createCenter(center: Omit<ExamCenter, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = doc(collection(this.afs, 'examCenters'));
    await setDoc(ref, {
      ...center,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  getCenter$(centerId: string): Observable<ExamCenter | null> {
    const ref = doc(this.afs, `examCenters/${centerId}`);
    return new Observable<ExamCenter | null>((sub) => {
      getDoc(ref)
        .then((s) => {
          sub.next(s.exists() ? ({ id: s.id, ...s.data() } as ExamCenter) : null);
          sub.complete();
        })
        .catch((e) => sub.error(e));
    });
  }

  listCentersByOrg$(orgId: string): Observable<ExamCenter[]> {
    const q = query(
      collection(this.afs, 'examCenters'),
      where('orgId', '==', orgId),
      orderBy('name', 'asc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<ExamCenter[]>;
  }

  // ExamSession CRUD
  async createSession(session: Omit<ExamSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = doc(collection(this.afs, 'examSessions'));
    await setDoc(ref, {
      ...session,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  getSession$(sessionId: string): Observable<ExamSession | null> {
    const ref = doc(this.afs, `examSessions/${sessionId}`);
    return new Observable<ExamSession | null>((sub) => {
      getDoc(ref)
        .then((s) => {
          sub.next(s.exists() ? ({ id: s.id, ...s.data() } as ExamSession) : null);
          sub.complete();
        })
        .catch((e) => sub.error(e));
    });
  }

  listSessionsByExam$(examId: string): Observable<ExamSession[]> {
    const q = query(
      collection(this.afs, 'examSessions'),
      where('examId', '==', examId),
      orderBy('sessionDate', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<ExamSession[]>;
  }

  listSessionsByCenter$(centerId: string): Observable<ExamSession[]> {
    const q = query(
      collection(this.afs, 'examSessions'),
      where('centerId', '==', centerId),
      orderBy('sessionDate', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<ExamSession[]>;
  }

  listSessionsByOrg$(orgId: string): Observable<ExamSession[]> {
    const q = query(
      collection(this.afs, 'examSessions'),
      where('orgId', '==', orgId),
      orderBy('sessionDate', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<ExamSession[]>;
  }

  async updateSession(sessionId: string, updates: Partial<ExamSession>): Promise<void> {
    const ref = doc(this.afs, `examSessions/${sessionId}`);
    await updateDoc(ref, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }

  // ProctorVerification
  async verifyCandidate(
    sessionId: string,
    candidateUid: string,
    proctorUid: string,
    verified: boolean,
    idPhotoUrl?: string,
    reason?: string
  ): Promise<string> {
    const orgId = await this.orgIdForSession(sessionId);
    const ref = doc(collection(this.afs, 'proctorVerifications'));
    await setDoc(ref, {
      sessionId,
      orgId,
      candidateUid,
      proctorUid,
      verified,
      reason: reason || (verified ? '' : 'Not verified'),
      idPhotoUrl,
      verifiedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as ProctorVerification);

    // Mirror the verification status onto the candidate's enrollment doc —
    // the kiosk login reads examSessions/{id}/candidateVerifications where verified == true
    const candidateRef = doc(this.afs, `examSessions/${sessionId}/candidateVerifications/${candidateUid}`);
    await setDoc(
      candidateRef,
      {
        candidateUid,
        verified,
        verifiedBy: proctorUid,
        verifiedAt: serverTimestamp(),
        // Re-verifying grants a fresh attempt (clears the one-attempt lock)
        examCompleted: false,
      },
      { merge: true }
    );

    // Log audit
    await this.logAudit(
      sessionId,
      proctorUid,
      candidateUid,
      verified ? 'verified' : 'rejected',
      reason
    );

    return ref.id;
  }

  getVerification$(sessionId: string, candidateUid: string): Observable<ProctorVerification | null> {
    return new Observable<ProctorVerification | null>((sub) => {
      from(this.orgIdForSession(sessionId)).pipe(
        switchMap((orgId) =>
          collectionData(
            query(
              collection(this.afs, 'proctorVerifications'),
              ...this.orgFilter(orgId),
              where('sessionId', '==', sessionId),
              where('candidateUid', '==', candidateUid)
            ),
            { idField: 'id' }
          )
        )
      ).subscribe({
        next: (docs: any[]) => {
          const latest = docs[0] || null;
          sub.next(latest ? (latest as ProctorVerification) : null);
          sub.complete();
        },
        error: (e) => sub.error(e),
      });
    });
  }

  listVerificationsBySession$(sessionId: string): Observable<ProctorVerification[]> {
    return from(this.orgIdForSession(sessionId)).pipe(
      switchMap((orgId) =>
        collectionData(
          query(
            collection(this.afs, 'proctorVerifications'),
            ...this.orgFilter(orgId),
            where('sessionId', '==', sessionId),
            orderBy('verifiedAt', 'desc')
          ),
          { idField: 'id' }
        ) as Observable<ProctorVerification[]>
      )
    );
  }

  // Audit logging
  private async logAudit(
    sessionId: string,
    proctorUid: string,
    candidateUid: string,
    action: ProctorAuditLog['action'],
    details?: string
  ): Promise<void> {
    const orgId = await this.orgIdForSession(sessionId);
    const ref = doc(collection(this.afs, 'proctorAuditLogs'));
    await setDoc(ref, {
      sessionId,
      orgId,
      proctorUid,
      candidateUid,
      action,
      details: details || '',
      timestamp: serverTimestamp(),
    } as ProctorAuditLog);
  }

  listAuditLogs$(sessionId: string): Observable<ProctorAuditLog[]> {
    return from(this.orgIdForSession(sessionId)).pipe(
      switchMap((orgId) =>
        collectionData(
          query(
            collection(this.afs, 'proctorAuditLogs'),
            ...this.orgFilter(orgId),
            where('sessionId', '==', sessionId),
            orderBy('timestamp', 'desc')
          ),
          { idField: 'id' }
        ) as Observable<ProctorAuditLog[]>
      )
    );
  }

  // Check if candidate is verified for a session today
  /**
   * Candidate-side check: has a proctor verified this candidate for the
   * session? Reads the candidate's own verification record — the proctor
   * verification log itself is readable by exam staff only.
   */
  async isCandidateVerifiedToday(sessionId: string, candidateUid: string): Promise<boolean> {
    try {
      const snap = await getDoc(
        doc(this.afs, `examSessions/${sessionId}/candidateVerifications/${candidateUid}`)
      );
      return snap.exists() && snap.data()?.['verified'] === true;
    } catch (e) {
      console.error('Error checking candidate verification:', e);
      return false;
    }
  }
}
