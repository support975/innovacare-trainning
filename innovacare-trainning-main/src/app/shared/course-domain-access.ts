export interface DomainRestrictedCourse {
  allowedEmailDomains?: string[] | null;
}

export function normalizedAllowedEmailDomains(course: DomainRestrictedCourse | null | undefined): string[] {
  const domains = Array.isArray(course?.allowedEmailDomains) ? course.allowedEmailDomains : [];
  return domains
    .map(domain => String(domain ?? '').trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

export function hasCourseEmailDomainRestriction(course: DomainRestrictedCourse | null | undefined): boolean {
  return normalizedAllowedEmailDomains(course).length > 0;
}

export function canAccessCourseByEmail(
  course: DomainRestrictedCourse | null | undefined,
  email?: string | null
): boolean {
  const allowedDomains = normalizedAllowedEmailDomains(course);
  if (!allowedDomains.length) return true;

  const domain = String(email ?? '').trim().toLowerCase().split('@')[1] ?? '';
  return allowedDomains.includes(domain);
}
