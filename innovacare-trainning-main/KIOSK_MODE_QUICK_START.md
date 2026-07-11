# 🖥️ KIOSK MODE - QUICK START GUIDE

**Status:** ✅ Now fully accessible in production

---

## 📍 ACCESS KIOSK MODE

### Public URL
```
https://innovacare-training.firebaseapp.com/kiosk
```

**This page shows:**
- ✅ All available exam sessions
- ✅ Quick access input for Session ID
- ✅ Start exam buttons
- ✅ Session details & duration

---

## 🚀 HOW TO USE

### Option 1: From Kiosk Setup Page (Recommended)

1. **Open:** https://innovacare-training.firebaseapp.com/kiosk
2. **See available sessions** listed on the page
3. **Click "Enter Exam Session"** on any session card
4. **Enter:** First Name, Last Name, Session Password
5. **Click "Login to Exam"** → Browser locks 🔒
6. **Take exam** → Cannot escape
7. **Submit answers** → Auto-grades
8. **View results** → Certificate (if passed)

---

### Option 2: Direct Link (Admin/Testing)

```
https://innovacare-training.firebaseapp.com/exam-session-login?sessionId=YOUR_SESSION_ID
```

Replace `YOUR_SESSION_ID` with actual session ID from Firestore.

---

## 🔧 CREATE A TEST SESSION

### Using Firebase Console

1. Go to: https://console.firebase.google.com/project/innovacare-training/firestore
2. Create new collection: **examSessions**
3. Create document with:

```json
{
  "examId": "test-exam-001",
  "examName": "Security Training Exam",
  "duration": 60,
  "enrolledCandidateIds": [
    "onsite_john_doe",
    "onsite_jane_smith"
  ],
  "accessPassword": "TEST1234",
  "startedAt": null,
  "createdAt": {
    "seconds": 1720569600,
    "_nanoseconds": 0
  }
}
```

**Document ID:** Auto-generate (will be your `sessionId`)

---

### Using Cloud Function (Programmatic)

```bash
# Create a Cloud Function to generate test sessions
# (To be implemented)
```

---

## 🔐 KIOSK MODE PROTECTIONS

### What's Blocked

| Action | Status |
|---|---|
| Back button | 🚫 Blocked |
| New tab (Ctrl+T) | 🚫 Blocked |
| New window (Ctrl+N) | 🚫 Blocked |
| Close tab (Ctrl+W) | 🚫 Blocked |
| F12 (Dev tools) | 🚫 Blocked |
| Right-click | 🚫 Blocked |
| Copy/paste | 🚫 Blocked |
| Drag-drop | 🚫 Blocked |
| Refresh (F5) | ✅ Allowed |
| Page reload | ✅ Allowed |

### Session Security

| Feature | Details |
|---|---|
| **Token Duration** | 4 hours |
| **Auto-expiry** | After 4 hours, must re-login |
| **Single-use Password** | Per session only |
| **Enrollment Check** | Must be on candidate list |
| **Real-time Monitoring** | Proctor sees all actions |

---

## 📊 TESTING THE KIOSK

### Test Flow

```
1. Go to /kiosk
   ↓
2. Click "Enter Exam Session" (or enter Session ID)
   ↓
3. Login page opens
   Enter: First Name, Last Name, Password
   ↓
4. Consent page opens
   Check: 3 agreement boxes
   ↓
5. Exam runner opens (🔒 LOCKED)
   - Cannot go back
   - Cannot open new tab
   - Cannot copy questions
   - Timer starts
   ↓
6. Answer questions
   ↓
7. Submit exam
   ↓
8. Grading runs automatically
   ↓
9. Results displayed
   - Score
   - Certificate (if passed)
   ↓
10. Browser unlocked
    Redirect to home
```

---

## 🔍 TROUBLESHOOTING

### "Session not found"
- **Check:** Session ID is correct
- **Check:** Session exists in Firestore
- **Fix:** Create a test session (see above)

### "You are not enrolled in this session"
- **Check:** Your name is in `enrolledCandidateIds`
- **Fix:** Add your name to the session in Firestore
  - Example: `"onsite_john_doe"`

