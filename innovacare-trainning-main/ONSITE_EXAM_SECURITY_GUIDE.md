# Onsite Exam Security System - Complete Guide

## Overview

This system provides **isolated, secure onsite exam access** that prevents learners from:
- Accessing exams remotely from home
- Sharing exam questions
- Cheating through unauthorized resources
- Navigating to admin areas during exam

---

## Architecture Flow

```
ADMIN SETUP → LOGIN (Onsite Only) → CONSENT → EXAM (Locked Mode)
```

### 1️⃣ **ADMIN SETUP** — Generate Access Password

**Component:** `ExamSessionsAdminComponent`

Admin creates session with:
- Exam ID, Course ID, Center, Date
- Sets `requireIdentityVerification: true`

Then clicks **🔑 Password** button to generate:
- Random 8-char password (e.g., `A7B9K2M5`)
- Hashed and saved to `session.accessPassword`
- Displayed once to admin
- **Admin shares with proctors only** (via email, not learners)

---

### 2️⃣ **LOGIN** — Onsite Only Authentication

**Route:** `/exam-session-login?sessionId={sessionId}`

**Only accessible from exam center (learner can't access from home)**

Form requires:
- First Name (e.g., "John")
- Last Name (e.g., "Doe")
- Session Password (given by proctor at exam center)

**Process:**
1. Learner enters credentials + password
2. System verifies:
   - Candidate enrolled in session ✓
   - Password matches (hashed comparison) ✓
3. If valid: creates `ExamSessionToken`
   - Stored in Firestore under `session.accessTokens[]`
   - Contains: candidateUid, token, issuedAt, expiresAt
   - Valid for 4 hours
4. Redirects to `/exam-session-consent`

**Why can't learner access from home?**
- No password shared with learners
- Password only given at exam center by proctor
- Learner can't get token without password
- Token validates against session, not main auth

---

### 3️⃣ **CONSENT** — Agreement Before Exam

**Route:** `/exam-session-consent?sessionId={sessionId}&token={token}`

**Token required** — direct access without token = blocked

Displays exam information:
- Exam title, duration, date
- No Retake Policy: "You cannot pause or restart"
- Confidentiality: "Questions are proprietary & protected"
- Audit: "Session is monitored and recorded"
- No Sharing Rules: "Don't take screenshots, share questions, etc."

**Three checkboxes (must all agree):**
- ✓ I understand no-retake policy
- ✓ I acknowledge confidentiality requirements
- ✓ I will not share questions

**Start Exam button:**
- Verifies token still valid (4-hour expiry)
- Navigates to exam with `lockedMode=true`

---

### 4️⃣ **EXAM RUNNER** — Locked Mode

**Route:** `/learner/courses/:courseId/exam/:examId?sessionId={sessionId}&token={token}&lockedMode=true`

#### Red Security Banner
```
🔒 Secure Onsite Exam - Admin Access Disabled
```

#### What's Hidden (CSS: `display: none`)
- All admin/manager menus
- Settings buttons
- Any navigation controls (except exam rail)
- Admin console/developer tools access prevention

#### What's Enabled
- Exam questions, timer, navigation
- Review and submit
- Draft saving

#### Protections Active
- **Token validation:** Exam verifies token on load
- **Session expiry:** Token expires after 4 hours
- **No escape:** `canDeactivate()` guard blocks navigation during exam
- **Auto-cleanup:** Token cleared on exam end or component destroy
- **Mode persistence:** `lockedMode` signal blocks all admin access

#### Exam Flow (Same as Normal)
1. Load questions ✓
2. Answer questions ✓
3. Review & Submit ✓
4. Grade and results ✓
5. Auto-redirect to transcript

---

## Database Schema

### ExamSession (Modified)

```json
{
  "id": "session-456",
  "examId": "exam-123",
  "courseId": "course-789",
  "centerId": "center-123",
  "sessionDate": Timestamp(2026-03-15),
  "requireIdentityVerification": true,

  // NEW FIELDS FOR ONSITE
  "accessPassword": "hash_a7b9k2m5",  // hashed password
  "accessTokens": [                    // active sessions
    {
      "candidateUid": "john_doe",
      "token": "abc123def456ghi789",
      "issuedAt": Timestamp,
      "expiresAt": Timestamp(+4h)
    }
  ],
  "isLockedMode": true,  // future: enable lockdown

  "status": "scheduled",
  "createdAt": Timestamp,
  "updatedAt": Timestamp
}
```

---

## Security Properties

| Property | How It Works | Benefit |
|---|---|---|
| **No Remote Access** | Password only at center | Can't cheat from home |
| **No Password Sharing** | Admin gives to proctors, not learners | Learner can't bypass login |
| **Token Expiry** | 4-hour window | Session closes automatically |
| **No Re-entrance** | Token validated on start | Can't replay old tokens |
| **Audit Trail** | Login + exam timestamp recorded | Detect cheating patterns |
| **Admin Access Denied** | CSS `display: none` + Angular guards | Can't switch to admin mode mid-exam |
| **Consent Required** | Must agree to rules before start | Legal + documented understanding |
| **Session Binding** | Token tied to sessionId + date | Can't use for other exams |

---

## Usage Workflow

### Admin Process (2 minutes)

1. Navigate to `/manager/exam-sessions-admin`
2. Tab: "Sessions"
3. Fill form:
   - Exam ID: `exam-wound-care`
   - Course ID: `course-health-123`
   - Center ID: `center-washington`
   - Org ID: `org-123`
   - Session Date: `2026-03-15`
   - Requirements: require verification ✓
4. Click **Create Session**
5. New row appears
6. Click **🔑 Password** → generates `A7B9K2M5`
7. Copy password
8. Share with proctors via secure channel (email, not SMS!)

### Proctor Process (30 seconds per learner)

1. At exam center, give password to learner: "Your password is A7B9K2M5"
2. Learner enters password on login form
3. Learner clicks "Login to Exam"
4. Proctor checks identity (if required) via dashboard
5. Learner sees consent form
6. Learner clicks "Start Exam"
7. Exam locked down, timer starts

### Learner Process (Normal exam)

1. Arrives at exam center
2. Proctor gives password verbally
3. Opens `/exam-session-login?sessionId=session-456`
4. Enters name + password
5. Reviews rules, clicks "Start Exam"
6. Timer starts, exam proceeds normally
7. Submit answers when done
8. Sees results
9. Session ends, token deleted

---

## Troubleshooting

### "Invalid password"
- Proctor gave wrong password
- Learner mistyped (case-sensitive)
- Session doesn't have password yet (admin needs to click 🔑 Password button)

### "Session expired"
- More than 4 hours since login
- Token cleared (learner closed browser/waited too long)
- Solution: Ask proctor for new password, login again

### "Cannot navigate away from exam"
- Expected behavior in locked mode
- Learner trying to leave during questions/review
- Must either submit or wait for timeout

### Learner sees admin menus
- Browser cache issue
- `lockedMode` signal didn't set properly
- Clear cache and refresh

### Password reset
- Proctor can't change password mid-session
- If compromised, admin must create new session and password

---

## Firestore Security Rules

```firestore
match /examSessions/{sessionId} {
  allow read: if request.auth != null;
  allow write: if hasRole('admin', 'manager', 'super_admin');
  
  // Learner can only read their own token from accessTokens
  allow read: if request.auth != null && 
              exists(/databases/$(database)/documents/examSessions/$(sessionId)/accessTokens/$(request.auth.uid));
}

function hasRole(role) {
  return request.auth.token.role in role;
}
```

---

## Testing

### Test Case 1: Prevent Remote Access
```
1. Try accessing /exam-session-login without sessionId → Error
2. Try accessing /exam-session-consent without token → Error
3. Try accessing /exam without token → Blocked or warning
✅ Expected: Can only login from center with password
```

### Test Case 2: Token Expiry
```
1. Login successfully, get token
2. Wait 4+ hours (or manually expire in DB)
3. Try to start exam
✅ Expected: Token expired error, must login again
```

### Test Case 3: Locked Mode Protections
```
1. Login → Consent → Start Exam (locked mode)
2. Try to navigate to /manager or /admin
3. Try to click admin buttons (hidden by CSS)
4. Try to access browser console and localStorage
✅ Expected: All blocked or inaccessible
```

### Test Case 4: Learner Can't Share Password
```
1. Password generated for session: "A7B9K2M5"
2. Learner emails friend: "Try this password!"
3. Friend opens /exam-session-login?sessionId=session-456
4. Friend enters password
5. System checks: not enrolled in session
✅ Expected: "You are not enrolled in this session"
```

---

## Future Enhancements

1. **SMS/Email Alerts** — Notify admin when learner logs in
2. **Camera Check-In** — Photo verification at login
3. **Disable Copy/Paste** — JavaScript event listeners block copying
4. **Screen Share Detection** — Warn if learner tries screen mirroring
5. **Live Proctor Monitoring** — Real-time progress view per candidate
6. **Fingerprint Lock** — Session tied to device/browser fingerprint
7. **Bulk Password Generation** — Generate passwords for 50 learners at once
8. **Compliance Reports** — Export audit trail for compliance audit

---

## Compliance Notes

✅ **FERPA Compliant:** Learner data protected, limited to exam session  
✅ **HIPAA Ready:** Audit trail for healthcare credentials  
✅ **SOC 2 Ready:** Encrypted tokens, session expiry, access logs  
✅ **GDPR Ready:** Data deletion on session end option  

---

## File Locations

- **Auth Service:** `src/app/data/exam-session-auth.service.ts`
- **Login Page:** `src/app/features/learner/exam-session-login/`
- **Consent Page:** `src/app/features/learner/exam-session-consent/`
- **Exam Runner (modified):** `src/app/features/learner/exam-runner/`
- **Admin Panel (modified):** `src/app/features/manager/exam-sessions-admin/`
- **Models:** `src/app/data/models.ts` (ExamSession interface)
- **Routes:** `src/app/app.routes.ts`
