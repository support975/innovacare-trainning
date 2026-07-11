# Quick Start: Deploy Innovacare Platform to Production

⏱️ **Time:** ~30 minutes | 🎯 **Difficulty:** Easy | ✨ **Status:** Production-Ready

---

## 🚀 TL;DR (Copy & Paste)

```bash
# 1. Setup (first time only)
npm install
npm install --prefix functions
firebase login
firebase use innovacare-training

# 2. Build
ng build --configuration production

# 3. Deploy
firebase deploy --only hosting,firestore,functions

# 4. Verify
open https://innovacare-training.firebaseapp.com
```

---

## 📋 Prerequisites

Before deploying, you need:

- ✅ Node.js v18+
- ✅ npm v9+
- ✅ Angular CLI installed: `npm install -g @angular/cli`
- ✅ Firebase CLI installed: `npm install -g firebase-tools`
- ✅ Firebase project created at https://console.firebase.google.com
- ✅ Services enabled: Auth, Firestore, Functions, Hosting, Storage
- ✅ Git repository cloned

**Check prerequisites:**
```bash
node --version       # Should be v18+
npm --version        # Should be v9+
ng version           # Should work
firebase --version   # Should show version
```

---

## 🔑 Step 1: Setup (First Time Only)

### 1.1 Authenticate with Firebase

```bash
firebase login
# Opens browser → Sign in with Google
# Grant permissions → Close browser
```

### 1.2 Select Firebase Project

```bash
firebase use innovacare-training
# Or list projects:
firebase projects:list
```

### 1.3 Install Dependencies

```bash
# Install main app dependencies
npm install

# Install Cloud Functions dependencies
cd functions
npm install
cd ..
```

✅ **Done!** (You only need to do this once)

---

## 🔧 Step 2: Configure Environment

### 2.1 Environment File

Create `src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  firebase: {
    apiKey: "AIzaSy_YOUR_API_KEY",
    authDomain: "innovacare-training.firebaseapp.com",
    projectId: "innovacare-training",
    storageBucket: "innovacare-training.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "1:YOUR_APP_ID:web:YOUR_WEB_APP_ID"
  },
  kiosk: {
    enableLocks: true,
    tokenExpiryHours: 4,
    maxConcurrentExams: 50
  }
};
```

Get these values from Firebase Console:
1. Go to https://console.firebase.google.com
2. Select project: `innovacare-training`
3. Click "Settings" (gear icon) → "Project settings"
4. Copy the config from "Your apps" section

### 2.2 Verify Configuration

```bash
# Test Firebase connection
firebase projects:list

# Should show:
# ✓ innovacare-training
```

✅ **Configuration complete!**

---

## 🏗️ Step 3: Build

### 3.1 Clean Previous Builds

```bash
rm -rf dist/
```

### 3.2 Build for Production

```bash
ng build --configuration production
```

**Expected output:**
```
✔ Compilation successful
✔ Index html generation successful
✔ Copying assets complete
✔ Build at: dist/innovacare-training
```

**Check build size:**
```bash
du -sh dist/innovacare-training/
# Should be < 5MB
```

✅ **Build successful!**

---

## 🚀 Step 4: Deploy

### 4.1 Review Deployment

```bash
firebase deploy --only hosting --dry-run
```

This shows what will be deployed **without actually deploying**.

### 4.2 Deploy

```bash
firebase deploy --only hosting,firestore,functions
```

**Deployment stages:**
```
✔ Deploy complete!
✔ Hosted URL: https://innovacare-training.firebaseapp.com
✔ Firestore rules deployed
✔ Functions deployed
```

### 4.3 Monitor Deployment

```bash
# Watch function logs
firebase functions:log --limit 20

# Check hosting status
firebase hosting:channel:list
```

✅ **Deployment complete!**

---

## ✅ Step 5: Verify

### 5.1 Check Application

Open in browser:
```
https://innovacare-training.firebaseapp.com
```

**Verify:**
- [ ] Page loads (no 404)
- [ ] No console errors (F12 → Console)
- [ ] Logo displays
- [ ] Login works

### 5.2 Test Login Flow

```
1. Click "Login"
2. Email: test@example.com
3. Password: TestPassword123!
4. Should see dashboard
```

### 5.3 Test Kiosk Mode

