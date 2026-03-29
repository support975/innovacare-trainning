import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
  writeBatch,
} from '@angular/fire/firestore';

import { Auth } from '@angular/fire/auth';
import { Timestamp } from '@angular/fire/firestore';

import { CertificateDoc, HonorLabel, RewardDoc, RewardWalletDoc } from '../../data/models';

type EnrollmentStatus = 'assigned' | 'started' | 'completed';

interface EnrollmentUpdate {
  uid: string;
  courseId: string;
  examId?: string;

  score: number;     // percent
  passed: boolean;

  total?: number;
  correct?: number;
  passPct?: number;

  // Optionnels (si tu veux pousser tout depuis exam runner)
  courseTitle?: string;
  hours?: number;     // CE/training hours
  creditUnit?: string;
}

function honorFromScore(score: number): HonorLabel {
  if (score >= 95) return 'High Honors';
  if (score >= 90) return 'Honors';
  if (score >= 80) return 'Merit';
  return 'Pass';
}

function safeStr(x: any): string {
  return String(x ?? '').trim();
}

function hashLike(input: string): string {
  // hash simple côté client (non-crypto) pour verifyHash.
  // Si tu veux du robuste: Cloud Function + crypto.
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).toUpperCase();
}

@Injectable({ providedIn: 'root' })
export class RewardsService {
  private afs = inject(Firestore);
  private auth = inject(Auth);

  // ------------ Refs ------------
  private enrollmentRef(uid: string, courseId: string) {
    return doc(this.afs, `users/${uid}/enrollments/${courseId}`);
  }

  private userRef(uid: string) {
    return doc(this.afs, `users/${uid}`);
  }

  private courseRef(courseId: string) {
    return doc(this.afs, `courses/${courseId}`);
  }

  private walletRef(uid: string) {
    return doc(this.afs, `users/${uid}/wallet/main`);
  }

  private rewardsCol(uid: string) {
    return collection(this.afs, `users/${uid}/rewards`);
  }

  private certRef(certId: string) {
    return doc(this.afs, `certificates/${certId}`);
  }

  // ------------ Public API ------------

