import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { OrganizationsService, PublicOrganization } from '../../../shared/services/organizations.service';

@Component({
  selector: 'app-org-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './org-login.html',
  styleUrl: './org-login.css'
})
export class OrgLoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private orgService = inject(OrganizationsService);
  private router = inject(Router);

  loading = signal(false);
  error = signal<string | null>(null);
  showOrgDropdown = signal(false);
  organizations = signal<PublicOrganization[]>([]);
  selectedOrg = signal<PublicOrganization | null>(null);
  searchTerm = signal('');

  form = this.fb.group({
    orgSearch: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit() {
    const orgSearchControl = this.form.get('orgSearch');
    if (orgSearchControl) {
      orgSearchControl.valueChanges
        .pipe(
          debounceTime(300),
          distinctUntilChanged()
        )
        .subscribe((term) => {
          this.searchTerm.set(term || '');
          if (term) {
            this.orgService.searchOrganizations(term).subscribe((orgs) => {
              this.organizations.set(orgs);
              this.showOrgDropdown.set(true);
            });
          } else {
            this.organizations.set([]);
            this.showOrgDropdown.set(false);
          }
        });
    }
  }

  selectOrganization(org: PublicOrganization) {
    this.selectedOrg.set(org);
    this.form.patchValue({ orgSearch: org.name });
    this.showOrgDropdown.set(false);
    this.organizations.set([]);
  }

  async submit() {
    if (this.form.invalid || !this.selectedOrg()) {
      this.error.set('Please select an organization and enter your credentials.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const { email, password } = this.form.getRawValue();
      const org = this.selectedOrg()!;

      await this.auth.loginWithEmail(email!, password!, org.id);

      await this.router.navigateByUrl(`/org/${org.id}/dashboard`, { replaceUrl: true });
    } catch (e: any) {
      this.error.set(e?.message ?? 'Login failed');
    } finally {
      this.loading.set(false);
    }
  }

  clearSelection() {
    this.selectedOrg.set(null);
    this.form.patchValue({ orgSearch: '' });
  }
}