```
1. Navigate to: /exam-session-login?sessionId=test-session-123
2. Enter: Name + Password
3. Should redirect to consent page
4. Click "Start Exam"
5. Verify: Back button doesn't work
```

✅ **Application verified!**

---

## 🔄 Useful Commands

### Monitor Logs
```bash
# View function logs
firebase functions:log

# Follow logs (real-time)
firebase functions:log --follow

# Filter by function
firebase functions:log gradeExam
```

### Manage Deployment
```bash
# View deployment history
firebase hosting:channel:list

# Rollback to previous version
firebase hosting:channel:deploy main

# Delete channel
firebase hosting:channel:delete my-feature-branch
```

### Database Operations
```bash
# Export Firestore data
firebase firestore:bulk-export gs://your-bucket/export-date

# Create backup
gcloud firestore backups create --async --retention=7d
```

---

## 🆘 Troubleshooting

### "Cannot find module"
```bash
npm install
npm install --prefix functions
```

### "Firebase project not found"
```bash
firebase use innovacare-training
# If not listed, run: firebase projects:list
```

### "Build failed"
```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm install
ng build --configuration production
```

### "Deployment timeout"
```bash
# Increase timeout (if deployed with large files)
firebase deploy --only hosting --timeout 600s
```

### "Permission denied"
```bash
# Check Firestore rules
firebase firestore:indexes

# Verify user role in database
# In Firebase Console → Firestore → Collections → users → [your-uid]
```

### "Cannot access application"
```bash
# Wait 5-10 minutes for CDN propagation
# Then clear browser cache (Ctrl+Shift+Delete)
# Try in incognito window
```

---

## 📊 Performance Check (Optional)

### Run Lighthouse

```bash
# Install if not already installed
npm install -g lighthouse

# Run audit
lighthouse https://innovacare-training.firebaseapp.com --view

# Expected scores:
# Performance: > 80
# Accessibility: > 90
# Best Practices: > 85
```

### Check Bundle Size

```bash
npm run bundle-report
# Opens visualization of bundle contents
```

---

## 🔐 Security Check

### Verify Security Headers

```bash
curl -i https://innovacare-training.firebaseapp.com | grep -i "X-"

# Should see:
# X-Frame-Options: SAMEORIGIN
# X-Content-Type-Options: nosniff
# X-XSS-Protection: 1; mode=block
```

### Check SSL Certificate

```bash
# Verify HTTPS
openssl s_client -connect innovacare-training.firebaseapp.com:443

# Should show valid certificate
```

---

## 🎉 Success Checklist

- [ ] Build completes without errors
- [ ] Deployment shows "Deploy complete!"
- [ ] Application loads at https://innovacare-training.firebaseapp.com
- [ ] No console errors
- [ ] Login works
- [ ] Exams load
- [ ] Kiosk mode blocks back button
- [ ] Firestore functions working
- [ ] No critical errors in logs

**✅ You're LIVE!**

---

## 📞 Need Help?

| Issue | Command |
|---|---|
| View logs | `firebase functions:log` |
| Rollback | `git checkout <tag> && ng build && firebase deploy` |
| Check status | `firebase projects:list` |
| Verify rules | `firebase firestore:indexes` |
| Force redeploy | `firebase deploy --only hosting --force` |

---

## ⏭️ Next Steps

After successful deployment:

1. **Monitor:** Check Firebase Console → Monitoring
2. **Backup:** Create Firestore backup
3. **Notify:** Tell team deployment is live
4. **Document:** Update deployment log
5. **Promote:** Merge to main branch with release tag

```bash
# Tag release
git tag v1.0.0
git push origin main v1.0.0

# View releases
git tag --list
```

---

## 📚 Full Documentation

For detailed information, see:
- [BUILD_DEPLOYMENT_GUIDE.md](BUILD_DEPLOYMENT_GUIDE.md) — Complete guide
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) — Pre-deployment checklist
- [KIOSK_MODE_EXAM_ROOM_GUIDE.md](KIOSK_MODE_EXAM_ROOM_GUIDE.md) — Kiosk setup
- [ONSITE_EXAM_SECURITY_GUIDE.md](ONSITE_EXAM_SECURITY_GUIDE.md) — Security details

---

**🎯 You're ready to deploy!** Run the TL;DR commands above to get live in 30 minutes. 🚀
