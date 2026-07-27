import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, combineLatest, map, shareReplay } from 'rxjs';
import { AppProfile, AuthService } from '../../auth';

const STORAGE_PREFIX = 'actingOrg:';

/**
 * Lets a facility-group (council) admin "act as admin" for one of its
 * descendant facilities: every manager feature reads its org-scoping off
 * `effectiveProfile$` instead of `AuthService.profile$` directly, so the
 * same UI operates on the acting org without any per-feature rebuild.
 *
 * This is a UI convenience only, never a security boundary — every write
 * is still gated server-side by firestore.rules' isCouncilAncestorAdmin(),
 * which re-derives the caller's own org and the target org's ancestor
 * chain from Firestore documents, not from anything this service holds.
 */
@Injectable({ providedIn: 'root' })
export class ActingOrgService {
  private readonly authSvc = inject(AuthService);
  private readonly router = inject(Router);

  private readonly actingOrgIdSignal = signal<string | null>(null);
  private readonly actingOrgNameSignal = signal<string | null>(null);
  private readonly profileSignal = signal<AppProfile | null>(null);
  private lastUid: string | null = null;

  readonly actingOrgId = this.actingOrgIdSignal.asReadonly();
  readonly actingOrgName = this.actingOrgNameSignal.asReadonly();
  readonly isActing = computed(() => this.actingOrgIdSignal() != null);
  readonly effectiveOrgId = computed(() => this.actingOrgIdSignal() ?? this.profileSignal()?.orgId ?? null);

  // shareReplay is load-bearing: every manager feature subscribes to this
  // independently (orgId, orgDoc$, enr$, users$, readiness$, ...). Without a
  // single shared/multicast subscription, each consumer would spin up its
  // own copy of this pipeline and could race, leaving some permanently
  // stuck on a stale pre-acting snapshot while others correctly update.
  readonly effectiveProfile$: Observable<AppProfile | null> = combineLatest([
    this.authSvc.profile$,
    toObservable(this.effectiveOrgId),
  ]).pipe(
    map(([profile, orgId]) => (profile ? { ...profile, orgId } : null)),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  constructor() {
    this.authSvc.profile$.subscribe((profile) => {
      this.profileSignal.set(profile);
      const uid = profile?.uid ?? null;
      if (uid !== this.lastUid) {
        this.lastUid = uid;
        this.restoreForUid(uid);
      }
    });
  }

  startActing(orgId: string, orgName: string): void {
    this.actingOrgIdSignal.set(orgId);
    this.actingOrgNameSignal.set(orgName);
    this.persist();
    this.router.navigate(['/manager/dashboard']);
  }

  stopActing(): void {
    this.actingOrgIdSignal.set(null);
    this.actingOrgNameSignal.set(null);
    this.persist();
    this.router.navigate(['/manager/council']);
  }

  private restoreForUid(uid: string | null): void {
    if (!uid || typeof sessionStorage === 'undefined') {
      this.actingOrgIdSignal.set(null);
      this.actingOrgNameSignal.set(null);
      return;
    }
    try {
      const raw = sessionStorage.getItem(STORAGE_PREFIX + uid);
      const parsed = raw ? (JSON.parse(raw) as { orgId: string; orgName: string }) : null;
      this.actingOrgIdSignal.set(parsed?.orgId ?? null);
      this.actingOrgNameSignal.set(parsed?.orgName ?? null);
    } catch {
      this.actingOrgIdSignal.set(null);
      this.actingOrgNameSignal.set(null);
    }
  }

  private persist(): void {
    const uid = this.lastUid;
    if (!uid || typeof sessionStorage === 'undefined') return;
    const orgId = this.actingOrgIdSignal();
    if (orgId) {
      sessionStorage.setItem(STORAGE_PREFIX + uid, JSON.stringify({ orgId, orgName: this.actingOrgNameSignal() }));
    } else {
      sessionStorage.removeItem(STORAGE_PREFIX + uid);
    }
  }
}
