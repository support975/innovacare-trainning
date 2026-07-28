import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';

import { FacultyService } from '../../../shared/services/faculty.service';
import { SuperAdminOrganizationsService } from '../services/super-admin-organizations';
import type { SuperAdminOrganization } from '../models/super-admin.models';
import type { Faculty } from '../../../data/models';

type FacultyForm = {
  id: string;
  ownerOrgId: string;
  name: string;
  title: string;
  photoUrl: string;
  bio: string;
  credentials: string;
  organization: string;
  cvUrl: string;
  financialDisclosure: string;
  conflictOfInterest: string;
  speakerProfileUrl: string;
};

function emptyForm(): FacultyForm {
  return {
    id: '',
    ownerOrgId: '',
    name: '',
    title: '',
    photoUrl: '',
    bio: '',
    credentials: '',
    organization: '',
    cvUrl: '',
    financialDisclosure: '',
    conflictOfInterest: '',
    speakerProfileUrl: '',
  };
}

@Component({
  selector: 'app-faculty-authoring',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './faculty-authoring.html',
  styleUrl: './faculty-authoring.css',
})
export class FacultyAuthoringComponent {
  private readonly facultySvc = inject(FacultyService);
  private readonly orgsSvc = inject(SuperAdminOrganizationsService);

  readonly organizations = toSignal(this.orgsSvc.list(), { initialValue: [] as SuperAdminOrganization[] });
  readonly selectedOrgId = signal('');

  readonly records = toSignal(
    toObservable(this.selectedOrgId).pipe(
      switchMap((orgId) => (orgId ? this.facultySvc.listByOrg(orgId) : of([] as Faculty[]))),
    ),
    { initialValue: [] as Faculty[] }
  );

  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal(false);

  form: FacultyForm = emptyForm();

  onOrgFilterChange(orgId: string): void {
    this.selectedOrgId.set(orgId);
  }

  edit(record: Faculty): void {
    this.form = {
      id: record.id || '',
      ownerOrgId: record.ownerOrgId || '',
      name: record.name || '',
      title: record.title || '',
      photoUrl: record.photoUrl || '',
      bio: record.bio || '',
      credentials: record.credentials || '',
      organization: record.organization || '',
      cvUrl: record.cvUrl || '',
      financialDisclosure: record.financialDisclosure || '',
      conflictOfInterest: record.conflictOfInterest || '',
      speakerProfileUrl: record.speakerProfileUrl || '',
    };
    this.notice.set('');
    this.error.set(false);
  }

  resetForm(): void {
    const orgId = this.selectedOrgId();
    this.form = emptyForm();
    if (orgId) this.form.ownerOrgId = orgId;
  }

  async save(): Promise<void> {
    this.notice.set('');
    this.error.set(false);

    const ownerOrgId = this.form.ownerOrgId.trim();
    const name = this.form.name.trim();
    if (!ownerOrgId || !name) {
      this.error.set(true);
      this.notice.set('Owning organization and name are required.');
      return;
    }

    this.busy.set(true);
    try {
      const wasEditing = !!this.form.id;
      const payload = {
        ownerOrgId,
        name,
        title: this.form.title.trim(),
        photoUrl: this.form.photoUrl.trim(),
        bio: this.form.bio.trim(),
        credentials: this.form.credentials.trim(),
        organization: this.form.organization.trim(),
        cvUrl: this.form.cvUrl.trim(),
        financialDisclosure: this.form.financialDisclosure.trim(),
        conflictOfInterest: this.form.conflictOfInterest.trim(),
        speakerProfileUrl: this.form.speakerProfileUrl.trim(),
      };

      if (wasEditing) {
        await this.facultySvc.update(this.form.id, payload);
      } else {
        const id = await this.facultySvc.create(payload);
        this.form.id = id;
      }
      this.notice.set(wasEditing ? 'Faculty profile saved.' : 'Faculty profile created.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to save faculty profile.');
    } finally {
      this.busy.set(false);
    }
  }

  async remove(record: Faculty): Promise<void> {
    if (!record.id) return;
    this.busy.set(true);
    this.notice.set('');
    this.error.set(false);
    try {
      await this.facultySvc.delete(record.id);
      this.notice.set('Faculty profile deleted.');
      if (this.form.id === record.id) this.resetForm();
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to delete faculty profile.');
    } finally {
      this.busy.set(false);
    }
  }
}
