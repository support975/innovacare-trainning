import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CandidateApplicationService } from '../../../shared/certification-authority/candidate-application.service';
import { CandidateApplication } from '../../../shared/certification-authority/certification.models';

@Component({
  selector: 'app-member-registry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './member-registry.html',
  styleUrl: './member-registry.css',
})
export class MemberRegistryComponent {
  private applicationsSvc = inject(CandidateApplicationService);

  private allApplications = toSignal(this.applicationsSvc.listForCurrentOrganization(), {
    initialValue: [] as CandidateApplication[],
  });

  searchTerm = signal('');

  readonly members = computed(() =>
    this.allApplications()
      .filter((a) => !!a.membershipCard?.number)
      .sort((a, b) => (this.asDate(b.membershipCard?.issuedAt)?.getTime() ?? 0) - (this.asDate(a.membershipCard?.issuedAt)?.getTime() ?? 0))
  );

  readonly filteredMembers = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.members();
    return this.members().filter((m) => {
      const name = String(m.profileSnapshot?.['displayName'] || '').toLowerCase();
      const email = String(m.profileSnapshot?.['email'] || '').toLowerCase();
      const number = String(m.membershipCard?.number || '').toLowerCase();
      const profession = String(m.profileSnapshot?.['profession'] || '').toLowerCase();
      return name.includes(term) || email.includes(term) || number.includes(term) || profession.includes(term);
    });
  });

  readonly activeCount = computed(
    () => this.members().filter((m) => !this.isExpired(m.membershipCard?.expiresAt)).length
  );
  readonly expiredCount = computed(
    () => this.members().filter((m) => this.isExpired(m.membershipCard?.expiresAt)).length
  );

  isExpired(expiresAt: any): boolean {
    const d = this.asDate(expiresAt);
    return !!d && d.getTime() < Date.now();
  }

  asDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.toMillis === 'function') return new Date(value.toMillis());
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
}
