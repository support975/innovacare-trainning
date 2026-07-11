# Exam Proctoring System - Implementation Guide

## Overview

This system enables secure onsite exam administration with proctor-managed identity verification. Candidates cannot start an onsite exam without prior approval from a proctor supervisor.

## Architecture

### Key Components

#### 1. **Models** (`src/app/data/models.ts`)
- **ExamCenter** — Physical exam location (address, timezone, etc.)
- **ExamSession** — Scheduled exam at a center on a specific date
- **ProctorVerification** — Record of identity check (verified: true/false)
- **ProctorAuditLog** — Audit trail of all proctor actions

#### 2. **ProctorService** (`src/app/data/proctor.service.ts`)
Main service for proctor operations:
- `createCenter()` — Register exam center
- `createSession()` — Schedule exam session
- `verifyCandidate()` — Mark candidate as verified (true/false)
- `isCandidateVerifiedToday()` — Check if candidate approved for exam

#### 3. **ProctorDashboardComponent** (`src/app/features/proctor/proctor-dashboard/`)
UI for proctors to:
- View candidates enrolled for a session
- Upload ID photos and candidate photos
- Approve or reject candidates
- Monitor audit log

#### 4. **ExamRunnerComponent** (modified)
- Checks `proctorVerificationRequired()` signal
- Blocks exam start if verification pending
- Shows "Awaiting proctor verification" alert

## Setup Instructions

### Step 1: Create Exam Centers

Centers are physical locations where exams are held.

```typescript
// In your organization setup:
const centerId = await proctorService.createCenter({
  name: 'Washington Medical Center',
  address: '123 Health Ave',
  city: 'Washington',
  state: 'DC',
  country: 'USA',
  timezone: 'America/New_York',
  orgId: 'org-123'
});
```

### Step 2: Create Exam Sessions

Sessions link an exam to a center on a specific date.

```typescript
const sessionId = await proctorService.createSession({
  examId: 'exam-456',
  courseId: 'course-789',
  centerId: centerId,
  orgId: 'org-123',
  sessionDate: new Date('2026-03-15'), // Firestore Timestamp
  startTime: '09:00',
  endTime: '17:00',
  durationMinutes: 120,
  enrolledCandidateIds: ['uid1', 'uid2', 'uid3'],
  requireIdentityVerification: true,
  status: 'scheduled'
});
```

### Step 3: Assign Proctors

Add proctor role to users:

```typescript
// In user document, set:
{
  role: 'proctor',
  orgId: 'org-123'
}
```

Proctors can be accessed via the route:
```
/proctor/sessions/{sessionId}
```

### Step 4: Candidate Starts Exam

Candidate navigates to exam with sessionId param:
```
/learner/courses/{courseId}/exam/{examId}?sessionId={sessionId}
```

The exam runner will:
1. Load the session
2. Check if `requireIdentityVerification` is true
3. Query for `ProctorVerification` record
4. Block start if not verified yet

### Step 5: Proctor Verification Flow

