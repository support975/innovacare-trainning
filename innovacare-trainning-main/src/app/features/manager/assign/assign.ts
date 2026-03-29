import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, map } from 'rxjs';
import { EnrollmentService } from '../../../shared/services/enrollement';


type UserItem = { id: string; displayName?: string; email?: string; role?: string };
type CourseItem = { id: string; title?: string; kind?: string; active?: boolean; durationMin?: number };


@Component({
  selector: 'app-assign',
  imports: [CommonModule, FormsModule],
  templateUrl: './assign.html',
  styleUrl: './assign.css'
})
export class Assign {
  private afs = inject(Firestore);
  private enroll = inject(EnrollmentService);

  // state
  busy = signal(false);
  notice = signal('');
  error = signal(false);

  // selections
  selectedUsers = signal<Set<string>>(new Set());
  selectedCourses = signal<Set<string>>(new Set());

  uQuery = signal('');
  cQuery = signal('');

  // data
  users = toSignal(
    collectionData(collection(this.afs, 'users'), { idField: 'id' }) as Observable<UserItem[]>,
    { initialValue: [] }
  );
  courses = toSignal(
    collectionData(collection(this.afs, 'courses'), { idField: 'id' }) as Observable<CourseItem[]>,
    { initialValue: [] }
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

  async assign() {
    this.notice.set('');
    this.error.set(false);
    this.busy.set(true);

    try {
      const userIds = Array.from(this.selectedUsers());
      const courseIds = Array.from(this.selectedCourses());
      const res = await this.enroll.managerAssignBulk(userIds, courseIds);

      if (res.failed.length === 0) {
        this.notice.set(`Assigned ${res.ok} enrollment${res.ok>1?'s':''} successfully.`);
      } else {
        this.notice.set(`Assigned ${res.ok} ok, ${res.failed.length} failed.`);
        this.error.set(true);
        console.warn('Failed assignments:', res.failed);
      }
    } catch (e:any) {
      this.notice.set(e?.message || 'Assignment failed.');
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
  clearSelectedUsers() {
    // create a fresh Set instance and assign via signal setter
    this.selectedUsers.set(new Set<string>());
  }
  
  clearSelectedCourses() {
    this.selectedCourses.set(new Set<string>());
  }
  
}
