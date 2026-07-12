// src/app/features/learner/rewards/rewards/rewards.ts
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { Auth, authState } from '@angular/fire/auth';
import { Firestore, collection, collectionData, doc, docData } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { LanguageService } from '../../../../shared/services/language';
import {
  RewardType,
  RewardRow,
  WalletDoc,
  LEVELS,
  BADGE_CATALOG,
  levelInfoFor,
  epochMs,
  fmtDate,
} from '../../../../shared/rewards/reward-catalog';

@Component({
  selector: 'app-rewards',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './rewards.html',
  styleUrl: './rewards.css',
})
export class Rewards {
  private afs = inject(Firestore);
  private auth = inject(Auth);
  private authService = inject(AuthService);
  private router = inject(Router);
  private profile = toSignal(this.authService.profile$, { initialValue: null });
  readonly isIndividualLearner = computed(() => {
    const p = this.profile();
    return p?.accountType === 'individual' && !p?.orgId;
  });
  readonly lang = inject(LanguageService);

  t(key: string, params: Record<string, string | number> = {}): string {
    return this.lang.t(key, params);
  }

  // Filters (Relias-like)
  search = signal('');
  typeFilter = signal<'all' | RewardType>('all');
  fromDate = signal<string>(''); // yyyy-mm-dd
  toDate = signal<string>('');   // yyyy-mm-dd

  // UI
  notice = signal('');
  busy = signal(false);

  private user$ = authState(this.auth);

  // Wallet (total points)
  private wallet$ = this.user$.pipe(
    switchMap(u => {
      if (!u) return of({ totalPoints: 0 } as WalletDoc);
      return docData(doc(this.afs, `users/${u.uid}/wallet/main`) as any).pipe(
        map((w: any) => ({ totalPoints: Number(w?.totalPoints ?? 0) } as WalletDoc))
      );
    })
  );
  wallet = toSignal(this.wallet$, { initialValue: { totalPoints: 0 } });

  // Rewards + join course title
  private rows$ = this.user$.pipe(
    switchMap(u => {
      if (!u) return of([] as RewardRow[]);
      const rcol = collection(this.afs, `users/${u.uid}/rewards`);
      return collectionData(rcol, { idField: 'id' }).pipe(
        switchMap((rewardsRaw: any[]) => {
          const rewards = (rewardsRaw || []).map(r => ({
            id: String(r.id),
            type: (r.type || 'points') as RewardType,
            title: String(r.title || ''),
            courseId: String(r.courseId || ''),
            score: typeof r.score === 'number' ? r.score : undefined,
            honor: r.honor ? String(r.honor) : undefined,
            hours: typeof r.hours === 'number' ? r.hours : undefined,
            creditUnit: r.creditUnit ? String(r.creditUnit) : undefined,
            points: typeof r.points === 'number' ? r.points : undefined,
            badge: r.badge ? String(r.badge) : undefined,
            certificateId: r.certificateId ? String(r.certificateId) : undefined,
            certificateNo: r.certificateNo ? String(r.certificateNo) : undefined,
            issuedAtMs: epochMs(r.issuedAt),
          })) as RewardRow[];

          // Join courses to display courseTitle
          const courseIds = Array.from(new Set(rewards.map(r => r.courseId).filter(Boolean)));
          if (!courseIds.length) return of(rewards.map(r => ({ ...r, courseTitle: r.courseId || '—' })));

          const courseObs = courseIds.map(cid =>
            docData(doc(this.afs, `courses/${cid}`) as any).pipe(
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

  rowsSrc = toSignal(this.rows$, { initialValue: [] as RewardRow[] });

  // View = filtered table
  view = computed(() => {
    let rows = this.rowsSrc();

    const q = this.search().trim().toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.courseTitle || '').toLowerCase().includes(q) ||
        (r.honor || '').toLowerCase().includes(q) ||
        (r.certificateNo || '').toLowerCase().includes(q)
      );
    }

    const tf = this.typeFilter();
    if (tf !== 'all') rows = rows.filter(r => r.type === tf);

    const f = this.fromDate() ? Date.parse(this.fromDate()) : undefined;
    const t = this.toDate() ? Date.parse(this.toDate()) : undefined;
    if (f || t) {
      rows = rows.filter(r => {
        const ms = r.issuedAtMs ?? 0;
        if (f && ms < f) return false;
        if (t && ms > (t + 24 * 60 * 60 * 1000 - 1)) return false;
        return true;
      });
    }

    return rows;
  });

  totalShown = computed(() => this.view().length);
  totalAll = computed(() => this.rowsSrc().length);

  // ── Gamification: level + badges ──────────────────────────────
  readonly levelInfo = computed(() => levelInfoFor(this.wallet().totalPoints ?? 0));

  readonly badges = computed(() => {
    const earned = new Set(
      this.rowsSrc()
        .filter(r => r.type === 'badge')
        .map(r => (r as any).badge || r.id.replace(/^badge_/, ''))
    );
    return BADGE_CATALOG.map(b => ({
      ...b,
      earned: earned.has(b.key),
      name: this.t(`badge.${b.key}`),
      desc: this.t(`badge.${b.key}.desc`),
    }));
  });

  readonly badgesEarnedCount = computed(() => this.badges().filter(b => b.earned).length);
  readonly coursesRewarded = computed(
    () => this.rowsSrc().filter(r => r.type === 'points' && r.courseId).length
  );

  fmtDate(ms?: number) { return fmtDate(ms); }

  labelType(type: RewardType) {
    if (type === 'certificate') return this.t('rewards.typeCertificate');
    if (type === 'badge') return this.t('rewards.typeBadge');
    if (type === 'credit_hours') return this.t('rewards.typeHours');
    return this.t('rewards.typePoints');
  }

  rewardDisplayTitle(r: RewardRow): string {
    if (r.type === 'badge' && r.badge) return this.t(`badge.${r.badge}`);
    return r.title || this.labelType(r.type);
  }

  openCertificate(r: RewardRow) {
    if (this.isIndividualLearner()) {
      this.router.navigate(['/learner/transcript']);
      return;
    }

    // your learnerRoutes: { path: 'certifications', component: Certifications }
    // certifications reads queryParam courseId (recommended)
    this.router.navigate(['/learner/certifications'], {
      queryParams: { courseId: r.courseId }
    });
  }

  reset() {
    this.search.set('');
    this.typeFilter.set('all');
    this.fromDate.set('');
    this.toDate.set('');
  }
}
