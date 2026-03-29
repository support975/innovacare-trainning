import {inject, Injectable} from "@angular/core";
import {Auth, user as authUser$} from "@angular/fire/auth";
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from "@angular/fire/firestore";
import {Observable, combineLatest, map, of, switchMap} from "rxjs";

export type UserRole = "learner" | "nurse" | "staff" | "admin" | "manager";

export type Audience =
  | {type: "all"}
  | {type: "user"; uid: string}
  | {type: "role"; role: UserRole};

export type AppNotification = {
  [x: string]: any;
  id: string;
  title: string;
  body: string;
  link?: string;
  severity?: "info" | "warning" | "critical";
  createdAt?: any;
  createdBy?: {uid: string; name?: string};
  audience: Audience;
};

type NotificationRead = {id: string; readAt?: any};

@Injectable({providedIn: "root"})
export class NotificationService {
  private afs = inject(Firestore);
  private auth = inject(Auth);

  /** User profile (role) */
  readonly userRole$: Observable<UserRole | null> = authUser$(this.auth).pipe(
    switchMap((u) => {
      if (!u) return of(null);
      return docData(doc(this.afs, `users/${u.uid}`)) as Observable<any>;
    }),
    map((profile) => (profile?.role as UserRole) ?? null),
  );

  /** Notifications globales (limité pour performance) */
  notifications$(max = 50): Observable<AppNotification[]> {
    const q = query(
      collection(this.afs, "notifications"),
      orderBy("createdAt", "desc"),
      limit(max),
    );
    return collectionData(q, {idField: "id"}) as Observable<AppNotification[]>;
  }

  /** Reads du user courant (limité) */
  reads$(max = 200): Observable<NotificationRead[]> {
    return authUser$(this.auth).pipe(
      switchMap((u) => {
        if (!u) return of([]);
        const q = query(
          collection(this.afs, `users/${u.uid}/notificationReads`),
          orderBy("readAt", "desc"),
          limit(max),
        );
        return collectionData(q, {idField: "id"}) as Observable<NotificationRead[]>;
      }),
    );
  }

  /** Filtrage exact par audience (role / user / all) */
  visibleNotifications$(max = 50): Observable<AppNotification[]> {
    return combineLatest([
      authUser$(this.auth),
      this.userRole$,
      this.notifications$(max),
    ]).pipe(
      map(([u, role, list]) => {
        if (!u || !role) return [];
        const uid = u.uid;

        return list.filter((n) => {
          const a = n.audience;
          if (!a || !a.type) return false;

          if (a.type === "all") return true;
          if (a.type === "user") return a.uid === uid;
          if (a.type === "role") return a.role === role;
          return false;
        });
      }),
    );
  }

  /** Unread optimisé: calc client-side sur une fenêtre (max N) */
  unreadCount$(max = 50): Observable<number> {
    return combineLatest([this.visibleNotifications$(max), this.reads$(300)]).pipe(
      map(([notifs, reads]) => {
        const readSet = new Set(reads.map((r) => r.id));
        return notifs.reduce((acc, n) => acc + (readSet.has(n.id) ? 0 : 1), 0);
      }),
    );
  }

  /** Mark read (idempotent) */
  async markAsRead(notificationId: string): Promise<void> {
    const u = this.auth.currentUser;
    if (!u) return;
    const ref = doc(this.afs, `users/${u.uid}/notificationReads/${notificationId}`);
    await setDoc(ref, {readAt: serverTimestamp()}, {merge: true});
  }

  /** Mark all visible as read (fenêtre max) */
  async markAllVisibleAsRead(visible: AppNotification[]): Promise<void> {
    const u = this.auth.currentUser;
    if (!u) return;
    await Promise.all(
      visible.map((n) =>
        setDoc(
          doc(this.afs, `users/${u.uid}/notificationReads/${n.id}`),
          {readAt: serverTimestamp()},
          {merge: true},
        ),
      ),
    );
  }



  unread$ = combineLatest([this.visibleNotifications$(), this.reads$(300)]).pipe(
    map(([notifs, reads]) => {
      const readSet = new Set(reads.map((r) => r.id));
      return notifs.filter((n) => !readSet.has(n.id));
    }),
  );
}
