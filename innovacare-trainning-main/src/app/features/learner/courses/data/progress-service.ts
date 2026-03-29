import { inject, Injectable } from '@angular/core';
import { Firestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

@Injectable({
  providedIn: 'root'
})
export class ProgressService {
  private afs = inject(Firestore);
  private auth = inject(Auth);

  private path(uid: string, courseId: string) {
    return doc(this.afs, `users/${uid}/enrollments/${courseId}`);
  }

  async enrollIfNeeded(courseId: string) {
    const uid = this.auth.currentUser?.uid!;
    const ref = this.path(uid, courseId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        status: 'in-progress',
        startedAt: serverTimestamp(),
        unlockedIndex: 0,
        progress: {}
      });
    }
  }

  async markSeen(courseId: string, sectionId: string, index: number, total: number) {
    const uid = this.auth.currentUser?.uid!;
    const ref = this.path(uid, courseId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const data: any = snap.data();
    const progress = { ...(data.progress || {}), [sectionId]: true };

    // compute highest unlocked index
    let unlockedIndex = data.unlockedIndex ?? 0;
    if (index >= unlockedIndex) unlockedIndex = index + 1; // unlock next

    const updates: any = { progress, unlockedIndex };
    // complete if last section viewed
    if (Object.keys(progress).length >= total) {
      updates.status = 'completed';
      updates.completedAt = serverTimestamp();
    }
    await updateDoc(ref, updates);
  }

  async canTakeExam(courseId: string): Promise<boolean> {
    const uid = this.auth.currentUser?.uid!;
    const ref = this.path(uid, courseId);
    const snap = await getDoc(ref);
    return snap.exists() && snap.data()['status'] === 'completed';
  }
}
