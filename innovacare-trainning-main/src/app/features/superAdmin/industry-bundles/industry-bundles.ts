import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { toSignal } from '@angular/core/rxjs-interop';
import type { SuperAdminOrganization } from '../models/super-admin.models';
import { SuperAdminOrganizationsService } from '../services/super-admin-organizations';
import { LearningPath, LearningPathsService } from '../../../shared/services/learning-paths';
import {
  IndustryBundle,
  IndustryBundlesService,
  OrganizationIndustryBundleAssignment,
} from '../../../shared/services/industry-bundles';
import { LanguageService } from '../../../shared/services/language';

type BundleForm = {
  id: string;
  name: string;
  sector: string;
  description: string;
  active: boolean;
};

@Component({
  selector: 'app-industry-bundles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './industry-bundles.html',
  styleUrl: './industry-bundles.css',
})
export class IndustryBundlesComponent {
  private readonly auth = inject(Auth);
  private readonly orgsSvc = inject(SuperAdminOrganizationsService);
  private readonly pathsSvc = inject(LearningPathsService);
  private readonly bundlesSvc = inject(IndustryBundlesService);
  readonly lang = inject(LanguageService);

  readonly bundles = toSignal(this.bundlesSvc.listAll(), { initialValue: [] as IndustryBundle[] });
  readonly learningPaths = toSignal(this.pathsSvc.listAll(), { initialValue: [] as LearningPath[] });
  readonly organizations = toSignal(this.orgsSvc.list(), { initialValue: [] as SuperAdminOrganization[] });
  readonly assignments = toSignal(this.bundlesSvc.listAssignments(), {
    initialValue: [] as OrganizationIndustryBundleAssignment[],
  });

  readonly pathQuery = signal('');
  readonly selectedPathIds = signal(new Set<string>());
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal(false);

  readonly assignOrgIdByBundle = signal<Record<string, string>>({});

  form: BundleForm = {
    id: '',
    name: '',
    sector: '',
    description: '',
    active: true,
  };

  readonly filteredPaths = computed(() => {
    const q = this.pathQuery().trim().toLowerCase();
    return this.learningPaths().filter(path => {
      const blob = `${path.title ?? ''} ${path.category ?? ''}`.toLowerCase();
      return !q || blob.includes(q);
    });
  });

  readonly pathMap = computed(() => {
    const map = new Map<string, LearningPath>();
    this.learningPaths().forEach(path => {
      if (path.id) map.set(path.id, path);
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

  readonly selectedCourseCount = computed(() =>
    Array.from(this.selectedPathIds()).reduce((total, pathId) => {
      return total + (this.pathMap().get(pathId)?.courseIds?.length ?? 0);
    }, 0)
  );

  togglePath(pathId: string | undefined, checked: boolean): void {
    if (!pathId) return;
    const next = new Set(this.selectedPathIds());
    if (checked) next.add(pathId);
    else next.delete(pathId);
    this.selectedPathIds.set(next);
  }

  edit(bundle: IndustryBundle): void {
    this.form = {
      id: bundle.id ?? '',
      name: bundle.name ?? '',
      sector: bundle.sector ?? '',
      description: bundle.description ?? '',
      active: bundle.active !== false,
    };
    this.selectedPathIds.set(new Set(bundle.learningPathIds ?? []));
    this.notice.set('');
    this.error.set(false);
  }

  resetForm(): void {
    this.form = { id: '', name: '', sector: '', description: '', active: true };
    this.selectedPathIds.set(new Set());
    this.pathQuery.set('');
  }

  async saveBundle(): Promise<void> {
    this.notice.set('');
    this.error.set(false);

    const name = this.form.name.trim();
    const sector = this.form.sector.trim();
    const learningPathIds = Array.from(this.selectedPathIds());
    if (!name || !sector || !learningPathIds.length) {
      this.error.set(true);
      this.notice.set(this.lang.t('Add a bundle name, a sector, and select at least one learning path.'));
      return;
    }

    this.busy.set(true);
    try {
      const user = this.auth.currentUser;
      const wasEditing = !!this.form.id;
      const id = await this.bundlesSvc.saveBundle(
        {
          name,
          sector,
          description: this.form.description.trim(),
          learningPathIds,
          active: this.form.active,
        },
        { uid: user?.uid, email: user?.email ?? undefined },
        this.form.id || undefined
      );
      this.form.id = id;
      this.notice.set(wasEditing ? this.lang.t('Industry bundle saved.') : this.lang.t('Industry bundle created.'));
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || this.lang.t('Unable to save industry bundle.'));
    } finally {
      this.busy.set(false);
    }
  }

  bundleAssignments(bundleId?: string): OrganizationIndustryBundleAssignment[] {
    if (!bundleId) return [];
    return this.assignments().filter(item => item.bundleId === bundleId);
  }

  unassignedOrgsFor(bundle: IndustryBundle): SuperAdminOrganization[] {
    const assignedOrgIds = new Set(this.bundleAssignments(bundle.id).map(a => a.orgId));
    return this.organizations().filter(org => org.id && !assignedOrgIds.has(org.id));
  }

  assignOrgId(bundleId: string): string {
    return this.assignOrgIdByBundle()[bundleId] ?? '';
  }

  setAssignOrgId(bundleId: string, orgId: string): void {
    this.assignOrgIdByBundle.update(map => ({ ...map, [bundleId]: orgId }));
  }

  async assignBundleToOrg(bundle: IndustryBundle): Promise<void> {
    this.notice.set('');
    this.error.set(false);

    const orgId = this.assignOrgId(bundle.id ?? '');
    if (!bundle.id || !orgId) {
      this.error.set(true);
      this.notice.set(this.lang.t('Select an organization to assign this bundle to.'));
      return;
    }

    this.busy.set(true);
    try {
      const user = this.auth.currentUser;
      await this.bundlesSvc.assignToOrganization(
        bundle.id,
        orgId,
        bundle.learningPathIds ?? [],
        { uid: user?.uid, email: user?.email ?? undefined }
      );
      this.setAssignOrgId(bundle.id, '');
      this.notice.set(
        this.lang.t('"{name}" assigned to {org}. All its learning paths and courses are now available to that organization.', {
          name: bundle.name,
          org: this.orgName(orgId),
        })
      );
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || this.lang.t('Unable to assign industry bundle.'));
    } finally {
      this.busy.set(false);
    }
  }

  async removeAssignment(assignment: OrganizationIndustryBundleAssignment): Promise<void> {
    this.notice.set('');
    this.error.set(false);
    this.busy.set(true);
    try {
      await this.bundlesSvc.removeOrganizationAssignment(assignment);
      this.notice.set(this.lang.t('Bundle removed from organization.'));
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || this.lang.t('Unable to remove assignment.'));
    } finally {
      this.busy.set(false);
    }
  }

  orgName(orgId: string): string {
    return this.orgMap().get(orgId)?.name || orgId;
  }

  pathTitle(pathId: string): string {
    return this.pathMap().get(pathId)?.title || pathId;
  }
}
