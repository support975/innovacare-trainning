import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Firestore, collection, collectionData, doc, docData } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, filter, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { UserDirectoryService, LicenseDoc } from '../../../../shared/services/user-directory';
import { GrantRewardDialog } from '../grant-reward-dialog/grant-reward-dialog';
import {
  RewardRow,
  RewardType,
  WalletDoc,
  BADGE_CATALOG,
  levelInfoFor,
  epochMs,
  fmtDate,
} from '../../../../shared/rewards/reward-catalog';

@Component({
  selector: 'app-rewards-center-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, GrantRewardDialog],
  templateUrl: './rewards-center-detail.html',
  styleUrl: './rewards-center-detail.css',
})
export class RewardsCenterDetail {
  private afs = inject(Firestore);
  private authSvc = inject(AuthService);
  private userDir = inject(UserDirectoryService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private profile$ = this.authSvc.profile$.pipe(filter(Boolean));

  learnerUid = this.route.snapshot.paramMap.get('learnerUid') || '';

  dialogOpen = signal(false);

  private learner$ = of(this.learnerUid).pipe(
    switchMap(uid => (uid ? docData(doc(this.afs, `users/${uid}`)) : of(null))),
    map((d: any) => d as any)
  );
  learner = toSignal(this.learner$, { initialValue: null as any });

  private accessOk$ = combineLatest([this.profile$, this.learner$]).pipe(
    map(([profile, learner]) => {
      if (!profile || !learner) return false;
      if (['admin', 'super_admin'].includes(profile.role || '')) return true;
      return !!profile.orgId && profile.orgId === learner.orgId;
    })
  );
  accessOk = toSignal(this.accessOk$, { initialValue: true });

  private wallet$ = of(this.learnerUid).pipe(
    switchMap(uid => docData(doc(this.afs, `users/${uid}/wallet/main`))),
    map((w: any) => ({ totalPoints: Number(w?.totalPoints ?? 0) } as WalletDoc))
  );
  wallet = toSignal(this.wallet$, { initialValue: { totalPoints: 0 } });

  private rows$ = of(this.learnerUid).pipe(
    switchMap(uid => {
      const rcol = collection(this.afs, `users/${uid}/rewards`);
      return collectionData(rcol, { idField: 'id' }).pipe(
        switchMap((rewardsRaw: any[]) => {
          const rewards = (rewardsRaw || []).map(r => ({
            id: String(r.id),
            type: (r.type || 'points') as RewardType,
            title: String(r.title || ''),
            note: r.note ? String(r.note) : undefined,
            courseId: String(r.courseId || ''),
            score: typeof r.score === 'number' ? r.score : undefined,
            honor: r.honor ? String(r.honor) : undefined,
            hours: typeof r.hours === 'number' ? r.hours : undefined,
            creditUnit: r.creditUnit ? String(r.creditUnit) : undefined,
            licenseId: r.licenseId ? String(r.licenseId) : undefined,
            points: typeof r.points === 'number' ? r.points : undefined,
            badge: r.badge ? String(r.badge) : undefined,
            manual: !!r.manual,
            grantedBy: r.grantedBy ? String(r.grantedBy) : undefined,
            grantedByRole: r.grantedByRole ? String(r.grantedByRole) : undefined,
            issuedAtMs: epochMs(r.issuedAt),
          })) as RewardRow[];

          const courseIds = Array.from(new Set(rewards.map(r => r.courseId).filter(Boolean)));
          if (!courseIds.length) {
            return of(rewards.map(r => ({ ...r, courseTitle: r.courseId || '—' }))
              .sort((a, b) => (b.issuedAtMs ?? 0) - (a.issuedAtMs ?? 0)));
          }

          const courseObs = courseIds.map(cid =>
            docData(doc(this.afs, `courses/${cid}`)).pipe(
              map((c: any) => ({ id: cid, title: String(c?.title || cid) }))
            )
          );

          return combineLatest(courseObs).pipe(
            map(courseList => {
              const cmap = new Map<string, string>();
              courseList.forEach(c => cmap.set(c.id, c.title));
              return rewards
                .map(r => ({ ...r, courseTitle: cmap.get(r.courseId) || r.courseId || '—' }))
                .sort((a, b) => (b.issuedAtMs ?? 0) - (a.issuedAtMs ?? 0));
            })
          );
        })
      );
    })
  );
  rows = toSignal(this.rows$, { initialValue: [] as RewardRow[] });

  private licenses$ = this.userDir.licensesForUid$(this.learnerUid);
  licenses = toSignal(this.licenses$, { initialValue: [] as LicenseDoc[] });

  readonly levelInfo = computed(() => levelInfoFor(this.wallet().totalPoints ?? 0));

  readonly badges = computed(() => {
    const earned = new Set(
      this.rows()
        .filter(r => r.type === 'badge')
        .map(r => r.badge || r.id.replace(/^badge_/, '').replace(/^manual_/, ''))
    );
    return BADGE_CATALOG.map(b => ({ ...b, earned: earned.has(b.key) }));
  });

  licenseProgress = computed(() => {
    const rows = this.rows().filter(r => r.type === 'credit_hours');
    return this.licenses().map(lic => {
      const renewalStartMs = this.renewalWindowStart(lic);
      const earnedHours = rows
        .filter(r => !r.licenseId || r.licenseId === lic.id)
        .filter(r => !renewalStartMs || (r.issuedAtMs ?? 0) >= renewalStartMs)
        .reduce((s, r) => s + (r.hours || 0), 0);
      const required = lic.hours || 0;
      const percent = required > 0 ? Math.min(100, Math.round((earnedHours / required) * 100)) : 0;
      return { license: lic, earnedHours, required, percent, met: required > 0 && earnedHours >= required };
    });
  });

  private renewalWindowStart(lic: LicenseDoc): number | undefined {
    const renewalMs = epochMs(lic.renewalDate);
    const months = lic.renewalPeriodMonths || 12;
    if (!renewalMs) return undefined;
    const d = new Date(renewalMs);
    d.setMonth(d.getMonth() - months);
    return d.getTime();
  }

  fmtDate(ms?: number) { return fmtDate(ms); }

  goBack() {
    this.router.navigate(['/manager/rewards-center']);
  }

  openDialog() {
    this.dialogOpen.set(true);
  }

  closeDialog() {
    this.dialogOpen.set(false);
  }
}
