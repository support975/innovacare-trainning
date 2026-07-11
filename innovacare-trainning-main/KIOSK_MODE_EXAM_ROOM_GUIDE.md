# Kiosk Mode - Exam Room Setup & Operation Guide

## Overview

**Kiosk Mode** transforms your exam room into a secure, locked-down testing environment where:
- Admin/Proctor has full **monitoring dashboard** on dedicated computer
- Learners access **only exam pages** (login → consent → exam → results)
- All browser features are **disabled** (back button, copy, new tabs, etc.)
- After exam, learners automatically **return to login** for next candidate

```
🎪 EXAM ROOM LAYOUT

ADMIN COMPUTER (Proctor)        LEARNER COMPUTERS (1-10)
┌────────────────────┐           ┌──────────────┐  ┌──────────────┐
│ 📊 Monitoring      │           │ 🔐 Login     │  │ 🔐 Login     │
│ Dashboard          │           │ Station 1    │  │ Station 2    │
│                    │           │              │  │              │
│ • 10 candidates    │           │ Ready for    │  │ John Doe in  │
│ • 7 in exam        │           │ next test    │  │ Consent...   │
│ • 2 submitted      │           │              │  │              │
│ • 1 waiting        │           └──────────────┘  └──────────────┘
│                    │
│ 🔑 Password gen    │           ┌──────────────┐  ┌──────────────┐
│ 📋 Verify ID       │           │ 📝 Exam      │  │ ✓ Results    │
│ ⏹️ Force end       │           │ Station 3    │  │ Station 4    │
└────────────────────┘           │ Jane Smith   │  │ Mike 87%     │
                                 │ Q5/50 1:45   │  │              │
                                 └──────────────┘  └──────────────┘
```

---

## 🖥️ Admin Setup (Proctor Computer)

### Route Access
```
/proctor/monitor/{sessionId}
```

### Dashboard Features

1. **Live Session Overview**
   - Total candidates enrolled
   - Currently in exam
   - Completed/submitted
   - Waiting to start

2. **Learner Status Cards** (Real-time)
   ```
   ┌─ John Doe ─────────────────┐
   │ Status: 📝 In Exam          │
   │ ⏱️ 1:45:32 remaining        │
   │ Progress: Q5/50 (10%)      │
   │ [████░░░░░░░░░░░░░]        │
   └────────────────────────────┘
   ```

3. **Status Colors**
   - 🔵 Blue = In Exam
   - 🟠 Orange = Reviewing Terms
   - 🔴 Gray = Waiting
   - 🟡 Yellow = Submitted (grading)
   - 🟢 Green = Results Viewed

4. **Time Warnings** 💛 (5 min) 🔴 (1 min critical)

---

## 👨‍💻 Learner Workflow (Kiosk Locked)

### Stage 1: Login Page (`/exam-session-login`)
```
┌──────────────────────────────────┐
│  🔐 SECURE EXAM ACCESS           │
├──────────────────────────────────┤
│ First Name:    [________________] │
│ Last Name:     [________________] │
│ Password:      [***PASSWORD****] │  ← Given by proctor
│                                  │
│ [  🔓 LOGIN TO EXAM  ]           │
└──────────────────────────────────┘

⏰ Kiosk Status: NOT YET ACTIVE
- Can close page (not started)
- No protections yet
```

### Stage 2: Consent Form (`/exam-session-consent`)
```
┌──────────────────────────────────────────┐
│ Exam Agreement & Confidentiality         │
├──────────────────────────────────────────┤
│ ⏱️ Duration: 2 hours                     │
│ 🚫 No retake once started                │
│ 🔐 Questions are confidential            │
│                                          │
│ AGREE TO:                                │
│ ☐ No-retake policy                      │
│ ☐ Confidentiality requirements          │
│ ☐ No question sharing/screenshots        │
│                                          │
│ [  ▶️ START EXAM  ] (disabled until all  │
│                     3 boxes checked)     │
└──────────────────────────────────────────┘

⏰ Kiosk Status: ACTIVATING
- About to lock down
- Token verified
```

### Stage 3: Exam (`/exam-runner?lockedMode=true`)
```
🔒 Secure Onsite Exam - Admin Access Disabled
┌──────────────────────────────────────────┐
│ Question 5 of 50                         │
│ ⏱️ 1:45:32 remaining                    │
├──────────────────────────────────────────┤
│ A patient with Stage 3 pressure ulcer... │
│                                          │
│ A) ☐ Surgical debridement only          │
│ B) ☐ Moisture barrier, assessment       │
│ C) ☐ Antibiotics exclusively            │
│ D) ☐ No treatment, monitor              │
│                                          │
│ [Previous] [Next] [Review & Submit]     │
└──────────────────────────────────────────┘

⏰ Kiosk Status: FULL PROTECTION
✓ All protections active
✓ Token validated
✓ No navigation away
```