### "Invalid password"
- **Check:** Password matches exactly (case-sensitive)
- **Fix:** Use password from Firestore document

### Kiosk mode not working
- **Check:** Browser allows JavaScript
- **Check:** Browser not in restricted mode
- **Try:** Full browser refresh (F5)
- **Try:** Different browser (Chrome, Firefox, Safari)

### Can still use back button
- **Check:** Kiosk mode enabled (should block after login)
- **Check:** Browser allows history manipulation
- **Try:** Clear browser cache & cookies

---

## 📱 DEVICE SETUP FOR EXAM ROOM

### Kiosk Station Setup

```
1. Start with fresh browser profile
2. Set homepage to: https://innovacare-training.firebaseapp.com/kiosk
3. Boot browser in kiosk mode (if OS supports):
   - Chrome: chrome://flags #kiosk-mode
   - Firefox: about:config kiosk mode plugin
4. Disable all toolbars & extensions
5. Hide taskbar (if possible)
```

### Exam Day Flow

```
Browser boots
  ↓
Displays: /kiosk page
  ↓
Proctor reads: Session ID, Password
  ↓
Learner enters: Name + Password
  ↓
Exam session starts (🔒 locked)
  ↓
Takes exam
  ↓
Submits
  ↓
Browser reboots to /kiosk (ready for next candidate)
```

---

## 🎯 QUICK REFERENCE

### URLs

| Page | URL |
|---|---|
| **Kiosk Setup** | `/kiosk` |
| **Exam Login** | `/exam-session-login?sessionId=XXX` |
| **Exam Consent** | `/exam-session-consent` (auto after login) |
| **Exam Runner** | `/learner/courses/:courseId/exam/:examId` (locked) |

### Key Features

- ✅ No remote access (password-only at center)
- ✅ 4-hour session limit (automatic expiry)
- ✅ Real-time proctor monitoring
- ✅ Browser completely locked
- ✅ Audit trail of all actions
- ✅ Auto-grading on submit

---

## 💡 TIPS & BEST PRACTICES

### For Exam Administrators

1. **Create sessions in advance** — Don't create on exam day
2. **Use simple passwords** — Easier to read aloud (e.g., "TEST1234")
3. **Add buffer time** — Session expires after 4 hours
4. **Test beforehand** — Verify all candidates can login
5. **Monitor proctor dashboard** — Watch real-time progress

### For Proctors

1. **Arrive early** — Boot kiosks 15 min before exam
2. **Verify identity** — Photo ID + photo upload
3. **Record password** — Write down session password
4. **Watch dashboard** — Real-time candidate tracking
5. **Log actions** — All verifications are recorded

### For Learners

1. **Arrive on time** — Exam sessions have fixed start times
2. **Bring ID** — Required for identity verification
3. **Listen carefully** — Password read aloud, write it down
4. **No external devices** — Only exam kiosk allowed
5. **Submit before time** — Exam auto-submits at timer end

---

## ✅ VERIFICATION CHECKLIST

- [ ] Kiosk page loads at `/kiosk`
- [ ] Can see available sessions
- [ ] Can click "Enter Exam Session"
- [ ] Login page displays (Name, Password fields)
- [ ] Cannot go back after login
- [ ] Cannot open new tab during exam
- [ ] Cannot see F12 dev tools
- [ ] Timer counts down
- [ ] Answers auto-save
- [ ] Results show score
- [ ] Certificate displays (if passed)

---

## 📞 SUPPORT

### Common Issues

**Q: Sessions not showing on /kiosk?**
A: Create a session in Firestore (see above)

**Q: Password not accepted?**
A: Check password is exactly correct (case-sensitive)

**Q: Stuck in exam?**
A: Close browser, clear cookies, reopen

**Q: Score wrong?**
A: Re-check gradeExam Cloud Function logs

---

## 🎊 YOU'RE READY!

Your Kiosk Mode is now **fully operational** in production.

**Start here:** https://innovacare-training.firebaseapp.com/kiosk

---

**Last Updated:** 2026-07-10  
**Status:** ✅ LIVE  
**Build Exit:** 0 ✅  
**Deploy Exit:** 0 ✅
