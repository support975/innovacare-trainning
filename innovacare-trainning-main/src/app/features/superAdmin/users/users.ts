import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, switchMap } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { SuperAdminOrganization, UserRole } from '../models/super-admin.models';
import { SuperAdminUserAnalytics, SuperAdminUsersService } from '../services/super-admin-users';
import { SuperAdminOrganizationsService } from '../services/super-admin-organizations';
import {
  CreateManagedUserResult,
  ManagedUserRole,
  ManagedUsersService,
} from '../../../shared/services/managed-users';

type UserRow = {
  uid: string;
  displayName?: string;
  email: string;
  role: UserRole;
  orgId?: string | null;
  active?: boolean;
  analytics: SuperAdminUserAnalytics;
};


@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.html',
  styleUrls: ['./users.css']
})
export class Users {
  private usersSvc = inject(SuperAdminUsersService);
  private orgsSvc = inject(SuperAdminOrganizationsService);
  private managedUsers = inject(ManagedUsersService);

  search = signal('');
  roleFilter = signal<UserRole | 'all'>('all');
  refreshTrigger = signal(0);
  notice = signal('');
  noticeError = signal(false);
  creating = signal(false);
  createdUser = signal<CreateManagedUserResult | null>(null);
  createForm = {
    displayName: '',
    email: '',
    role: 'learner' as ManagedUserRole,
    orgId: '',
  };

  users = toSignal(
    combineLatest([
      toObservable(this.search),
      toObservable(this.roleFilter),
      toObservable(this.refreshTrigger),
    ]).pipe(
      switchMap(([search, role]) => this.usersSvc.listFilteredWithAnalytics(search, role))
    ),
    { initialValue: [] as UserRow[] }
  );

  organizations = toSignal(this.orgsSvc.list(), {
    initialValue: [] as SuperAdminOrganization[],
  });

  refresh() {
    this.refreshTrigger.update(v => v + 1);
  }

  isUserRole(value: string): value is UserRole {
    return ['super_admin', 'admin', 'manager', 'learner', 'guest'].includes(value);
  }

  async changeRole(uid: string, role: string) {
    try {
      await this.usersSvc.setRole(uid, role as UserRole);
      this.notice.set('Role updated.');
      this.noticeError.set(false);
      this.refresh();
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to update role.');
      this.noticeError.set(true);
    }
  }

  async changeOrganization(uid: string, orgId: string) {
    try {
      const org = this.organizations().find(item => item.id === orgId);
      await this.usersSvc.setOrganization(uid, orgId || null, org?.type);
      this.notice.set(orgId ? 'Organization updated.' : 'User removed from organization.');
      this.noticeError.set(false);
      this.refresh();
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to update organization.');
      this.noticeError.set(true);
    }
  }

  async createUser() {
    if (!this.createForm.email.trim() || !this.createForm.orgId) {
      this.notice.set('Email and organization are required.');
      this.noticeError.set(true);
      return;
    }

    this.creating.set(true);
    this.createdUser.set(null);
    try {
      const result = await this.managedUsers.create({
        displayName: this.createForm.displayName.trim(),
        email: this.createForm.email.trim(),
        role: this.createForm.role,
        orgId: this.createForm.orgId,
      });
      this.createdUser.set(result);
      this.notice.set('User created and added to the organization.');
      this.noticeError.set(false);
      this.createForm.displayName = '';
      this.createForm.email = '';
      this.createForm.role = 'learner';
      this.refresh();
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to create user.');
      this.noticeError.set(true);
    } finally {
      this.creating.set(false);
    }
  }

  async toggleActive(uid: string, current: boolean) {
    try {
      await this.usersSvc.setActive(uid, !current);
      this.notice.set('User status updated.');
      this.noticeError.set(false);
      this.refresh();
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to update user.');
      this.noticeError.set(true);
    }
  }

  formatLastSeen(value: number | null): string {
    if (!value) return 'No activity';

    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  formatStudyTime(minutes: number): string {
    if (!minutes) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (!hours) return `${mins}m`;
    if (!mins) return `${hours}h`;
    return `${hours}h ${mins}m`;
  }
}
