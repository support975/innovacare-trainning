import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { filter, map, of, switchMap } from 'rxjs';
import { NotificationBellPlainComponent } from '../../../../shared/components/notifications/notification-bell-plain/notification-bell-plain';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../../core/auth';
import { AppLanguage, LanguageService } from '../../../../shared/services/language';

interface LearnerNavItem {
  path: string;
  labelKey: string;
}

type OrganizationShellDoc = {
  name?: string;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
  };
};

function safeBrandColor(value?: string): string {
  const color = value?.trim();
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#234a84';
}

@Component({
  selector: 'app-learner-shell',
  imports: [CommonModule, RouterModule, NotificationBellPlainComponent],
  templateUrl: './learner-shell.html',
  styleUrl: './learner-shell.css'
})
export class LearnerShell {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);
  private readonly firestore = inject(Firestore);
  private readonly mobileQuery = '(max-width: 860px)';

  private readonly profile = toSignal(this.auth.profile$, { initialValue: null });
  private readonly organization = toSignal(
    this.auth.profile$.pipe(
      switchMap((profile) => {
        if (!profile?.orgId) return of(null);
        return docData(doc(this.firestore, `organizations/${profile.orgId}`)).pipe(
          map((org) => (org || null) as OrganizationShellDoc | null)
        );
      })
    ),
    { initialValue: null as OrganizationShellDoc | null }
  );
  private readonly isIndividualLearner = computed(() => {
    const p = this.profile();
    return p?.accountType === 'individual' && !p?.orgId;
  });
  readonly displayName = computed(() => {
    const profile = this.profile();
    return profile?.displayName?.trim() || profile?.email?.trim() || 'Learner';
  });
  readonly organizationName = computed(() => {
    const profile = this.profile();
    if (this.isIndividualLearner()) return 'Individual learner';
    return this.organization()?.name?.trim() || profile?.orgId || 'No organization';
  });
  readonly organizationLogoUrl = computed(() =>
    this.organization()?.branding?.logoUrl?.trim() || ''
  );
  readonly organizationAccent = computed(() =>
    safeBrandColor(this.organization()?.branding?.primaryColor)
  );
  readonly avatarUrl = computed(() => {
    const profile = this.profile();
    return profile?.profileImage?.trim() || profile?.photoURL?.trim() || '';
  });
  readonly initials = computed(() => {
    const source = this.displayName();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return source.slice(0, 2).toUpperCase();
  });

  isMobile = signal(this.breakpointObserver.isMatched(this.mobileQuery));
  sidebarOpen = signal(!this.breakpointObserver.isMatched(this.mobileQuery));
  readonly languageCode = this.language.language;

  constructor() {
    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (this.isMobile()) this.closeSidebar();
      });

    this.breakpointObserver
      .observe(this.mobileQuery)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        this.isMobile.set(state.matches);

        if (state.matches) {
          this.sidebarOpen.set(false);
        } else {
          this.sidebarOpen.set(true);
        }
      });
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar() {
    this.sidebarOpen.set(false);
  }

  openSidebar() {
    this.sidebarOpen.set(true);
  }

  onNavClick() {
    if (this.isMobile()) this.closeSidebar();
  }

  setLanguage(language: AppLanguage): void {
    this.language.setLanguage(language);
  }

  t(key: string): string {
    return this.language.t(key);
  }

  private readonly allLinks: LearnerNavItem[] = [
    { path: '/learner', labelKey: 'shell.dashboard' },
    { path: '/learner/assignments', labelKey: 'shell.assignments' },
    { path: '/learner/profile', labelKey: 'shell.profileLink' },
    { path: '/learner/policies', labelKey: 'shell.policies' }
  ];

  private readonly allResources: LearnerNavItem[] = [
    { path: '/learner/certifications', labelKey: 'shell.certifications' },
    { path: '/learner/official-certifications', labelKey: 'shell.officialCertifications' },
    { path: '/learner/onsite-exams', labelKey: 'shell.onsiteExams' },
    { path: '/learner/verify-member', labelKey: 'shell.verifyMember' },
    { path: '/learner/library', labelKey: 'shell.library' },
    { path: '/learner/wound', labelKey: 'shell.woundLibrary' },
    { path: '/learner/transcript', labelKey: 'shell.transcripts' },
    { path: '/learner/rewards', labelKey: 'shell.rewards' }
  ];

  readonly links = computed(() =>
    this.localizeNavItems(this.isIndividualLearner()
      ? this.allLinks.filter((item) =>
          ['/learner', '/learner/assignments'].includes(item.path)
        )
      : this.allLinks)
  );

  readonly resources = computed(() =>
    this.localizeNavItems(this.isIndividualLearner()
      ? this.allResources.filter((item) =>
          ['/learner/transcript', '/learner/rewards'].includes(item.path)
        )
      : this.allResources)
  );

  private localizeNavItems(items: LearnerNavItem[]) {
    this.languageCode();
    return items.map((item) => ({
      path: item.path,
      label: this.t(item.labelKey),
    }));
  }

  logout() {
    console.log('Logging out...');
    this.router.navigate(['/home']);
  }
}