1. Proctor opens dashboard: `/proctor/sessions/{sessionId}`
2. Sees list of enrolled candidates
3. For each candidate:
   - Uploads ID document photo (passport, driver's license, etc.)
   - Optionally uploads candidate photo for comparison
   - Clicks "Approve & Unlock Access" or "Reject Verification"
4. System creates:
   - `ProctorVerification` record with `verified: true/false`
   - `ProctorAuditLog` entry for audit trail
5. Candidate can now start exam

## Database Schema

### Collection: `examCenters`
```json
{
  "id": "center-123",
  "name": "Washington Medical Center",
  "address": "123 Health Ave",
  "city": "Washington",
  "state": "DC",
  "country": "USA",
  "timezone": "America/New_York",
  "orgId": "org-123",
  "createdAt": Timestamp,
  "updatedAt": Timestamp
}
```

### Collection: `examSessions`
```json
{
  "id": "session-456",
  "examId": "exam-123",
  "courseId": "course-789",
  "centerId": "center-123",
  "orgId": "org-123",
  "sessionDate": Timestamp,
  "startTime": "09:00",
  "endTime": "17:00",
  "durationMinutes": 120,
  "enrolledCandidateIds": ["uid1", "uid2"],
  "capacity": 30,
  "proctorIds": ["proctor-uid-1"],
  "requireIdentityVerification": true,
  "status": "scheduled",
  "createdAt": Timestamp,
  "updatedAt": Timestamp
}
```

### Collection: `proctorVerifications`
```json
{
  "id": "verify-789",
  "sessionId": "session-456",
  "candidateUid": "uid1",
  "proctorUid": "proctor-uid-1",
  "verified": true,
  "reason": "",
  "idPhotoUrl": "data:image/...",
  "candidatePhotoUrl": "data:image/...",
  "verifiedAt": Timestamp,
  "createdAt": Timestamp,
  "updatedAt": Timestamp
}
```

### Collection: `proctorAuditLogs`
```json
{
  "id": "audit-999",
  "sessionId": "session-456",
  "proctorUid": "proctor-uid-1",
  "candidateUid": "uid1",
  "action": "verified",
  "details": "",
  "timestamp": Timestamp
}
```

## Firestore Rules

Add these rules to allow proctors to verify candidates:

```
match /examSessions/{sessionId} {
  allow read: if request.auth != null;
  allow write: if hasRole('admin', 'manager', 'super_admin', 'proctor');
}

match /proctorVerifications/{verifyId} {
  allow read: if request.auth != null;
  allow create: if hasRole('proctor', 'admin', 'manager', 'super_admin');
}

match /proctorAuditLogs/{logId} {
  allow read: if hasRole('proctor', 'admin', 'manager', 'super_admin');
  allow create: if hasRole('proctor', 'admin', 'manager', 'super_admin');
}

match /examCenters/{centerId} {
  allow read: if request.auth != null;
  allow write: if hasRole('admin', 'manager', 'super_admin');
}
```

## Usage Scenarios

### Scenario 1: Online Exam (No Verification)
```typescript
// Create session with requireIdentityVerification: false
// Candidate can start exam immediately
```

### Scenario 2: Hybrid Exam (Some Locations Require Verification)
```typescript
// Create two sessions for same exam:
// - Online: requireIdentityVerification = false
// - Onsite: requireIdentityVerification = true (at center)
```

### Scenario 3: Rejected Candidate Retries
```typescript
// Proctor can re-verify candidate
// New ProctorVerification record created with verified: true
// Previous rejection is logged but doesn't block new attempt
```

## Security Considerations

1. **Photo Upload**: Currently stores base64 data URIs. For production, upload to Cloud Storage with signed URLs.

2. **Audit Trail**: All verification actions are logged with:
   - Proctor UID who verified
   - Candidate UID
   - Timestamp
   - Verification status

3. **Session Isolation**: Verifications are tied to specific session + date, not reusable across sessions.

4. **Role-Based Access**: Only `proctor` role (and admin roles) can access verification dashboard.

## Future Enhancements

1. **Live Monitoring** — Proctor watches exam progress (timer, current question, flags)
2. **Proctoring Rules** — Disable copy/paste, screen sharing detection, camera monitoring
3. **Photo Upload to Cloud Storage** — Store ID/candidate photos in GCS with encryption
4. **Bulk Upload** — CSV of candidates with assigned proctors
5. **SMS/Email Notifications** — Alert candidates when approved
6. **Rescheduling** — Allow candidates to join different sessions if rejected

## Troubleshooting

### Candidate sees "Awaiting proctor verification" but shouldn't
- Check `requireIdentityVerification` is false on session
- Clear browser cache and refresh

### Proctor can't access dashboard
- Verify user has `role: 'proctor'` in user document
- Check user's `orgId` matches session's `orgId`

### Photos not uploading
- Check browser console for errors
- Verify image file size < 5MB
- Try JPEG instead of PNG

## Testing

```typescript
// Mock test: Create session → Verify candidate → Start exam

it('should allow verified candidate to start exam', async () => {
  // 1. Create session with verification required
  const session = await proctorService.createSession({...});
  
  // 2. Proctor verifies candidate
  await proctorService.verifyCandidate(session.id, 'candidate-uid', 'proctor-uid', true);
  
  // 3. Candidate can start exam
  const verified = await proctorService.isCandidateVerifiedToday(session.id, 'candidate-uid');
  expect(verified).toBe(true);
});
```
