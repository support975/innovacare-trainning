// shared/services/enrollment.service.ts
import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
  writeBatch,
  collection,
  addDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

function toJsDate(maybe: any): Date | null {
  if (!maybe) return null;
  if (typeof maybe.toDate === 'function') return maybe.toDate();
  if (typeof maybe === 'object' && typeof maybe.seconds === 'number') {
    return new Date(maybe.seconds * 1000 + Math.floor((maybe.nanoseconds || 0) / 1e6));
  }
  const d = new Date(maybe);
  return isNaN(+d) ? null : d;
}

export type EnrollmentStatus = 'assigned' | 'started' | 'completed';

export interface Enrollment {
  id?: string;

  // IMPORTANT: must exist for collectionGroup joins
  uid: string;

  courseId: string;
  status: EnrollmentStatus;
  assignedBy: 'self' | string;

  assignedAt?: any;
  startedAt?: any;
  completedAt?: any;

  dueDate?: Timestamp;

  // scoring / exam meta (optional)
  score?: number;                // 0..100
  passed?: boolean;
  passedExamId?: string;
  passPct?: number;
  examTotal?: number;
  examCorrect?: number;
  gradedAt?: any;
}

@Injectable({ providedIn: 'root' })
export class EnrollmentService {
  private db = inject(Firestore);
  private auth = inject(Auth);

  // --- refs ---
  private ref(uid: string, courseId: string) {
    return doc(this.db, `users/${uid}/enrollments/${courseId}`);
  }
  private ticketCol(uid: string) {
    return collection(this.db, `users/${uid}/launchTickets`);
  }

