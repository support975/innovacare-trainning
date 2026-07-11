import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { toSignal } from '@angular/core/rxjs-interop';
import { CoursesRepo } from '../../../data/courses.repo';
import type { Course } from '../../../data/models';
import type { SuperAdminOrganization } from '../models/super-admin.models';
import { SuperAdminOrganizationsService } from '../services/super-admin-organizations';
import {
  LearningPath,
  LearningPathsService,
  OrganizationLearningPathAssignment,
} from '../../../shared/services/learning-paths';

type PathForm = {
  id: string;
  title: string;
  description: string;
  category: string;
  durationDays: number | null;
  active: boolean;
};

@Component({
  selector: 'app-learning-paths',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './learning-paths.html',
  styleUrl: './learning-paths.css',
})
export class LearningPathsComponent {
  private readonly auth = inject(Auth);
  private readonly coursesRepo = inject(CoursesRepo);
  private readonly orgsSvc = inject(SuperAdminOrganizationsService);
  private readonly pathsSvc = inject(LearningPathsService);

  readonly paths = toSignal(this.pathsSvc.listAll(), { initialValue: [] as LearningPath[] });
  readonly organizations = toSignal(this.orgsSvc.list(), { initialValue: [] as SuperAdminOrganization[] });
  readonly assignments = toSignal(this.pathsSvc.listAssignments(), {
    initialValue: [] as OrganizationLearningPathAssignment[],
  });
  readonly courses = this.coursesRepo.allActive();

  readonly courseQuery = signal('');
  readonly selectedCourseIds = signal(new Set<string>());
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal(false);

  form: PathForm = {
    id: '',
    title: '',
    description: '',
    category: 'Onboarding',
    durationDays: 30,
    active: true,
  };

  assignmentForm = {
    pathId: '',
    orgId: '',
  };

  readonly filteredCourses = computed(() => {
    const q = this.courseQuery().trim().toLowerCase();
    return this.courses().filter(course => {
      const blob = `${course.title ?? ''} ${course.subtitle ?? ''} ${course.type ?? ''} ${course.kind ?? ''}`.toLowerCase();
      return !q || blob.includes(q);
    });
  });

  readonly courseMap = computed(() => {
    const map = new Map<string, Course>();
    this.courses().forEach(course => {
      if (course.id) map.set(course.id, course);
    });
    return map;
  });

  readonly orgMap = computed(() => {
    const map = new Map<string, SuperAdminOrganization>();
    this.organizations().forEach(org => {
      if (org.id) map.set(org.id, org);
    });
    return map;
  });

  readonly selectedDuration = computed(() =>
    Array.from(this.selectedCourseIds()).reduce((total, courseId) => {
      return total + (this.courseMap().get(courseId)?.durationMin ?? 0);
    }, 0)
  );

  toggleCourse(courseId: string | undefined, checked: boolean): void {
    if (!courseId) return;
    const next = new Set(this.selectedCourseIds());
    if (checked) next.add(courseId);
    else next.delete(courseId);
    this.selectedCourseIds.set(next);
  }

  edit(path: LearningPath): void {
    this.form = {
      id: path.id ?? '',
      title: path.title ?? '',
      description: path.description ?? '',
      category: path.category ?? 'Onboarding',
      durationDays: path.durationDays ?? 30,
      active: path.active !== false,
    };
    this.selectedCourseIds.set(new Set(path.courseIds ?? []));
    this.notice.set('');
    this.error.set(false);
  }

  resetForm(): void {
    this.form = {
      id: '',
      title: '',
      description: '',
      category: 'Onboarding',
      durationDays: 30,
      active: true,
    };
    this.selectedCourseIds.set(new Set());
    this.courseQuery.set('');
  }

  async savePath(): Promise<void> {
    this.notice.set('');
    this.error.set(false);

    const title = this.form.title.trim();
    const courseIds = Array.from(this.selectedCourseIds());
    if (!title || !courseIds.length) {
      this.error.set(true);
      this.notice.set('Add a path title and select at least one course.');
      return;
    }

    this.busy.set(true);
    try {
      const user = this.auth.currentUser;
      const wasEditing = !!this.form.id;
      const id = await this.pathsSvc.savePath(
        {
          title,
          description: this.form.description.trim(),
          category: this.form.category.trim() || 'General',
          durationDays: this.form.durationDays,
          courseIds,
          active: this.form.active,
        },
        { uid: user?.uid, email: user?.email ?? undefined },
        this.form.id || undefined
      );
      this.form.id = id;
      this.notice.set(wasEditing ? 'Learning path saved.' : 'Learning path created.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to save learning path.');
    } finally {
      this.busy.set(false);
    }
  }

  async assignPath(): Promise<void> {
    this.notice.set('');
    this.error.set(false);

    if (!this.assignmentForm.pathId || !this.assignmentForm.orgId) {
      this.error.set(true);
      this.notice.set('Select a learning path and an organization.');
      return;
    }

    this.busy.set(true);
    try {
      const user = this.auth.currentUser;
      await this.pathsSvc.assignToOrganization(
        this.assignmentForm.pathId,
        this.assignmentForm.orgId,
        { uid: user?.uid, email: user?.email ?? undefined }
      );
      this.notice.set('Learning path assigned to organization.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to assign learning path.');
    } finally {
      this.busy.set(false);
    }
  }

  async removeAssignment(assignment: OrganizationLearningPathAssignment): Promise<void> {
    this.notice.set('');
    this.error.set(false);
    this.busy.set(true);
    try {
      await this.pathsSvc.removeOrganizationAssignment(assignment);
      this.notice.set('Learning path removed from organization.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to remove assignment.');
    } finally {
      this.busy.set(false);
    }
  }

  pathAssignments(pathId?: string): OrganizationLearningPathAssignment[] {
    if (!pathId) return [];
    return this.assignments().filter(item => item.pathId === pathId);
  }

  orgName(orgId: string): string {
    return this.orgMap().get(orgId)?.name || orgId;
  }

  courseTitle(courseId: string): string {
    return this.courseMap().get(courseId)?.title || courseId;
  }

  durationLabel(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours && mins) return `${hours}h ${mins}m`;
    if (hours) return `${hours}h`;
    return `${mins}m`;
  }
}
