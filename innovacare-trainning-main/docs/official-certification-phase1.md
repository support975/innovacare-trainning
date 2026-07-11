# Official Certification Authority - Phase 1

## Scope

Phase 1 adds the official certification orchestration foundation without changing the existing course, exam, grading, enrollment, reward, or certificate flows.

The existing exam engine remains under:

- `courses/{courseId}/exams/{examId}`
- `courses/{courseId}/exams/{examId}/questions`
- `courses/{courseId}/exams/{examId}/answerKey`
- `users/{uid}/examSubmissions`

## Feature Gate

The manager route is available only when:

- the organization has an enterprise plan feature `manager.officialCertifications`, and
- the organization has `certificationAuthorityEnabled: true`, or
- the organization has `features.officialCertifications: true`, or
- the user profile has a permission that starts with `certification.`.

## New Collections

- `officialCertifications`
- `certificationSessions`
- `candidateApplications`
- `candidateApplications/{applicationId}/documents`
- `candidateApplications/{applicationId}/juryReviews`
- `candidateApplications/{applicationId}/decisions`
- `certificationAuditLogs`

All authority-owned top-level records include `organizationId`.

## Phase 1 UI

Manager route:

- `/manager/official-certifications`

The page currently supports:

- creating an official certification record;
- creating a draft certification session;
- linking existing program, course, and exam IDs;
- viewing basic certification/session inventory.

## What Is Not Changed Yet

Phase 1 does not:

- modify `ExamRunnerComponent`;
- change exam grading;
- block or alter course-linked exams;
- issue official final decisions;
- publish results;
- implement candidate document upload UI;
- implement jury dashboards.

## Rollback

Rollback is additive:

1. Remove the manager route `/manager/official-certifications`.
2. Remove the manager menu item.
3. Disable `manager.officialCertifications` in plan entitlements.
4. Leave new collections in Firestore unused, or delete them after export.
5. Existing course, learner, exam and certificate flows remain unchanged.
