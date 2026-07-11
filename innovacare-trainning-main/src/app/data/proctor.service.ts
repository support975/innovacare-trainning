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
import { Observable } from 'rxjs';
import {
  ExamSession,
  ProctorVerification,
  ProctorAuditLog,
  ExamCenter,
} from './models';

@Injectable({ providedIn: 'root' })
export class ProctorService {
  private afs = inject(Firestore);

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
    const ref = doc(collection(this.afs, 'proctorVerifications'));
    await setDoc(ref, {
      sessionId,
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
      const q = query(
        collection(this.afs, 'proctorVerifications'),
        where('sessionId', '==', sessionId),
        where('candidateUid', '==', candidateUid)
      );
      collectionData(q, { idField: 'id' }).subscribe({
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
    const q = query(
      collection(this.afs, 'proctorVerifications'),
      where('sessionId', '==', sessionId),
      orderBy('verifiedAt', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<ProctorVerification[]>;
  }

  // Audit logging
  private async logAudit(
    sessionId: string,
    proctorUid: string,
    candidateUid: string,
    action: ProctorAuditLog['action'],
    details?: string
  ): Promise<void> {
    const ref = doc(collection(this.afs, 'proctorAuditLogs'));
    await setDoc(ref, {
      sessionId,
      proctorUid,
      candidateUid,
      action,
      details: details || '',
      timestamp: serverTimestamp(),
    } as ProctorAuditLog);
  }

  listAuditLogs$(sessionId: string): Observable<ProctorAuditLog[]> {
    const q = query(
      collection(this.afs, 'proctorAuditLogs'),
      where('sessionId', '==', sessionId),
      orderBy('timestamp', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<ProctorAuditLog[]>;
  }

  // Check if candidate is verified for a session today
  async isCandidateVerifiedToday(sessionId: string, candidateUid: string): Promise<boolean> {
    try {
      const q = query(
        collection(this.afs, 'proctorVerifications'),
        where('sessionId', '==', sessionId),
        where('candidateUid', '==', candidateUid)
      );

      // Use a more direct approach with getDoc-like behavior
      const results = await new Promise<ProctorVerification[]>((resolve, reject) => {
        const unsub = collectionData(q, { idField: 'id' }).subscribe({
          next: (docs: any[]) => {
            unsub.unsubscribe();
            resolve(docs as ProctorVerification[]);
          },
          error: (err) => {
            unsub.unsubscribe();
            reject(err);
          },
        });
      });

      return results.length > 0 && results[0]?.verified === true;
    } catch (e) {
      console.error('Error checking candidate verification:', e);
      return false;
    }
  }
}
