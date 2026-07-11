import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { SuperAdminOrganizationsService } from '../../services/super-admin-organizations';
import { OrganizationCourseAssignment, SuperAdminOrganization } from '../../models/super-admin.models';

type CourseItem = { id: string; title?: string; kind?: string; active?: boolean };

@Component({
  selector: 'app-course-assign',
  imports: [CommonModule, FormsModule],
  templateUrl: './course-assign.html',
  styleUrl: './course-assign.css',
})
export class CourseAssign {
  private afs    = inject(Firestore);
  private orgSvc = inject(SuperAdminOrganizationsService);

  busy    = signal(false);
  syncing = signal(false);
  notice  = signal('');
  isError = signal(false);

  selectedOrg    = signal('');
  selectedCourse = signal('');
  orgSearch      = signal('');
  courseSearch   = signal('');

  orgs = toSignal(this.orgSvc.list(), { initialValue: [] as SuperAdminOrganization[] });
  courses = toSignal(
    collectionData(collection(this.afs, 'courses'), { idField: 'id' }) as Observable<CourseItem[]>,
    { initialValue: [] as CourseItem[] }
  );
  assignments = toSignal(this.orgSvc.listCourseAssignments(), {
    initialValue: [] as OrganizationCourseAssignment[],
  });

  filteredOrgs = computed(() => {
    const q = this.orgSearch().toLowerCase().trim();
    return this.orgs().filter(o => !q || (o.name ?? '').toLowerCase().includes(q));
  });

  filteredCourses = computed(() => {
    const q = this.courseSearch().toLowerCase().trim();
    return this.courses().filter(c => !q || (c.title ?? c.id).toLowerCase().includes(q));
  });

  selectedOrgName    = computed(() => this.orgs().find(o => o.id === this.selectedOrg())?.name ?? '');
  selectedCourseName = computed(() => this.courses().find(c => c.id === this.selectedCourse())?.title ?? '');
  assignedCoursesForSelectedOrg = computed(() => {
    const orgId = this.selectedOrg();
    if (!orgId) return [] as OrganizationCourseAssignment[];
    return this.assignments().filter(item => item.orgId === orgId);
  });
  selectedCourseAlreadyAssigned = computed(() => {
    const courseId = this.selectedCourse();
    return !!courseId && this.assignedCoursesForSelectedOrg().some(item => item.courseId === courseId);
  });

  clearNotice() { this.notice.set(''); this.isError.set(false); }

  courseTitle(courseId: string): string {
    return this.courses().find(course => course.id === courseId)?.title || courseId;
  }

  async assign() {
    if (!this.selectedOrg() || !this.selectedCourse()) {
      this.notice.set('Select both an organisation and a course.');
      this.isError.set(true);
      return;
    }
    if (this.selectedCourseAlreadyAssigned()) {
      this.notice.set('This course is already assigned to the selected organization.');
      this.isError.set(true);
      return;
    }
    this.busy.set(true);
    this.notice.set('');
    this.isError.set(false);
    try {
      await this.orgSvc.assignCourseToOrganization({ orgId: this.selectedOrg(), courseId: this.selectedCourse() });
      this.notice.set(`"${this.selectedCourseName()}" assigned to "${this.selectedOrgName()}" successfully.`);
      this.selectedOrg.set('');
      this.selectedCourse.set('');
    } catch (e: any) {
      this.notice.set(e?.message || 'Assignment failed.');
      this.isError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  async syncExistingAssignments() {
    const confirmed = window.confirm(
      'Sync existing organization-course assignments into course visibility rules?'
    );
    if (!confirmed) return;

    this.syncing.set(true);
    this.notice.set('');
    this.isError.set(false);
    try {
      const result = await this.orgSvc.requestCourseAssignmentBackfill();
      const totalAssignments = result.assignmentCount + result.pathAssignmentCount;
      this.notice.set(
        `Course visibility synced for ${result.updatedCourses} course${result.updatedCourses === 1 ? '' : 's'} ` +
        `and ${result.updatedLearningPaths} learning path${result.updatedLearningPaths === 1 ? '' : 's'} ` +
        `from ${totalAssignments} assignment${totalAssignments === 1 ? '' : 's'}; ` +
        `removed ${result.removedEnrollments} stale learner assignment${result.removedEnrollments === 1 ? '' : 's'}.`
      );
    } catch (e: any) {
      this.notice.set(e?.message || 'Course visibility sync failed.');
      this.isError.set(true);
    } finally {
      this.syncing.set(false);
    }
  }

  async removeAssignment(assignment: OrganizationCourseAssignment) {
    if (!assignment.id) return;
    const courseName = this.courseTitle(assignment.courseId);
    const orgName = this.selectedOrgName() || assignment.orgId;
    const confirmed = window.confirm(`Remove "${courseName}" from "${orgName}"?`);
    if (!confirmed) return;

    this.busy.set(true);
    this.notice.set('');
    this.isError.set(false);
    try {
      await this.orgSvc.removeCourseAssignment(assignment);
      this.notice.set(`"${courseName}" removed from "${orgName}".`);
      if (this.selectedCourse() === assignment.courseId) {
        this.selectedCourse.set('');
      }
    } catch (e: any) {
      this.notice.set(e?.message || 'Course assignment removal failed.');
      this.isError.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
