import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  arrayUnion,
  collection,
  collectionData,
  doc,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { AdminNotification } from './models';

/**
 * Admin-facing notification feed (intake events, security alerts). Backed
 * by the `adminNotifications` collection, written exclusively by Cloud
 * Functions (see functions/src/index.ts: notifyAdminsOnDemoRequest,
 * notifyAdminsOnCourseAccessRequest, onLoginFailureBurst). A shared inbox:
 * markRead() appends the caller's own uid to `readBy` rather than a single
 * boolean, since multiple managers/superAdmins can see the same doc.
 */
@Injectable({ providedIn: 'root' })
export class AdminNotificationService {
  private readonly afs = inject(Firestore);

  /** SuperAdmin-facing feed: global-scope notifications only. */
  listGlobal$(max = 30): Observable<AdminNotification[]> {
    const q = query(
      collection(this.afs, 'adminNotifications'),
      where('scope', '==', 'global'),
      orderBy('createdAt', 'desc'),
      limit(max)
    );
    return collectionData(q, { idField: 'id' }) as Observable<AdminNotification[]>;
  }

  /** Manager-facing feed: org-scoped notifications for the caller's organization. */
  listForOrg$(orgId: string, max = 30): Observable<AdminNotification[]> {
    const q = query(
      collection(this.afs, 'adminNotifications'),
      where('scope', '==', 'org'),
      where('orgId', '==', orgId),
      orderBy('createdAt', 'desc'),
      limit(max)
    );
    return collectionData(q, { idField: 'id' }) as Observable<AdminNotification[]>;
  }

  async markRead(notificationId: string, uid: string): Promise<void> {
    await updateDoc(doc(this.afs, `adminNotifications/${notificationId}`), {
      readBy: arrayUnion(uid),
    });
  }
}
