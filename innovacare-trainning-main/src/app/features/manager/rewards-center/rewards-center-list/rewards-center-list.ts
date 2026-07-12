import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  where,
} from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, filter, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { GrantRewardDialog } from '../grant-reward-dialog/grant-reward-dialog';

interface LearnerRow {
  id: string;
  displayName?: string;
  email?: string;
  totalPoints: number;
  periodPoints?: number;
}

@Component({
  selector: 'app-rewards-center-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, GrantRewardDialog],
  templateUrl: './rewards-center-list.html',
  styleUrl: './rewards-center-list.css',
})
export class RewardsCenterList {
  private afs = inject(Firestore);
  private authSvc = inject(AuthService);
  private router = inject(Router);

  private profile$ = this.authSvc.profile$.pipe(filter(Boolean));

  view = signal<'overview' | 'leaderboard'>('overview');
  period = signal<'all' | 'month'>('all');
  search = signal('');

  dialogOpen = signal(false);
  dialogUid = signal('');
  dialogName = signal('');

  private learners$ = this.profile$.pipe(
    switchMap(profile => {
      if (!profile.orgId) return of([] as Array<{ id: string; displayName?: string; email?: string }>);
      const q = query(
        collection(this.afs, 'users'),
        where('orgId', '==', profile.orgId),
        where('role', '==', 'learner')
      );
      return collectionData(q, { idField: 'id' }).pipe(
        map(list => (list || []) as Array<{ id: string; displayName?: string; email?: string }>)
      );
    })
  );

  private rows$ = this.learners$.pipe(
    switchMap(learners => {
      if (!learners.length) return of([] as LearnerRow[]);
      const walletObs = learners.map(l =>
        docData(doc(this.afs, `users/${l.id}/wallet/main`)).pipe(
          map((w: any): LearnerRow => ({
            id: l.id,
            displayName: l.displayName,
            email: l.email,
            totalPoints: Number(w?.totalPoints ?? 0),
          }))
        )
      );
      return combineLatest(walletObs);
    })
  );

  allRows = toSignal(this.rows$, { initialValue: [] as LearnerRow[] });

  private periodRows = signal<LearnerRow[] | null>(null);
  private loadingPeriod = signal(false);

  displayRows = computed(() => {
    const base = this.period() === 'month' && this.periodRows() ? this.periodRows()! : this.allRows();
    const term = this.search().trim().toLowerCase();
    let rows = base;
    if (term) {
      rows = rows.filter(r =>
        (r.displayName || '').toLowerCase().includes(term) ||
        (r.email || '').toLowerCase().includes(term)
      );
    }
    return rows;
  });

  leaderboardRows = computed(() => {
    const sortKey = this.period() === 'month' ? 'periodPoints' : 'totalPoints';
    return [...this.displayRows()].sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));
  });

  stats = computed(() => {
    const rows = this.allRows();
    const totalPoints = rows.reduce((s, r) => s + r.totalPoints, 0);
    const topLearner = [...rows].sort((a, b) => b.totalPoints - a.totalPoints)[0];
    return {
      totalLearners: rows.length,
      totalPoints,
      topLearnerName: topLearner ? (topLearner.displayName || topLearner.email || '—') : '—',
    };
  });

  setView(v: 'overview' | 'leaderboard') {
    this.view.set(v);
  }

  setPeriod(p: 'all' | 'month') {
    this.period.set(p);
    if (p === 'month' && !this.periodRows() && !this.loadingPeriod()) {
      this.loadPeriodPoints();
    }
  }

  private loadPeriodPoints() {
    const learners = this.allRows();
    if (!learners.length) {
      this.periodRows.set([]);
      return;
    }
    this.loadingPeriod.set(true);
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const perLearner$ = learners.map(l =>
      collectionData(collection(this.afs, `users/${l.id}/rewards`)).pipe(
        map((rewards: any[]) => {
          const periodPoints = (rewards || [])
            .filter(r => {
              const ms = r?.issuedAt?.toMillis?.() ?? (r?.issuedAt ? new Date(r.issuedAt).getTime() : 0);
              return ms >= monthAgo;
            })
            .reduce((s, r) => s + Number(r?.points || 0), 0);
          return { ...l, periodPoints };
        })
      )
    );

    combineLatest(perLearner$).subscribe(rows => {
      this.periodRows.set(rows);
      this.loadingPeriod.set(false);
    });
  }

  openGrantDialog(row: LearnerRow) {
    this.dialogUid.set(row.id);
    this.dialogName.set(row.displayName || row.email || '');
    this.dialogOpen.set(true);
  }

  closeDialog() {
    this.dialogOpen.set(false);
  }

  onGranted() {
    this.periodRows.set(null);
    if (this.period() === 'month') this.loadPeriodPoints();
  }

  viewDetail(id: string) {
    this.router.navigate(['/manager/rewards-center', id]);
  }

  rankIcon(index: number): string {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  }
}