  async getEnrollment(uid: string, courseId: string): Promise<Enrollment | null> {
    const snap = await getDoc(this.ref(uid, courseId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Enrollment) : null;
  }

  async issueLaunchTicket(uid: string, courseId: string, ttlMinutes = 120): Promise<string> {
    const expiresAt = Timestamp.fromMillis(Date.now() + ttlMinutes * 60_000);
    const ref = await addDoc(this.ticketCol(uid), {
      courseId,
      issuedAt: serverTimestamp(),
      expiresAt,
      used: false,
    });
    return ref.id;
  }

  /** Validate + burn ticket; returns {ok, courseId} */
  async redeemTicket(uid: string, ticketId: string): Promise<{ ok: boolean; courseId?: string }> {
    const ref = doc(this.db, `users/${uid}/launchTickets/${ticketId}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false };

    const t: any = snap.data();
    const exp = t.expiresAt?.toDate?.() ?? new Date(t.expiresAt);
    if (!t.courseId || t.used || !exp || Date.now() > +exp) return { ok: false };

    await updateDoc(ref, { used: true }); // burn
    return { ok: true, courseId: t.courseId as string };
  }

  /**
   * Idempotent self-assignment.
   * Pass an optional dueDate (Timestamp) when you assign.
   */
  async ensureEnrollment(
    uid: string,
    courseId: string,
    assignedBy: 'self' | string = 'self',
    dueDate?: Timestamp
  ): Promise<void> {
    await setDoc(
      this.ref(uid, courseId),
      {
        uid,                      // ✅ ALWAYS store uid
        courseId,
        status: 'assigned' as EnrollmentStatus,
        assignedBy,
        assignedAt: serverTimestamp(),
        ...(dueDate ? { dueDate } : {}),
      },
      { merge: true }
    );
  }

  /** Soft gate: returns a code so UI can react. Server rules still enforce. */
  async tryMarkStarted(
    uid: string,
    courseId: string
  ): Promise<'started' | 'blocked_overdue' | 'already_completed' | 'not_found'> {
    const ref = this.ref(uid, courseId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return 'not_found';

    const enr: any = snap.data();

    const due = toJsDate(enr?.dueDate);
    if (due && Date.now() > due.getTime()) return 'blocked_overdue';

    if (enr.status === 'completed') return 'already_completed';

    // Ensure uid exists even for older records
    const patch: any = { uid };

    if (enr.status === 'assigned') {
      patch.status = 'started';
      patch.startedAt = serverTimestamp();
    } else if (enr.status === 'started') {
      patch.startedAt = serverTimestamp(); // idempotent refresh
    } else {
      patch.status = 'started';
      patch.startedAt = serverTimestamp();
    }

    await updateDoc(ref, patch);
    return 'started';
  }

  /** Keep your existing markCompleted if you like */
  async markCompleted(uid: string, courseId: string): Promise<void> {
    await setDoc(
      this.ref(uid, courseId),
      {
        uid, // ✅ ALWAYS store uid
        status: 'completed' as EnrollmentStatus,
        completedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  /**
   * ✅ Recommended: store exam score + grading meta (survey/audit-friendly).
   * Call this after an exam pass.
   */
  async markCompletedWithScore(args: {
    uid: string;
    courseId: string;
    score: number;        // 0..100
    passed: boolean;      // usually true here
    examId?: string;
    passPct?: number;
    total?: number;
    correct?: number;
  }): Promise<void> {
    const { uid, courseId } = args;

    const safeScore =
      typeof args.score === 'number' && isFinite(args.score)
        ? Math.max(0, Math.min(100, Math.round(args.score)))
        : 0;

    await setDoc(
      this.ref(uid, courseId),
      {
        uid, // ✅ ALWAYS store uid
        courseId,
        status: args.passed ? ('completed' as EnrollmentStatus) : ('started' as EnrollmentStatus),

        // timestamps
        gradedAt: serverTimestamp(),
        ...(args.passed ? { completedAt: serverTimestamp() } : {}),

        // score / meta
        score: safeScore,
        passed: !!args.passed,
        ...(args.examId ? { passedExamId: String(args.examId) } : {}),
        ...(typeof args.passPct === 'number' ? { passPct: Math.round(args.passPct) } : {}),
        ...(typeof args.total === 'number' ? { examTotal: Math.round(args.total) } : {}),
        ...(typeof args.correct === 'number' ? { examCorrect: Math.round(args.correct) } : {}),
      },
      { merge: true }
    );
  }

  /** Manager/Admin: now supports dueDate */
  async managerAssignCourseToUser(targetUid: string, courseId: string, dueDate?: Timestamp): Promise<void> {
    const manager = this.auth.currentUser;
    if (!manager) throw new Error('Not authenticated.');

    await setDoc(
      this.ref(targetUid, courseId),
      {
        uid: targetUid,            // ✅ ALWAYS store uid
        courseId,
        status: 'assigned' as EnrollmentStatus,
        assignedBy: manager.uid,
        assignedAt: serverTimestamp(),
        ...(dueDate ? { dueDate } : {}),
      },
      { merge: true }
    );
  }

  /** Bulk assign supports optional uniform dueDate */
  async managerAssignBulk(
    userIds: string[],
    courseIds: string[],
    dueDate?: Timestamp
  ): Promise<{ ok: number; failed: Array<{ uid: string; courseId: string; err: any }> }> {
    const manager = this.auth.currentUser;
    if (!manager) throw new Error('Not authenticated.');

    const pairs: Array<{ uid: string; courseId: string }> = [];
    for (const uid of userIds) for (const c of courseIds) pairs.push({ uid, courseId: c });

    const MAX_PER_BATCH = 400;
    let ok = 0;
    const failed: Array<{ uid: string; courseId: string; err: any }> = [];

    for (let i = 0; i < pairs.length; i += MAX_PER_BATCH) {
      const batch = writeBatch(this.db);
      const slice = pairs.slice(i, i + MAX_PER_BATCH);

      for (const { uid, courseId } of slice) {
        batch.set(
          this.ref(uid, courseId),
          {
            uid,                   // ✅ ALWAYS store uid
            courseId,
            status: 'assigned' as EnrollmentStatus,
            assignedBy: manager.uid,
            assignedAt: serverTimestamp(),
            ...(dueDate ? { dueDate } : {}),
          },
          { merge: true }
        );
      }

      try {
        await batch.commit();
        ok += slice.length;
      } catch (err) {
        // fallback individual
        for (const { uid, courseId } of slice) {
          try {
            await setDoc(
              this.ref(uid, courseId),
              {
                uid,
                courseId,
                status: 'assigned' as EnrollmentStatus,
                assignedBy: manager.uid,
                assignedAt: serverTimestamp(),
                ...(dueDate ? { dueDate } : {}),
              },
              { merge: true }
            );
            ok++;
          } catch (e) {
            failed.push({ uid, courseId, err: e });
          }
        }
      }
    }

    return { ok, failed };
  }

  isOverdue(enr?: { dueDate?: any } | null): boolean {
    const due = toJsDate(enr?.dueDate);
    return due ? Date.now() > due.getTime() : false;
  }
}
