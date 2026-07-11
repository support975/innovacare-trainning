# 🏢 ADMIN GUIDE - KIOSK MODE & PROCTOR SETUP

**For:** Organization Managers & Admins  
**Purpose:** Create exam centers, sessions, and manage proctor monitoring  
**Status:** ✅ Ready to use

---

## 🎯 QUICK NAVIGATION

| Feature | URL | Purpose |
|---|---|---|
| **Exam Sessions Admin** | `/manager/exam-sessions` | Create centers & sessions |
| **Proctor Dashboard** | `/proctor/monitor/:sessionId` | Monitor live exams |
| **Kiosk Setup Page** | `/kiosk` | Learners access exams here |
| **Manager Dashboard** | `/manager/dashboard` | Main admin hub |

---

## 📍 WHERE TO START

### 1️⃣ Login to Admin
```
https://innovacare-training.firebaseapp.com/login
```

**Account Type:** Manager or Admin role  
**Access:** `/manager/dashboard`

---

### 2️⃣ Go to Exam Sessions Admin
```
/manager/exam-sessions
```

**OR manually:**
1. Login → Manager Dashboard
2. Look for menu → "Exam Sessions" (if visible in sidebar)
3. OR directly type: `/manager/exam-sessions`

**What you'll see:**
- Two tabs: "Exam Centers" | "Sessions"
- Create new centers
- Create new exam sessions
- Generate passwords
- View all sessions

---

## 🏪 STEP 1: CREATE EXAM CENTER

### Why?
A center is a **physical location** where learners take exams (clinic, office, training room).

### How to Create:

1. **Go to:** `/manager/exam-sessions`
2. **Select tab:** "Exam Centers"
3. **Fill in form:**
   ```
   Center Name:     "Acme Healthcare Clinic"
   Address:         "123 Main St"
   City:            "New York"
   State:           "NY"
   Country:         "USA" (default)
   Timezone:        "America/New_York"
   Organization ID: [Your org ID]
   ```
4. **Click:** "Create Center"
5. **Result:** ✓ Center created

### Example Centers
```
✓ Main Campus - New York, NY
✓ Remote Health - Los Angeles, CA
✓ Training Center - Chicago, IL
```

---

## 📅 STEP 2: CREATE EXAM SESSION

### Why?
A session is a **specific exam event** at a center (e.g., "Security Training - Friday 9am").

### How to Create:

1. **Go to:** `/manager/exam-sessions`
2. **Select tab:** "Sessions"
3. **Fill in form:**
   ```
   Exam Name:              "Security Compliance 2024"
   Exam/Course ID:         "SEC-101"
   Exam Center:            "Main Campus - New York, NY"
   Session Date:           "2026-07-15"
   Start Time:             "09:00"
   End Time:               "17:00"
   Duration (minutes):     120
   Require ID Verification: ✓ (checked)
   Status:                 "scheduled"
   ```

4. **Add Candidates:**
   - Enter names of learners: `John Doe`, `Jane Smith`, etc.
   - Each name creates: `onsite_john_doe`, `onsite_jane_smith`
   - Click "Add Candidate" for each
   - Or bulk import (CSV)

5. **Click:** "Create Session"

6. **Result:**
   ```
   ✓ Session created
   ✓ Session ID: session-abc123xyz
   ✓ Session Password: EXAM1234
   ```

### Session Info Screen Shows:
- Session ID (give to proctor)
- Password (give to proctor verbally to learners)
- List of enrolled candidates
- Session date/time
- Duration & status

---

## 🔐 STEP 3: GENERATE SESSION PASSWORD

### Passwords are used for:
- Learners to login to exam
- Only given **verbally at exam center**
- Cannot be used remotely
- Expires after 4 hours

### How:

1. **On session details,** click: "Generate Password"
2. **System creates:** Random 8-character password (e.g., `TEST1234`)
3. **Proctor will:**
   - Read password aloud to each learner
   - Learner enters it in kiosk login page
   - Learner takes exam in locked browser

---

## 👁️ STEP 4: PROCTOR MONITORING SETUP

### What is Proctor Dashboard?
Real-time view of all candidates taking exams:
- Live status (waiting, consent-read, in-exam, submitted, results)
- Identity verification verification status
- Auto-grading progress
- Audit log of all actions

### How to Access:

1. **During exam session:**
   ```
   /proctor/monitor/:sessionId
   ```

2. **URL example:**
   ```
   /proctor/monitor/session-abc123xyz
   ```

3. **Or from admin:**
   - Session details page
   - Click: "View Proctor Dashboard"