### Stage 4: Results (`auto-redirect after 3s`)
```
┌──────────────────────────────────────────┐
│ ✓ TEST COMPLETED                        │
│                                          │
│ Your Score: 87%                         │
│ Passing Score: 80%                      │
│ Status: ✓ PASSED                        │
│                                          │
│ (Returning to login in 3 seconds...)    │
└──────────────────────────────────────────┘

⏰ Kiosk Status: DISABLING
- Token cleared
- Auto-redirect to login
```

### Stage 5: Back to Login
```
Same as Stage 1 - Ready for next candidate
⏰ Kiosk Status: INACTIVE
```

---

## 🔒 Kiosk Protections Active During Exam

| Protection | What's Blocked | Why |
|---|---|---|
| **Back Button** | Browser back / Alt+Left | Can't escape exam page |
| **New Tabs** | Ctrl+T, Cmd+T | Can't open Google/notes |
| **New Windows** | Ctrl+N, Cmd+N | Can't duplicate browser |
| **Close Tab** | Ctrl+W, Cmd+W | Can't close exam window |
| **Copy/Paste** | Ctrl+C/V | Can't copy questions |
| **Right-Click** | Context menu | No inspect element |
| **Drag & Drop** | File upload | Can't get external docs |
| **Text Selection** | Highlight & copy | Questions protected |
| **F12/Dev Tools** | Inspect/Console | No browser debugging |
| **Keyboard Shortcuts** | Ctrl+Shift+Delete | Clear cache blocked |

---

## 🔑 Password Management

### Generate Password (Admin)
```
1. Open: /manager/exam-sessions-admin
2. Tab: "Sessions"
3. Find session row
4. Click: 🔑 Password button
5. Copy displayed password: A7B9K2M5

⚠️ IMPORTANT:
- Share ONLY with proctors (verbally or secure email)
- NOT with learners beforehand
- Valid for entire exam session
- One password per session
```

### Share Password (Proctor)
```
CORRECT: "Your password is A7B9K2M5" (verbal, at center)
WRONG: Send via email/text to learners (defeats security)
WRONG: Print on exam paper (defeats security)

Why? → If learner has password, can try accessing from home
       Verbal-only ensures center-only access
```

---

## 📊 Admin Dashboard Real-Time Updates

The monitoring dashboard updates every **2 seconds** and shows:

### For each learner:
```
Name:         Jane Smith
Status:       📝 In Exam (blue card)
Time Left:    1:45:32 (green if OK, yellow if <5min, red if <1min)
Question:     7 / 50
Progress:     [████░░░░░░░░░░] 14%
```

### Color-coded states:
- **Waiting** (Gray): Not started, at login page
- **Reviewing Terms** (Orange): On consent page
- **In Exam** (Blue): Actively taking test
- **Submitted** (Yellow): Finished, awaiting grading
- **Results** (Green): Graded, viewing score

### Warning Triggers:
- 🟡 **5 min warning**: Timer turns yellow
- 🔴 **1 min critical**: Timer turns red + pulses

---

## Workflow: Multi-Learner Exam Session

### T=0:00 - Learners Arrive

**Computer 1, 2, 3, ..., 10** all show:
```
🔐 SECURE EXAM ACCESS
Please wait for proctor instructions
```

**Admin** sees: "10 candidates waiting"

---

### T=0:05 - First Learner Starts

**Learner on Station 1:**
1. Proctor verifies ID (if required)
2. Says: "Your password is A7B9K2M5"
3. Learner types name + password → Login
4. Redirected to consent form
5. Reads rules, checks 3 boxes
6. Clicks "Start Exam" → Exam starts

**Admin Dashboard Updates:**
```
Status: "📝 In Exam"
Timer: "1:59:45"
Q: "0/50"
```

---

### T=5:00 - Multiple Learners Testing

| Station | Learner | Status | Time Left |
|---|---|---|---|
| 1 | Jane Smith | 📝 In Exam | 1:54:45 |
| 2 | John Doe | 📋 Reviewing | - |
| 3 | Mike Johnson | ✓ Results | 87% |
| 4-10 | ... | 🔲 Waiting | - |

