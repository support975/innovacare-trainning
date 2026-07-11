import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { catchError, map, of, switchMap } from 'rxjs';
import { AppProfile, AuthService } from '../../../core/auth';

type CourseAccessRequestStatus =
  | 'pending_approval'
  | 'approved_pending_payment'
  | 'granted'
  | 'rejected';

type CourseAccessPaymentStatus = 'not_started' | 'pending' | 'paid' | 'waived';

interface CourseAccessRequest {
  id: string;
  uid: string;
  userEmail?: string;
  userName?: string;
  courseId: string;
  courseTitle?: string;
  status: CourseAccessRequestStatus;
  paymentStatus?: CourseAccessPaymentStatus;
  source?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface CourseDoc {
  title?: string;
  orgId?: string | null;
}

@Component({
  selector: 'app-course-access-requests',
  standalone: true,
  imports: [CommonModule, MatSnackBarModule],
  templateUrl: './course-access-requests.html',
  styleUrl: './course-access-requests.css',
})
export class CourseAccessRequestsComponent {
  private readonly db = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

  private readonly profile = toSignal(this.authService.profile$, {
    initialValue: null as AppProfile | null,
  });

  readonly busyId = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);

  readonly canManage = computed(() => this.isAdminProfile(this.profile()));

  private readonly requests$ = this.authService.profile$.pipe(
    switchMap((profile) => {
      if (!this.isAdminProfile(profile)) return of<CourseAccessRequest[]>([]);
      return collectionData(collection(this.db, 'courseAccessRequests'), { idField: 'id' }).pipe(
        map((items) => items as CourseAccessRequest[]),
        catchError((error) => {
          console.error('Unable to load course access requests.', error);
          this.loadError.set('Unable to load course access requests.');
          return of<CourseAccessRequest[]>([]);
        })
      );
    })
  );

  private readonly requestsSrc = toSignal(this.requests$, {
    initialValue: [] as CourseAccessRequest[],
  });

  readonly requests = computed(() =>
    [...this.requestsSrc()].sort((a, b) => this.epochMs(b.updatedAt) - this.epochMs(a.updatedAt))
  );

  async approve(req: CourseAccessRequest): Promise<void> {
    if (!this.canManage()) return;
    const admin = this.auth.currentUser;
    if (!admin) {
      this.snackBar.open('Admin session required.', 'Close', { duration: 4000 });
      return;
    }

    this.busyId.set(req.id);
    try {
      await updateDoc(doc(this.db, `courseAccessRequests/${req.id}`), {
        status: 'approved_pending_payment',
        paymentStatus: 'pending',
        approvedAt: serverTimestamp(),
        approvedBy: admin.uid,
        updatedAt: serverTimestamp(),
      });
      this.snackBar.open('Request approved. Payment is now required.', 'Close', {
        duration: 4000,
      });
    } catch (error) {
      console.error('Unable to approve course access request.', error);
      this.snackBar.open('Unable to approve request.', 'Close', { duration: 5000 });
    } finally {
      this.busyId.set(null);
    }
  }

  async reject(req: CourseAccessRequest): Promise<void> {
    if (!this.canManage()) return;
    const admin = this.auth.currentUser;
    if (!admin) {
      this.snackBar.open('Admin session required.', 'Close', { duration: 4000 });
      return;
    }

    this.busyId.set(req.id);
    try {
      await updateDoc(doc(this.db, `courseAccessRequests/${req.id}`), {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: admin.uid,
        updatedAt: serverTimestamp(),
      });
      this.snackBar.open('Request rejected.', 'Close', { duration: 4000 });
    } catch (error) {
      console.error('Unable to reject course access request.', error);
      this.snackBar.open('Unable to reject request.', 'Close', { duration: 5000 });
    } finally {
      this.busyId.set(null);
    }
  }

  async markPaidAndGrant(req: CourseAccessRequest): Promise<void> {
    if (!this.canManage()) return;
    const admin = this.auth.currentUser;
    if (!admin) {
      this.snackBar.open('Admin session required.', 'Close', { duration: 4000 });
      return;
    }

    this.busyId.set(req.id);
    try {
      const courseRef = doc(this.db, `courses/${req.courseId}`);
      const courseSnap = await getDoc(courseRef);
      if (!courseSnap.exists()) throw new Error('Course not found.');
      const course = courseSnap.data() as CourseDoc;

      const batch = writeBatch(this.db);
      const requestRef = doc(this.db, `courseAccessRequests/${req.id}`);
      const enrollmentRef = doc(this.db, `users/${req.uid}/enrollments/${req.courseId}`);

      batch.set(
        enrollmentRef,
        {
          uid: req.uid,
          courseId: req.courseId,
          status: 'assigned',
          assignedBy: admin.uid,
          assignedAt: serverTimestamp(),
          accessMode: 'approved_individual',
          paymentStatus: 'paid',
          accessRequestId: req.id,
          orgId: course.orgId ?? null,
        },
        { merge: true }
      );

      batch.update(requestRef, {
        status: 'granted',
        paymentStatus: 'paid',
        courseTitle: req.courseTitle || course.title || req.courseId,
        paidAt: serverTimestamp(),
        paidBy: admin.uid,
        grantedAt: serverTimestamp(),
        grantedBy: admin.uid,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      this.snackBar.open('Payment marked paid and course access granted.', 'Close', {
        duration: 5000,
      });
    } catch (error) {
      console.error('Unable to grant paid course access.', error);
      this.snackBar.open('Unable to grant course access.', 'Close', { duration: 5000 });
    } finally {
      this.busyId.set(null);
    }
  }

  statusLabel(req: CourseAccessRequest): string {
    if (req.status === 'pending_approval') return 'Pending approval';
    if (req.status === 'approved_pending_payment') return 'Approved, awaiting payment';
    if (req.status === 'granted') return 'Paid and granted';
    if (req.status === 'rejected') return 'Rejected';
    return 'Submitted';
  }

  formatDate(value: unknown): string {
    const ms = this.epochMs(value);
    return ms ? new Date(ms).toLocaleString() : 'Not recorded';
  }

  private isAdminProfile(profile: AppProfile | null): boolean {
    return !!profile && ['admin', 'super_admin', 'superAdmin'].includes(profile.role as string);
  }

  private epochMs(value: unknown): number {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value === 'object' && value && 'toMillis' in value) {
      const maybeTimestamp = value as { toMillis?: () => number };
      return typeof maybeTimestamp.toMillis === 'function' ? maybeTimestamp.toMillis() : 0;
    }
    return 0;
  }
}