### Proctor Dashboard Shows:
```
📊 Stats
├─ Total Candidates: 10
├─ Currently Testing: 7
├─ Waiting to Start: 2
└─ Completed: 1

👥 Candidate List
├─ John Doe        [in-exam 🟢]    45% progress
├─ Jane Smith      [submitted 🟡]  100% waiting for grade
├─ Bob Wilson      [waiting ⚪]     --
└─ ... more

🔍 Actions
├─ Verify Identity (photo upload)
├─ View Audit Log
└─ See details for each candidate
```

---

## 🎪 COMPLETE WORKFLOW FOR EXAM DAY

### Timeline

```
📅 DAY BEFORE
├─ Admin creates Exam Center (if needed)
├─ Admin creates Exam Session
├─ Admin enrolls candidates
└─ Admin generates password

🌅 EXAM DAY - MORNING
├─ Proctor arrives early
├─ Logs into /manager/dashboard
├─ Clicks "Exam Sessions"
├─ Selects the exam session
├─ Gets session ID & password
└─ Writes them down

🕘 EXAM ROOM - SETUP (30 min before)
├─ Turn on 10 kiosk computers
├─ Boot browser to: /kiosk
└─ Browsers ready on login screen

🕙 EXAM TIME - START
├─ Learners arrive & sit at kiosks
├─ Proctor reads: "Session ID and Password"
├─ Learner enters name + password
├─ Learner reads consent (3 checkboxes)
├─ Exam starts (browser locked 🔒)
├─ Proctor monitors: /proctor/monitor/:sessionId
└─ Can see all candidates in real-time

⏱️ DURING EXAM
├─ Proctor watches live dashboard
├─ Can see progress bars
├─ Can verify identities (photo upload)
├─ Can see any violations/issues
└─ All actions logged automatically

✅ EXAM END
├─ Time expires → Auto-submit
├─ OR learner clicks "Submit"
├─ gradeExam() runs automatically
├─ Results show on learner screen
├─ Certificate generated (if pass)
├─ Browser unlocked
└─ Ready for next candidate

📊 AFTER EXAM
├─ Proctor reviews audit log
├─ Admin exports results
├─ Certificates emailed to learners
└─ Data saved for compliance
```

---

## 🚀 ACCESSING SPECIFIC AREAS

### Manager Dashboard
```
/manager/dashboard

Shows:
- Overview stats
- Quick links to exams, learners, etc.
- Recent activity
```

### Exam Sessions Management
```
/manager/exam-sessions

Two Tabs:
1. "Exam Centers"
   - Create centers
   - View all centers
   - Edit center details

2. "Sessions"
   - Create new sessions
   - View all sessions
   - Manage candidates
   - Generate passwords
   - View proctor dashboard link
```

### Proctor Dashboard (LIVE MONITORING)
```
/proctor/monitor/:sessionId

Shows:
- 4 stats boxes (total, in-exam, completed, waiting)
- Candidate grid with cards
- Status badges with colors
- Progress bars
- Action buttons (verify identity, etc.)
- Real-time updates every 2 seconds
```

### Kiosk Setup Page (for Learners)
```
/kiosk

Shows:
- List of available sessions
- Quick entry form for Session ID
- "Enter Exam Session" buttons
- Info about kiosk security
```

---

## 📋 REQUIRED INFORMATION

### To Create an Exam Session, You Need:

| Item | Example | Where to Get |
|---|---|---|
| **Organization ID** | `org-abc123` | Firebase Console or profile |
| **Exam Center** | "Main Campus" | Create first if needed |
| **Exam/Course ID** | "SEC-101" | From course catalog |
| **Session Date** | "2026-07-15" | Pick a date |
| **Duration (minutes)** | 120 | Length of exam |
| **Candidate Names** | John Doe, Jane Smith | From learner roster |

---

## ✅ CHECKLIST BEFORE EXAM

- [ ] **Center created** — Physical location registered
- [ ] **Session created** — Event scheduled with date/time
- [ ] **Candidates enrolled** — All learners added to session
- [ ] **Password generated** — For proctor to read to learners
- [ ] **Proctor briefed** — Knows how to:
  - [ ] Read session ID & password
  - [ ] Access proctor dashboard
  - [ ] Verify identities
  - [ ] Monitor real-time
- [ ] **Kiosk stations ready** — Browsers on `/kiosk` page
- [ ] **Technical check** — Test login with one learner

---

## 🎯 PROCTOR RESPONSIBILITIES