**Admin sees at a glance:**
- Jane on Q12/50 (24% done)
- John about to start
- Mike finished with 87%
- 7 more candidates waiting

---

### T=120:00 (2 hours) - Exam Ends

All learners' timers reach 0:00 → **Auto-submit**

**Admin sees:** "8 submitted, 2 graded so far"

**Learners see:**
```
Time expired! Submitting...
(Shows results briefly)
Returning to login...
```

Returns to `/exam-session-login` ready for next candidate

---

## 🛡️ Security Guarantees

### What Learners CANNOT Do:
- ❌ Access exam from home (no password)
- ❌ Copy exam questions (copy blocked)
- ❌ Take screenshots (right-click disabled)
- ❌ Share questions on chat (can't open tabs)
- ❌ Use external notes (no new windows)
- ❌ Go back mid-exam (navigation blocked)
- ❌ Escape to desktop (full screen option)
- ❌ Restart exam (locked per session)

### What Admin CAN Monitor:
- ✅ See who's currently testing
- ✅ Watch question-by-question progress
- ✅ Monitor time remaining (warnings at 5min, 1min)
- ✅ See who submitted/graded
- ✅ Verify ID before exam (if required)
- ✅ Force-end exam if needed (future feature)
- ✅ Full audit trail of logins/exits

---

## 🔧 Technical Implementation

### Files Created/Modified:

| File | Role |
|---|---|
| `kiosk.service.ts` | Enforce browser locks |
| `session-monitor.ts` | Admin dashboard |
| `exam-runner.ts` (modified) | Activate kiosk, redirect on end |
| `exam-session-login.ts` | Login gate |
| `exam-session-consent.ts` | Agreement + token validation |

### Key Signals:
```typescript
lockedMode: signal(false)     // true during exam
kioskService.enableKiosk()    // Activate protections
kioskService.returnToLogin()  // Redirect after exam
```

### Firestore Data:
```json
{
  "examSessions": {
    "session-123": {
      "accessPassword": "hash_a7b9k2m5",  // Hashed
      "accessTokens": [
        {
          "candidateUid": "john_doe",
          "token": "abc123...",
          "issuedAt": Timestamp,
          "expiresAt": Timestamp(+4h)
        }
      ]
    }
  }
}
```

---

## Troubleshooting

### Learner sees "Session expired"
**Cause:** More than 4 hours since login, or token cleared  
**Fix:** Ask proctor for new password, login again

### Back button works (protection failed)
**Cause:** Kiosk not activated (lockedMode=false)  
**Fix:** Verify URL has `?lockedMode=true&sessionId=xxx&token=yyy`

### Admin dashboard shows wrong status
**Cause:** Cache or slow polling (2-second refresh)  
**Fix:** Refresh page, wait for next update cycle

### Learner can open new tab
**Cause:** Browser version may not block Ctrl+T consistently  
**Fix:** Use Chromebook or locked-down browser (MDM option)

### "Cannot navigate away" message
**Expected:** Learner tried to leave exam mid-test  
**Action:** Return to exam, finish or wait for timeout

---

## Compliance & Audit

### Data Logged:
✅ Learner login time  
✅ Exam start time  
✅ Questions answered (timestamps)  
✅ Exam submit time  
✅ Final score  
✅ Proctor who verified (if required)  
✅ Any warnings triggered (time low, etc.)  

### Access Control:
✅ Session password hashed in DB  
✅ Tokens expire automatically (4h)  
✅ Token tied to sessionId + date (not reusable)  
✅ All learner data isolated per exam  

---

## Best Practices

### For Admins:
- Generate password **once per exam**, share securely
- Monitor dashboard for time warnings
- Have IT contact ready for tech issues
- Brief proctors on verification protocol
- Test with 1-2 learners before full session

### For Proctors:
- Give password verbally **only at center**
- Verify ID before revealing password
- Watch for suspicious activity during exam
- Note any tech issues for IT team
- Remind learners of confidentiality pledge

### For Learners:
- Arrive 10 minutes early
- Bring valid ID
- Read consent carefully (no retakes!)
- Don't try browser tricks (they're blocked)
- Report tech issues immediately

---

## Future Enhancements

- [ ] SMS alerts: "Candidate X logged in"
- [ ] Camera monitoring: Record proctoring session
- [ ] Fingerprint lock: Tie token to device
- [ ] Disable OS-level take-over (kiosk browser mode)
- [ ] Remote proctor override: Force end exam
- [ ] AI proctoring: Detect cheating behavior
