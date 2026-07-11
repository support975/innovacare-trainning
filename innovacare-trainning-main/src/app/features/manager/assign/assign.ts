import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
} from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, firstValueFrom, map, of, switchMap, take } from 'rxjs';
import { filter } from 'rxjs/operators';
import { EnrollmentService } from '../../../shared/services/enrollement';
import { AppProfile, AuthService } from '../../../core/auth';
import { CoursesRepo } from '../../../data/courses.repo';
import { LearningPath, LearningPathsService } from '../../../shared/services/learning-paths';

type UserItem = { id: string; displayName?: string; email?: string; role?: string; orgId?: string };
type CourseItem = { id: string; title?: string; kind?: string; active?: boolean; durationMin?: number };

@Component({
  selector: 'app-assign',
  imports: [CommonModule, FormsModule],
  templateUrl: './assign.html',
  styleUrl: './assign.css'
})
export class Assign {
  private afs    = inject(Firestore);
  private enroll = inject(EnrollmentService);
  private route  = inject(ActivatedRoute);
  private authSvc = inject(AuthService);
  private coursesRepo = inject(CoursesRepo);
  private learningPaths = inject(LearningPathsService);

  busy   = signal(false);
  notice = signal('');
  error  = signal(false);

  selectedUsers   = signal<Set<string>>(new Set());
  selectedCourses = signal<Set<string>>(new Set());
  selectedPathId  = signal('');

  uQuery = signal('');
  cQuery = signal('');

  private profile$ = this.authSvc.profile$.pipe(filter(Boolean));
  profile = toSignal(this.profile$ as Observable<AppProfile>);

  // Only load learners that belong to the same org as the manager
  users = toSignal(
    this.profile$.pipe(
      switchMap(profile => {
        if (!profile.orgId) return of([] as UserItem[]);
        const q = query(
          collection(this.afs, 'users'),
          where('orgId', '==', profile.orgId),
          where('role', '==', 'learner')
        );
        return collectionData(q, { idField: 'id' }) as Observable<UserItem[]>;
      }),
      map(list => list ?? [])
    ),
    { initialValue: [] as UserItem[] }
  );

  // Managers can assign only courses the super admin assigned to their organization.
  courses = toSignal(
    this.profile$.pipe(
      switchMap(profile => this.coursesRepo.visibleForProfile(profile) as Observable<CourseItem[]>),
      map(list => list ?? [])
    ),
    { initialValue: [] as CourseItem[] }
  );

  paths = toSignal(
    this.profile$.pipe(
      switchMap(profile => this.learningPaths.visibleForProfile(profile) as Observable<LearningPath[]>),
      map(list => list ?? [])
    ),
    { initialValue: [] as LearningPath[] }
  );

  filteredUsers = computed(() => {
    const q = this.uQuery().toLowerCase().trim();
    return this.users().filter(u =>
      !q ||
      (u.displayName?.toLowerCase().includes(q)) ||
      (u.email?.toLowerCase().includes(q)) ||
      u.id.toLowerCase().includes(q)
    );
  });

  filteredCourses = computed(() => {
    const q = this.cQuery().toLowerCase().trim();
    return this.courses().filter(c =>
      !q ||
      (c.title?.toLowerCase().includes(q)) ||
      c.id.toLowerCase().includes(q)
    );
  });

  selectedEnrollmentCount = computed(() => this.selectedUsers().size * this.selectedCourses().size);
  selectedPath = computed(() =>
    this.paths().find(path => path.id === this.selectedPathId()) ?? null
  );
  selectedPathCourseCount = computed(() => this.selectedPath()?.courseIds?.length ?? 0);
  canRemoveAssignments = computed(() => {
    const role = String(this.profile()?.role ?? '').toLowerCase();
    return role === 'admin' || role === 'super_admin' || role === 'superadmin';
  });

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const raw = params.get('uids') || params.get('uid') || '';
      const selected = raw.split(',').map(v => v.trim()).filter(Boolean);
      if (selected.length) this.selectedUsers.set(new Set(selected));
    });
  }

  toggleUser(id: string, checked: boolean) {
    const next = new Set(this.selectedUsers());
    if (checked) next.add(id); else next.delete(id);
    this.selectedUsers.set(next);
  }

  toggleCourse(id: string, checked: boolean) {
    const next = new Set(this.selectedCourses());
    if (checked) next.add(id); else next.delete(id);
    this.selectedCourses.set(next);
  }

  applySelectedPath() {
    const path = this.selectedPath();
    if (!path) return;
    const courseIds = Array.from(new Set((path.courseIds || []).filter(Boolean)));
    this.selectedCourses.set(new Set(courseIds));
    this.notice.set(`Selected ${courseIds.length} course${courseIds.length !== 1 ? 's' : ''} from ${path.title}.`);
    this.error.set(false);
  }

  async assign() {
    this.notice.set('');
    this.error.set(false);
    this.busy.set(true);

    try {
      const profile = await firstValueFrom(this.authSvc.profile$.pipe(filter(Boolean), take(1)));
      const orgId   = profile?.orgId ?? null;

      const userIds   = Array.from(this.selectedUsers());
      const courseIds = Array.from(this.selectedCourses());
      const res = await this.enroll.managerAssignBulk(userIds, courseIds, undefined, orgId);

      if (res.failed.length === 0) {
        this.notice.set(`Assigned ${res.ok} enrollment${res.ok > 1 ? 's' : ''} successfully.`);
      } else {
        this.notice.set(`Assigned ${res.ok} ok, ${res.failed.length} failed.`);
        this.error.set(true);
        console.warn('Failed assignments:', res.failed);
      }
    } catch (e: any) {
      this.notice.set(e?.message || 'Assignment failed.');
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  async removeSelectedAssignments() {
    this.notice.set('');
    this.error.set(false);

    const userIds = Array.from(this.selectedUsers());
    const courseIds = Array.from(this.selectedCourses());
    const count = userIds.length * courseIds.length;

    if (!userIds.length || !courseIds.length) {
      this.notice.set('Select at least one learner and one course to remove assignments.');
      this.error.set(true);
      return;
    }

    if (!this.canRemoveAssignments()) {
      this.notice.set('Only admins can remove assigned courses.');
      this.error.set(true);
      return;
    }

    const confirmed = window.confirm(
      `Remove ${count} selected course assignment${count === 1 ? '' : 's'}? This removes the course from the learner assignment list.`
    );
    if (!confirmed) return;

    this.busy.set(true);
    try {
      const res = await this.enroll.adminRemoveAssignmentsBulk(userIds, courseIds);

      if (res.failed.length === 0) {
        this.notice.set(`Removed ${res.ok} assignment${res.ok === 1 ? '' : 's'} successfully.`);
      } else {
        this.notice.set(`Removed ${res.ok} ok, ${res.failed.length} failed.`);
        this.error.set(true);
        console.warn('Failed assignment removals:', res.failed);
      }
    } catch (e: any) {
      this.notice.set(e?.message || 'Assignment removal failed.');
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  clearSelectedUsers()   { this.selectedUsers.set(new Set<string>()); }
  clearSelectedCourses() { this.selectedCourses.set(new Set<string>()); }
  clearNotice()          { this.notice.set(''); this.error.set(false); }

  getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
}
