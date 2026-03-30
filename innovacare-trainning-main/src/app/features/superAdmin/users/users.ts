import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, switchMap } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { UserRole } from '../models/super-admin.models';
import { SuperAdminUsersService } from '../services/super-admin-users';


@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.html',
  styleUrls: ['./users.css']
})
export class Users {
  private usersSvc = inject(SuperAdminUsersService);

  search = signal('');
  roleFilter = signal<UserRole | 'all'>('all');
  refreshTrigger = signal(0);
  notice = signal('');

  users = toSignal(
    combineLatest([
      toObservable(this.search),
      toObservable(this.roleFilter),
      toObservable(this.refreshTrigger),
    ]).pipe(
      switchMap(([search, role]) => this.usersSvc.listFiltered(search, role))
    ),
    { initialValue: [] }
  );

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
    this.refresh();
  } catch (e: any) {
    this.notice.set(e?.message || 'Failed to update role.');
  }
}

  async toggleActive(uid: string, current: boolean) {
    try {
      await this.usersSvc.setActive(uid, !current);
      this.notice.set('User status updated.');
      this.refresh();
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to update user.');
    }
  }
}