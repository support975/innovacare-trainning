// Shared reward/points/badge catalog and helpers, used by both the learner's
// own Rewards page (features/learner/rewards) and the admin Rewards Center
// (features/manager/rewards-center). Extracted so level thresholds and badge
// definitions can't drift between the two.

export type RewardType = 'certificate' | 'badge' | 'points' | 'credit_hours';

export interface RewardRow {
  id: string;
  issuedAtMs?: number;

  type: RewardType;
  title: string;
  note?: string;

  courseId: string;
  courseTitle: string;

  score?: number;
  honor?: string;

  hours?: number;
  creditUnit?: string;
  licenseId?: string;

  points?: number;
  badge?: string;

  certificateId?: string;
  certificateNo?: string;

  manual?: boolean;
  grantedBy?: string;
  grantedByRole?: string;
}

export interface WalletDoc {
  totalPoints?: number;
}

export interface LevelDef {
  key: string;
  labelKey: string;
  icon: string;
  minPoints: number;
}

export const LEVELS: LevelDef[] = [
  { key: 'bronze', labelKey: 'rewards.levelBronze', icon: '🥉', minPoints: 0 },
  { key: 'silver', labelKey: 'rewards.levelSilver', icon: '🥈', minPoints: 250 },
  { key: 'gold', labelKey: 'rewards.levelGold', icon: '🥇', minPoints: 750 },
  { key: 'platinum', labelKey: 'rewards.levelPlatinum', icon: '💎', minPoints: 1500 },
  { key: 'legend', labelKey: 'rewards.levelLegend', icon: '🏆', minPoints: 3000 },
];

export const BADGE_CATALOG: Array<{ key: string; icon: string }> = [
  { key: 'first_course', icon: '🌱' },
  { key: 'five_courses', icon: '📚' },
  { key: 'ten_courses', icon: '🔍' },
  { key: 'twenty_five_courses', icon: '🎓' },
  { key: 'exam_passed', icon: '🏅' },
  { key: 'perfect_score', icon: '⭐' },
];

export interface LevelInfo {
  current: LevelDef;
  next: LevelDef | null;
  percent: number;
  pointsToNext: number;
}

export function levelInfoFor(points: number): LevelInfo {
  let current = LEVELS[0];
  let next: LevelDef | null = null;
  for (const lvl of LEVELS) {
    if (points >= lvl.minPoints) current = lvl;
    else { next = lvl; break; }
  }
  const base = current.minPoints;
  const span = next ? next.minPoints - base : 0;
  const percent = next ? Math.min(100, Math.round(((points - base) / span) * 100)) : 100;
  return {
    current,
    next,
    percent,
    pointsToNext: next ? next.minPoints - points : 0,
  };
}

export function badgeDisplay(t: (key: string) => string, key: string) {
  return {
    name: t(`badge.${key}`),
    desc: t(`badge.${key}.desc`),
  };
}

export function epochMs(x: any): number | undefined {
  if (!x) return undefined;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    const t = Date.parse(x);
    return isNaN(t) ? undefined : t;
  }
  if (typeof x?.toMillis === 'function') return x.toMillis();
  if (typeof x?.toDate === 'function') return +x.toDate();
  return undefined;
}

export function fmtDate(ms?: number): string {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleDateString(); } catch { return '—'; }
}
