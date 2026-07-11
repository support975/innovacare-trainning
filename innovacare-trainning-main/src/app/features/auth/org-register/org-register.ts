import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { OrganizationsService, PublicOrganization } from '../../../shared/services/organizations.service';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-org-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './org-register.html',
  styleUrl: './org-register.css'
})
export class OrgRegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private orgService = inject(OrganizationsService);
  private router = inject(Router);
  private firestore = inject(Firestore);

  loading = signal(false);
  error = signal<string | null>(null);
  showOrgDropdown = signal(false);
  organizations = signal<PublicOrganization[]>([]);
  selectedOrg = signal<PublicOrganization | null>(null);
  searchTerm = signal('');
  currentStep = signal<'org-selection' | 'account-details'>('org-selection');
  registrationComplete = signal(false);

  form = this.fb.group({
    orgSearch: ['', [Validators.required]],
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
    agreeTerms: [false, [Validators.requiredTrue]],
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
    this.currentStep.set('account-details');
  }

  get passwordMismatch(): boolean {
    const { password, confirmPassword } = this.form.getRawValue();
    return !!password && !!confirmPassword && password !== confirmPassword;
  }

  async submit() {
    this.form.markAllAsTouched();

    if (this.form.invalid || this.passwordMismatch || !this.selectedOrg()) {
      if (this.passwordMismatch) {
        this.error.set('Passwords do not match');
      } else {
        this.error.set('Please fill in all required fields correctly');
      }
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const { displayName, email, password } = this.form.getRawValue();
      const org = this.selectedOrg()!;

      // Create user account, already linked to the selected organization
      const user = await this.auth.registerIndividualLearner({
        displayName: displayName!,
        email: email!,
        password: password!,
        orgId: org.id,
      });

      // Add user to organization member roster
      const userRef = doc(this.firestore, `organizations/${org.id}/members/${user.uid}`);
      await setDoc(userRef, {
        uid: user.uid,
        email: email!,
        displayName: displayName!,
        role: 'learner',
        orgId: org.id,
        status: 'active',
        joinedAt: serverTimestamp(),
      }, { merge: true });

      this.registrationComplete.set(true);

      // Redirect after 2 seconds
      setTimeout(() => {
        this.router.navigateByUrl(`/org/${org.id}/dashboard`, { replaceUrl: true });
      }, 2000);

    } catch (e: any) {
      this.error.set(e?.message ?? 'Registration failed');
    } finally {
      this.loading.set(false);
    }
  }

  goBack() {
    this.currentStep.set('org-selection');
    this.selectedOrg.set(null);
    this.form.patchValue({
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
      agreeTerms: false,
    });
  }

  clearSelection() {
    this.selectedOrg.set(null);
    this.form.patchValue({ orgSearch: '' });
    this.currentStep.set('org-selection');
  }
}
