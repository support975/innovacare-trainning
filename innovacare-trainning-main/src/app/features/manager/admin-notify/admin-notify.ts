import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
  orderBy,
} from '@angular/fire/firestore';
import { of, switchMap } from 'rxjs';
import { filter } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminNotificationService } from '../../../shared/services/admin-notification';
import { AuthService } from '../../../core/auth';
import { ActivatedRoute } from '@angular/router';

type Role = 'learner' | 'nurse' | 'staff' | 'admin' | 'manager';
type AudienceType = 'all' | 'role' | 'user';
type Severity = 'info' | 'warning' | 'critical';

type UserItem = { id: string; displayName?: string; email?: string; role?: string; orgId?: string };

@Component({
  selector: 'app-admin-notify',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-notify.html',
  styleUrl: './admin-notify.css',
})
export class AdminNotify {
  private afs     = inject(Firestore);
  private notif   = inject(AdminNotificationService);
  private authSvc = inject(AuthService);
  private route   = inject(ActivatedRoute);

  // form fields
  title    = signal('');
  body     = signal('');
  link     = signal('');
  severity = signal<Severity>('info');

  audienceType = signal<AudienceType>('role');
  audienceRole = signal<Role>('learner');
  audienceUid  = signal<string>('');

  // user picker
  uQuery        = signal('');
  selectedUsers = signal<UserItem[]>([]);
  private pendingSelectedIds = signal<string[]>([]);

  // ui
  busy    = signal(false);
  notice  = signal('');
  isError = signal(false);

  private profile$ = this.authSvc.profile$.pipe(filter(Boolean));

  // Only load users from the manager's org
  allUsers = toSignal(
    this.profile$.pipe(
      switchMap(profile => {
        if (!profile.orgId) return of([] as UserItem[]);
        const q = query(
          collection(this.afs, 'users'),
          where('orgId', '==', profile.orgId),
          orderBy('displayName', 'asc')
        );
        return collectionData(q, { idField: 'id' });
      })
    ),
    { initialValue: [] as UserItem[] }
  );

  filteredUsers = computed(() => {
    const q = this.uQuery().toLowerCase().trim();
    const selectedIds = new Set(this.selectedUsers().map(u => u.id));
    const list = (this.allUsers() as UserItem[]).filter(u => !selectedIds.has(u.id));
    if (!q) return list.slice(0, 25);
    return list
      .filter(u =>
        (u.displayName ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.id ?? '').toLowerCase().includes(q)
      )
      .slice(0, 25);
  });

  selectedRecipientCount = computed(() => this.selectedUsers().length);

  charCount = computed(() => this.body().length);

  constructor() {
    // Hydrate selected users once allUsers loads
    this.authSvc.profile$.pipe(filter(Boolean)).subscribe(() => {
      setTimeout(() => this.hydrateSelectedUsers(), 500);
    });

    this.route.queryParamMap.subscribe(params => {
      const uids = (params.get('uids') || params.get('uid') || '')
        .split(',').map(v => v.trim()).filter(Boolean);
      this.pendingSelectedIds.set(uids);
      if (uids.length) this.audienceType.set('user');

      const t = params.get('title');
      const b = params.get('body');
      const l = params.get('link');
      const s = params.get('severity') as Severity | null;
      if (t) this.title.set(t);
      if (b) this.body.set(b);
      if (l) this.link.set(l);
      if (s === 'info' || s === 'warning' || s === 'critical') this.severity.set(s);
    });
  }

  pickUser(u: UserItem) {
    if (this.selectedUsers().some(item => item.id === u.id)) return;
    this.selectedUsers.update(users => [...users, u]);
    this.uQuery.set('');
  }

  removeUser(uid: string) {
    this.selectedUsers.update(users => users.filter(u => u.id !== uid));
    if (this.audienceUid() === uid) this.audienceUid.set('');
  }

  clearUser() {
    this.selectedUsers.set([]);
    this.audienceUid.set('');
    this.uQuery.set('');
    this.pendingSelectedIds.set([]);
  }

  clearNotice() { this.notice.set(''); this.isError.set(false); }

  getInitials(name: string): string {
    const parts = (name || '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (name || '?').slice(0, 2).toUpperCase();
  }

  async send() {
    this.notice.set('');
    this.isError.set(false);
    this.busy.set(true);

    try {
      const t = this.title().trim();
      const b = this.body().trim();
      if (!t) throw new Error('Title is required.');
      if (!b) throw new Error('Message body is required.');

      const type = this.audienceType();
      const selectedIds = this.selectedUsers().map(u => u.id);
      const manualUid = this.audienceUid().trim();

      const audience =
        type === 'all'  ? { type: 'all' as const } :
        type === 'role' ? { type: 'role' as const, role: this.audienceRole() } :
                          { type: 'user' as const, uid: selectedIds[0] || manualUid };

      if (audience.type === 'user' && !audience.uid && selectedIds.length === 0) {
        throw new Error('Please select at least one recipient.');
      }

      if (audience.type === 'user' && selectedIds.length > 1) {
        await Promise.all(
          selectedIds.map(uid =>
            this.notif.createNotification({
              title: t, body: b,
              link: this.link().trim() || null,
              severity: this.severity(),
              audience: { type: 'user', uid },
            })
          )
        );
        this.notice.set(`Notification sent to ${selectedIds.length} learners.`);
      } else {
        await this.notif.createNotification({
          title: t, body: b,
          link: this.link().trim() || null,
          severity: this.severity(),
          audience,
        });
        this.notice.set('Notification sent successfully.');
      }

      // reset form
      this.title.set('');
      this.body.set('');
      this.link.set('');
      this.severity.set('info');
      this.audienceType.set('role');
      this.audienceRole.set('learner');
      this.clearUser();
    } catch (e: unknown) {
      this.notice.set(e instanceof Error ? e.message : String(e));
      this.isError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  private hydrateSelectedUsers() {
    const ids = this.pendingSelectedIds();
    if (!ids.length) return;
    const userMap = new Map((this.allUsers() as UserItem[]).map(u => [u.id, u]));
    const selected = ids.map(id => userMap.get(id)).filter((u): u is UserItem => !!u);
    if (selected.length) {
      this.selectedUsers.set(selected);
      this.audienceUid.set(selected.length === 1 ? selected[0].id : '');
    }
  }
}
