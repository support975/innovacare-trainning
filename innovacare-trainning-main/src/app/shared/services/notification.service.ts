import {Injectable, inject} from "@angular/core";
import {Firestore, collection, doc, addDoc, getDocs, query, where, updateDoc, deleteDoc, onSnapshot, Unsubscribe} from "@angular/fire/firestore";
import {Auth} from "@angular/fire/auth";
import {BehaviorSubject, Observable} from "rxjs";
import {map} from "rxjs/operators";

export interface InAppNotification {
  id?: string;
  learnerId: string;
  type: "course_assigned" | "course_completed" | "course_overdue" | "transcript" | "reward";
  title: string;
  message: string;
  icon: string;
  actionUrl?: string;
  read: boolean;
  createdAt?: any;
  data?: Record<string, unknown>;
}

@Injectable({
  providedIn: "root",
})
export class NotificationService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  private notificationsSubject = new BehaviorSubject<InAppNotification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  private unsubscribe: Unsubscribe | null = null;

  unreadCount$ = this.notifications$.pipe(
    map((notifications) => notifications.filter((n) => !n.read).length),
  );

  initializeNotifications() {
    const user = this.auth.currentUser;
    if (!user) return;

    const notificationsRef = collection(this.firestore, "notifications", "inapp", "");
    const q = query(notificationsRef, where("learnerId", "==", user.uid));

    this.unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications: InAppNotification[] = [];
      snapshot.forEach((doc) => {
        notifications.push({id: doc.id, ...doc.data()} as InAppNotification);
      });

      // Sort by createdAt descending
      notifications.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
        const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
        return bTime - aTime;
      });

      this.notificationsSubject.next(notifications);
    });
  }

  async markAsRead(notificationId: string) {
    const user = this.auth.currentUser;
    if (!user) return;

    const notificationRef = doc(this.firestore, "notifications/inapp", notificationId);
    await updateDoc(notificationRef, {read: true});
  }

  async markAllAsRead() {
    const user = this.auth.currentUser;
    if (!user) return;

    const notifications = this.notificationsSubject.getValue();
    const unreadNotifications = notifications.filter((n) => !n.read);

    for (const notification of unreadNotifications) {
      if (notification.id) {
        await this.markAsRead(notification.id);
      }
    }
  }

  async deleteNotification(notificationId: string) {
    const notificationRef = doc(this.firestore, "notifications/inapp", notificationId);
    await deleteDoc(notificationRef);
  }

  async clearAllNotifications() {
    const user = this.auth.currentUser;
    if (!user) return;

    const notifications = this.notificationsSubject.getValue();
    for (const notification of notifications) {
      if (notification.id) {
        await this.deleteNotification(notification.id);
      }
    }
  }

  getNotifications(): Observable<InAppNotification[]> {
    return this.notifications$;
  }

  getUnreadCount(): Observable<number> {
    return this.unreadCount$;
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  ngOnDestroy() {
    this.destroy();
  }
}
