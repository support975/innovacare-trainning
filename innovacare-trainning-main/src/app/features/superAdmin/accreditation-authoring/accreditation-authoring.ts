import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Timestamp, deleteField } from '@angular/fire/firestore';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';

import { AccreditationService } from '../../../shared/services/accreditation.service';
import { SuperAdminOrganizationsService } from '../services/super-admin-organizations';
import type { SuperAdminOrganization } from '../models/super-admin.models';
import type { Accreditation } from '../../../data/models';

type AccreditationForm = {
  id: string;
  ownerOrgId: string;
  accreditingOrganization: string;
  providerNumber: string;
  approvalNumber: string;
  contactHours: number;
  ceCredits: number;
  expirationDateStr: string;
  targetAudience: string;
  learningObjectives: string;
  awardCriteria: string;
  conflictOfInterestStatement: string;
  facultyDisclosureRequired: boolean;
  commercialSupportStatement: string;
  disclaimer: string;
  evaluationRequirements: string;
  certificateRequirements: string;
  applicableBoards: string;
  applicableCertifications: string;
};

function emptyForm(): AccreditationForm {
  return {
    id: '',
    ownerOrgId: '',
    accreditingOrganization: '',
    providerNumber: '',
    approvalNumber: '',
    contactHours: 1,
    ceCredits: 1,
    expirationDateStr: '',
    targetAudience: '',
    learningObjectives: '',
    awardCriteria: '',
    conflictOfInterestStatement: '',
    facultyDisclosureRequired: true,
    commercialSupportStatement: '',
    disclaimer: '',
    evaluationRequirements: '',
    certificateRequirements: '',
    applicableBoards: '',
    applicableCertifications: '',
  };
}

const toLines = (value?: string[]) => (value || []).join('\n');
const toCsv = (value?: string[]) => (value || []).join(', ');
const fromLines = (value: string) => value.split('\n').map((v) => v.trim()).filter(Boolean);
const fromCsv = (value: string) => value.split(',').map((v) => v.trim()).filter(Boolean);

@Component({
  selector: 'app-accreditation-authoring',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './accreditation-authoring.html',
  styleUrl: './accreditation-authoring.css',
})
export class AccreditationAuthoringComponent {
  private readonly accreditationSvc = inject(AccreditationService);
  private readonly orgsSvc = inject(SuperAdminOrganizationsService);

  readonly organizations = toSignal(this.orgsSvc.list(), { initialValue: [] as SuperAdminOrganization[] });

  readonly selectedOrgId = signal('');

  // Re-queries listByOrg() whenever the selected org filter changes.
  private readonly recordsForOrg = toSignal(
    toObservable(this.selectedOrgId).pipe(
      switchMap((orgId) => (orgId ? this.accreditationSvc.listByOrg(orgId) : of([] as Accreditation[]))),
    ),
    { initialValue: [] as Accreditation[] }
  );

  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal(false);

  form: AccreditationForm = emptyForm();

  readonly orgMap = computed(() => {
    const map = new Map<string, SuperAdminOrganization>();
    this.organizations().forEach((org) => {
      if (org.id) map.set(org.id, org);
    });
    return map;
  });

  onOrgFilterChange(orgId: string): void {
    this.selectedOrgId.set(orgId);
  }

  displayedRecords(): Accreditation[] {
    return this.recordsForOrg();
  }

  edit(record: Accreditation): void {
    const expiration = record.expirationDate?.toDate?.() as Date | undefined;
    this.form = {
      id: record.id || '',
      ownerOrgId: record.ownerOrgId || '',
      accreditingOrganization: record.accreditingOrganization || '',
      providerNumber: record.providerNumber || '',
      approvalNumber: record.approvalNumber || '',
      contactHours: record.contactHours ?? 1,
      ceCredits: record.ceCredits ?? 1,
      expirationDateStr: expiration ? expiration.toISOString().slice(0, 10) : '',
      targetAudience: toCsv(record.targetAudience),
      learningObjectives: toLines(record.learningObjectives),
      awardCriteria: record.awardCriteria || '',
      conflictOfInterestStatement: record.conflictOfInterestStatement || '',
      facultyDisclosureRequired: record.facultyDisclosureRequired !== false,
      commercialSupportStatement: record.commercialSupportStatement || '',
      disclaimer: record.disclaimer || '',
      evaluationRequirements: record.evaluationRequirements || '',
      certificateRequirements: record.certificateRequirements || '',
      applicableBoards: toCsv(record.applicableBoards),
      applicableCertifications: toCsv(record.applicableCertifications),
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
    const accreditingOrganization = this.form.accreditingOrganization.trim();
    if (!ownerOrgId || !accreditingOrganization) {
      this.error.set(true);
      this.notice.set('Owning organization and accrediting organization are required.');
      return;
    }

    this.busy.set(true);
    try {
      const wasEditing = !!this.form.id;
      const basePayload = {
        ownerOrgId,
        accreditingOrganization,
        providerNumber: this.form.providerNumber.trim(),
        approvalNumber: this.form.approvalNumber.trim(),
        contactHours: Number(this.form.contactHours) || 0,
        ceCredits: Number(this.form.ceCredits) || 0,
        targetAudience: fromCsv(this.form.targetAudience),
        learningObjectives: fromLines(this.form.learningObjectives),
        awardCriteria: this.form.awardCriteria.trim(),
        conflictOfInterestStatement: this.form.conflictOfInterestStatement.trim(),
        facultyDisclosureRequired: this.form.facultyDisclosureRequired,
        commercialSupportStatement: this.form.commercialSupportStatement.trim(),
        disclaimer: this.form.disclaimer.trim(),
        evaluationRequirements: this.form.evaluationRequirements.trim(),
        certificateRequirements: this.form.certificateRequirements.trim(),
        applicableBoards: fromCsv(this.form.applicableBoards),
        applicableCertifications: fromCsv(this.form.applicableCertifications),
      };

      if (wasEditing) {
        // deleteField() when cleared — updateDoc() only touches keys present
        // in the payload, so omitting the key would leave the old value in
        // place instead of clearing it.
        await this.accreditationSvc.update(this.form.id, {
          ...basePayload,
          expirationDate: this.form.expirationDateStr
            ? Timestamp.fromDate(new Date(`${this.form.expirationDateStr}T00:00:00`))
            : (deleteField() as any),
        });
      } else {
        const id = await this.accreditationSvc.create({
          ...basePayload,
          ...(this.form.expirationDateStr
            ? { expirationDate: Timestamp.fromDate(new Date(`${this.form.expirationDateStr}T00:00:00`)) }
            : {}),
        });
        this.form.id = id;
      }
      this.notice.set(wasEditing ? 'Accreditation saved.' : 'Accreditation created.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to save accreditation.');
    } finally {
      this.busy.set(false);
    }
  }

  async remove(record: Accreditation): Promise<void> {
    if (!record.id) return;
    this.busy.set(true);
    this.notice.set('');
    this.error.set(false);
    try {
      await this.accreditationSvc.delete(record.id);
      this.notice.set('Accreditation deleted.');
      if (this.form.id === record.id) this.resetForm();
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to delete accreditation.');
    } finally {
      this.busy.set(false);
    }
  }

  orgName(orgId: string): string {
    return this.orgMap().get(orgId)?.name || orgId;
  }
}
