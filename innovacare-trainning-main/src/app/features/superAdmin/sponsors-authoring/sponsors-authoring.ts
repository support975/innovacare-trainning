import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';

import { SponsorsService } from '../../../shared/services/sponsors.service';
import { SuperAdminOrganizationsService } from '../services/super-admin-organizations';
import type { SuperAdminOrganization } from '../models/super-admin.models';
import type { Sponsor } from '../../../data/models';
import { LanguageService } from '../../../shared/services/language';

type SponsorForm = {
  id: string;
  ownerOrgId: string;
  name: string;
  logoUrl: string;
  website: string;
  description: string;
  supportLevel: '' | 'platinum' | 'gold' | 'silver' | 'grant';
  commercialDisclosure: string;
  grantInformation: string;
};

function emptyForm(): SponsorForm {
  return {
    id: '',
    ownerOrgId: '',
    name: '',
    logoUrl: '',
    website: '',
    description: '',
    supportLevel: '',
    commercialDisclosure: '',
    grantInformation: '',
  };
}

@Component({
  selector: 'app-sponsors-authoring',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sponsors-authoring.html',
  styleUrl: './sponsors-authoring.css',
})
export class SponsorsAuthoringComponent {
  private readonly sponsorsSvc = inject(SponsorsService);
  private readonly orgsSvc = inject(SuperAdminOrganizationsService);
  readonly lang = inject(LanguageService);

  readonly organizations = toSignal(this.orgsSvc.list(), { initialValue: [] as SuperAdminOrganization[] });
  readonly selectedOrgId = signal('');

  readonly records = toSignal(
    toObservable(this.selectedOrgId).pipe(
      switchMap((orgId) => (orgId ? this.sponsorsSvc.listByOrg(orgId) : of([] as Sponsor[]))),
    ),
    { initialValue: [] as Sponsor[] }
  );

  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal(false);

  form: SponsorForm = emptyForm();

  onOrgFilterChange(orgId: string): void {
    this.selectedOrgId.set(orgId);
  }

  edit(record: Sponsor): void {
    this.form = {
      id: record.id || '',
      ownerOrgId: record.ownerOrgId || '',
      name: record.name || '',
      logoUrl: record.logoUrl || '',
      website: record.website || '',
      description: record.description || '',
      supportLevel: record.supportLevel || '',
      commercialDisclosure: record.commercialDisclosure || '',
      grantInformation: record.grantInformation || '',
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
      this.notice.set(this.lang.t('Owning organization and sponsor name are required.'));
      return;
    }

    this.busy.set(true);
    try {
      const wasEditing = !!this.form.id;
      const payload = {
        ownerOrgId,
        name,
        logoUrl: this.form.logoUrl.trim(),
        website: this.form.website.trim(),
        description: this.form.description.trim(),
        ...(this.form.supportLevel ? { supportLevel: this.form.supportLevel } : {}),
        commercialDisclosure: this.form.commercialDisclosure.trim(),
        grantInformation: this.form.grantInformation.trim(),
      };

      if (wasEditing) {
        await this.sponsorsSvc.update(this.form.id, payload);
      } else {
        const id = await this.sponsorsSvc.create(payload as Omit<Sponsor, 'id' | 'createdAt' | 'updatedAt'>);
        this.form.id = id;
      }
      this.notice.set(wasEditing ? this.lang.t('Sponsor saved.') : this.lang.t('Sponsor created.'));
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || this.lang.t('Unable to save sponsor.'));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(record: Sponsor): Promise<void> {
    if (!record.id) return;
    this.busy.set(true);
    this.notice.set('');
    this.error.set(false);
    try {
      await this.sponsorsSvc.delete(record.id);
      this.notice.set(this.lang.t('Sponsor deleted.'));
      if (this.form.id === record.id) this.resetForm();
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || this.lang.t('Unable to delete sponsor.'));
    } finally {
      this.busy.set(false);
    }
  }
}