  /**
   * Main entry point: called when exam is PASSED.
   * - updates enrollment: completed + score + honor + completedAt + archive + dueDate null
   * - creates certificate
   * - creates reward docs (certificate + points + hours)
   * - increments wallet points
   */
  async awardCourseCompletion(input: EnrollmentUpdate): Promise<{
    certificateId: string;
    certificateNo: string;
    honor: HonorLabel;
    pointsAwarded: number;
  }> {
    const actor = this.auth.currentUser;
    if (!actor) throw new Error('Not authenticated.');

    if (!input?.uid || !input?.courseId) throw new Error('Missing uid/courseId.');
    if (!input.passed) throw new Error('awardCourseCompletion called but passed=false.');

    const uid = input.uid;
    const courseId = input.courseId;
    const score = Number(input.score ?? 0);
    const honor = honorFromScore(score);

    // Load user & course (for certificate display)
    const [uSnap, cSnap] = await Promise.all([
      getDoc(this.userRef(uid) as any),
      getDoc(this.courseRef(courseId) as any),
    ]);

    const u: any = uSnap.exists() ? uSnap.data() : {};
    const c: any = cSnap.exists() ? cSnap.data() : {};

    const userName = safeStr(u?.displayName || actor.displayName || 'Learner');
    const userEmail = safeStr(u?.email || actor.email || '');
    const courseTitle = safeStr(input.courseTitle || c?.title || courseId);

    const hours = Number(input.hours ?? c?.ceCredit ?? c?.durationMin ?? 0);
    // Si durationMin en minutes, convertis en heures pour certificate:
    const normalizedHours = hours > 24 ? Math.round((hours / 60) * 100) / 100 : hours;
    const creditUnit = safeStr(input.creditUnit || c?.creditUnit || 'Hours');

    // Certificate identifiers
    const issuedAt = new Date();
    const y = issuedAt.getFullYear();
    const m = String(issuedAt.getMonth() + 1).padStart(2, '0');
    const d = String(issuedAt.getDate()).padStart(2, '0');
    const shortCourse = safeStr(courseId).slice(0, 6).toUpperCase();
    const shortUid = safeStr(uid).slice(0, 6).toUpperCase();
    const certificateNo = `ICT-${y}${m}${d}-${shortCourse}-${shortUid}`;

    // Deterministic-ish certId (stable)
    const certId = `${uid}_${courseId}`.replace(/[^\w-]/g, '_');
    const verifyHash = hashLike(`${uid}|${courseId}|${certificateNo}`);

    const certDoc: CertificateDoc = {
      uid,
      userName,
      userEmail,
      courseId,
      courseTitle,
      score,
      honor,
      hours: normalizedHours || 0,
      creditUnit: creditUnit || undefined,
      certificateNo,
      issuedAt: serverTimestamp(),
      organization: 'Innovacare Training',
      verifyHash,
    };

    // Points rules (adjust as you like)
    const pointsAwarded = this.pointsFromScore(score);

    // Reward docs
    const rewardTitle = `Certificate — ${courseTitle}`;
    const rewardCert: Omit<RewardDoc, 'id'> = {
      type: 'certificate',
      uid,
      courseId,
      examId: input.examId,
      title: rewardTitle,
      description: `Completed with ${honor}`,
      score,
      honor,
      certificateId: certId,
      certificateNo,
      issuedAt: serverTimestamp(),
      issuedBy: 'system',
      status: 'active',
    };

    const rewardPoints: Omit<RewardDoc, 'id'> = {
      type: 'points',
      uid,
      courseId,
      examId: input.examId,
      title: `Points — ${courseTitle}`,
      description: `Awarded for completion (${honor})`,
      points: pointsAwarded,
      score,
      honor,
      issuedAt: serverTimestamp(),
      issuedBy: 'system',
      status: 'active',
    };

    const rewardHours: Omit<RewardDoc, 'id'> = {
      type: 'credit_hours',
      uid,
      courseId,
      examId: input.examId,
      title: `Training Hours — ${courseTitle}`,
      description: `Credits earned`,
      hours: normalizedHours || 0,
      creditUnit: creditUnit || undefined,
      score,
      honor,
      issuedAt: serverTimestamp(),
      issuedBy: 'system',
      status: 'active',
    };

    // Enrollment update: archive from assignments + remove overdue
    const enrPatch: any = {
      status: 'completed' as EnrollmentStatus,
      score,
      honor,
      completedAt: serverTimestamp(),
      archivedFromAssignments: true,  // ✅ used to hide from "Assignments"
      dueDate: null,                  // ✅ prevents overdue after completion
      updatedAt: serverTimestamp(),
      exam: {
        examId: input.examId ?? null,
        total: input.total ?? null,
        correct: input.correct ?? null,
        passPct: input.passPct ?? null,
        passed: true,
      }
    };

    // Transaction-like via batch (best effort)
    const batch = writeBatch(this.afs);

    // 1) Enrollment
    batch.set(this.enrollmentRef(uid, courseId) as any, enrPatch, { merge: true });

    // 2) Certificate (global)
    batch.set(this.certRef(certId) as any, certDoc, { merge: true });

    // 3) Rewards (subcollection)
    // addDoc isn't batchable in AngularFire; we’ll create deterministic reward IDs instead.
    const r1 = doc(this.afs, `users/${uid}/rewards/${certId}_cert`);
    const r2 = doc(this.afs, `users/${uid}/rewards/${certId}_points`);
    const r3 = doc(this.afs, `users/${uid}/rewards/${certId}_hours`);
    batch.set(r1 as any, rewardCert, { merge: true });
    batch.set(r2 as any, rewardPoints, { merge: true });
    batch.set(r3 as any, rewardHours, { merge: true });

    // 4) Wallet increment (read current then set)
    const wSnap = await getDoc(this.walletRef(uid) as any);
    const w: RewardWalletDoc = wSnap.exists()
      ? (wSnap.data() as any)
      : ({ uid, totalPoints: 0, updatedAt: null } as any);

    const newTotal = Number(w.totalPoints ?? 0) + pointsAwarded;
    batch.set(this.walletRef(uid) as any, {
      uid,
      totalPoints: newTotal,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await batch.commit();

    return {
      certificateId: certId,
      certificateNo,
      honor,
      pointsAwarded,
    };
  }

  /**
   * Optional: award a badge (call after completion if you maintain a badge catalog)
   */
  async awardBadge(uid: string, courseId: string, badgeId: string, badgeName: string): Promise<void> {
    const actor = this.auth.currentUser;
    if (!actor) throw new Error('Not authenticated.');

    const id = `${uid}_${courseId}_${badgeId}`.replace(/[^\w-]/g, '_');
    const ref = doc(this.afs, `users/${uid}/rewards/${id}`);

    const reward: RewardDoc = {
      type: 'badge',
      uid,
      courseId,
      title: `Badge — ${badgeName}`,
      description: `Earned after course completion`,
      issuedAt: serverTimestamp(),
      issuedBy: 'system',
      status: 'active',
    };

    await setDoc(ref as any, reward, { merge: true });
  }

  /**
   * Helper: points policy
   */
  private pointsFromScore(score: number): number {
    if (score >= 95) return 100;
    if (score >= 90) return 80;
    if (score >= 80) return 60;
    return 40;
  }
}
