import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  collectionGroup,
  query,
  where,
} from '@angular/fire/firestore';
import { Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { Organization } from '../../../data/models';
import { OrganizationHierarchyService } from './organization-hierarchy.service';

export interface RegionRollupStats {
  orgId: string;
  orgName: string;
  learnerCount: number;
  completed: number;
  inProgress: number;
  overdue: number;
  completionRate: number;
}

export interface CouncilRollup {
  regions: RegionRollupStats[];
  totalLearners: number;
  totalCompleted: number;
  totalInProgress: number;
  totalOverdue: number;
  /** Unweighted average across regions, not learner-weighted. */
  averageCompletionRate: number;
}

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DUE_DAYS = 30;

function epochMs(x: any): number | undefined {
  if (!x) return undefined;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') { const t = Date.parse(x); return isNaN(t) ? undefined : t; }
  if (typeof x?.toMillis === 'function') return x.toMillis();
  if (typeof x?.seconds === 'number') return x.seconds * 1000;
  return undefined;
}

/**
 * Live fan-out reads, one per region — fine at ~10-region scale. Switch to a
 * scheduled Cloud Function pre-aggregate past ~30-50 regions.
 */
@Injectable({ providedIn: 'root' })
export class OrganizationCouncilRollupService {
  private readonly afs = inject(Firestore);
  private readonly hierarchy = inject(OrganizationHierarchyService);

  rollupFor(councilOrgId: string): Observable<CouncilRollup> {
    return this.hierarchy.listChildren(councilOrgId).pipe(
      switchMap((regions) =>
        regions.length ? combineLatest(regions.map((region) => this.statsFor(region))) : of([] as RegionRollupStats[])
      ),
      map((regions) => this.combine(regions))
    );
  }

  private statsFor(region: Organization): Observable<RegionRollupStats> {
    const enr$ = collectionData(
      query(collectionGroup(this.afs, 'enrollments'), where('orgId', '==', region.id)),
      { idField: 'id' }
    );
    const users$ = collectionData(
      query(collection(this.afs, 'users'), where('orgId', '==', region.id)),
      { idField: 'id' }
    );

    return combineLatest([enr$, users$]).pipe(
      map(([enrollments, users]) => {
        const now = Date.now();
        let completed = 0;
        let inProgress = 0;
        let overdue = 0;

        for (const enr of enrollments as any[]) {
          if (enr.status === 'completed') {
            completed++;
            continue;
          }
          if (enr.status === 'started') inProgress++;

          const assigned = epochMs(enr.assignedAt);
          const dueTs = epochMs(enr.dueDate) ?? (assigned ? assigned + DEFAULT_DUE_DAYS * DAY : undefined);
          if (dueTs && dueTs < now) overdue++;
        }

        const total = (enrollments as any[]).length;
        return {
          orgId: region.id,
          orgName: region.name,
          learnerCount: (users as any[]).length,
          completed,
          inProgress,
          overdue,
          completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        } satisfies RegionRollupStats;
      })
    );
  }

  private combine(regions: RegionRollupStats[]): CouncilRollup {
    return {
      regions,
      totalLearners: regions.reduce((sum, r) => sum + r.learnerCount, 0),
      totalCompleted: regions.reduce((sum, r) => sum + r.completed, 0),
      totalInProgress: regions.reduce((sum, r) => sum + r.inProgress, 0),
      totalOverdue: regions.reduce((sum, r) => sum + r.overdue, 0),
      averageCompletionRate: regions.length
        ? Math.round(regions.reduce((sum, r) => sum + r.completionRate, 0) / regions.length)
        : 0,
    };
  }
}