### Before Exam
- [ ] Know session ID & password
- [ ] Verify browser kiosk stations are working
- [ ] Test one learner login if possible
- [ ] Have learner roster ready
- [ ] Verify learner identities (ID check)

### During Exam
- [ ] Monitor proctor dashboard live
- [ ] Watch for any issues
- [ ] Verify identities (upload photo)
- [ ] Log any violations
- [ ] Note unusual behavior

### After Exam
- [ ] Confirm all submitted
- [ ] Check grades are calculated
- [ ] Verify certificates generated
- [ ] Review audit log
- [ ] Document any incidents

---

## 🔒 KIOSK MODE PROTECTIONS (for Reference)

What's **blocked** during exam:
```
🚫 No back button
🚫 No new tabs (Ctrl+T)
🚫 No new window (Ctrl+N)
🚫 No close tab (Ctrl+W)
🚫 No F12 dev tools
🚫 No right-click menu
🚫 No copy/paste
🚫 No drag-drop
```

What **works**:
```
✅ Refresh (F5) — reload page safely
✅ Typing answers
✅ Reading content
✅ Timer countdown
✅ Auto-save
```

---

## 📱 TESTING THE SYSTEM

### Quick Test (5 minutes)

1. **Create test center:**
   - Name: "Test Lab"
   - City: Your city
   - Org ID: Your org

2. **Create test session:**
   - Duration: 30 min
   - Add 2 candidates: "Test One", "Test Two"
   - Generate password

3. **Test learner login:**
   - Go to: `/kiosk`
   - Click your session
   - Login with: "Test", "One", password
   - Should go to consent page

4. **Test proctor dashboard:**
   - Get session ID
   - Go to: `/proctor/monitor/:sessionId`
   - Should see "Test One" with status "waiting"

5. **Verify:**
   - ✓ Session created
   - ✓ Learner can login
   - ✓ Proctor can see real-time

---

## 🆘 TROUBLESHOOTING

### "Session not found" in /kiosk
- Check session ID is correct (from admin page)
- Verify session exists in Firebase (check Firestore)

### "You are not enrolled"
- Add candidate name to session
- Spelling must match (case-sensitive)
- Format: FirstName + LastName

### "Invalid password"
- Password is case-sensitive
- Match exact password from admin page
- Generate new if forgotten

### Proctor can't see candidates
- Verify session ID in dashboard URL is correct
- Check candidates are enrolled in session
- Try refreshing page

### Candidates say browser is not locked
- Kiosk mode activates AFTER login, not before
- Must be on `/exam-runner` page to see locks
- Check browser console for errors (F12)

---

## 💡 BEST PRACTICES

### For Admins
1. **Create sessions in advance** — Don't create on exam day
2. **Use simple passwords** — Easier to read aloud (e.g., "TEST1234")
3. **Add buffer time** — Sessions have 4-hour token limit
4. **Test first** — Always test with one learner before full session
5. **Document it** — Keep notes on who's taking what exam

### For Proctors
1. **Arrive 30 minutes early** — Boot systems, test login
2. **Verify identity** — Photo ID + photo upload to system
3. **Read password clearly** — Test One, Test Two, "Password is TEST-1-2-3-4"
4. **Monitor live** — Watch proctor dashboard during exam
5. **Log everything** — All actions are automatically recorded

### For IT/Technical
1. **Browser setup** — Set homepage to `/kiosk`
2. **Kiosk mode** — Can enable in browser settings
3. **Network** — Need stable internet (exams auto-save)
4. **Backup** — Have manual verification process if tech fails

---

## 📞 QUICK LINKS

| Purpose | Link |
|---|---|
| **Manager Dashboard** | `/manager/dashboard` |
| **Exam Sessions Admin** | `/manager/exam-sessions` |
| **Proctor Monitoring** | `/proctor/monitor/:sessionId` |
| **Kiosk Setup** | `/kiosk` |
| **Firebase Console** | https://console.firebase.google.com |
| **Firestore Data** | Check `examSessions` & `examCenters` collections |

---

## ✨ YOU'RE READY!

Your admin panel is now set up to:
1. ✅ Create exam centers
2. ✅ Create sessions
3. ✅ Enroll candidates
4. ✅ Generate passwords
5. ✅ Monitor exams live
6. ✅ Verify identities
7. ✅ Auto-grade results
8. ✅ Issue certificates

**Start here:** https://innovacare-training.firebaseapp.com/manager/exam-sessions

---

**Last Updated:** 2026-07-10  
**Status:** ✅ Ready to Use  
**Build:** Exit Code 0
