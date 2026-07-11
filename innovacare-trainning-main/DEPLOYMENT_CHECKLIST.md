# Deployment Checklist - Innovacare Training Platform

Use this checklist before every deployment to production.

---

## 🔍 Pre-Deployment Phase (24 hours before)

### Code Review
- [ ] All PRs approved and merged
- [ ] No merge conflicts
- [ ] No uncommitted changes on main branch
- [ ] Git tags are up-to-date: `git tag`
- [ ] Changelog updated with version info

### Security Audit
- [ ] No hardcoded API keys or secrets
- [ ] Environment variables properly configured
- [ ] Firestore rules reviewed by 2+ team members
- [ ] Authentication guards in place for all routes
- [ ] CORS headers configured correctly
- [ ] Rate limiting enabled on API endpoints
- [ ] No console.log() statements in production code
- [ ] Dependencies up-to-date: `npm audit`

### Performance Check
- [ ] Bundle size < 5MB: `npm run bundle-report`
- [ ] Lighthouse score > 80
- [ ] No unoptimized images
- [ ] Lazy loading configured for routes
- [ ] Tree-shaking enabled in build

### Testing
- [ ] Unit tests passing: `ng test`
- [ ] E2E tests passing: `ng e2e`
- [ ] No failing tests
- [ ] Coverage > 70%
- [ ] Linting passed: `ng lint`

---

## 🛠️ Pre-Deployment Phase (2 hours before)

### Database Backup
- [ ] Firestore backup created
- [ ] Backup tested and verified
- [ ] Backup location documented

### Data Validation
- [ ] Sample test data created
- [ ] Test users set up (admin, learner, proctor)
- [ ] Test exams created with questions
- [ ] Test sessions scheduled

### Environment Setup
- [ ] Production environment file created
- [ ] Firebase project selected: `firebase use innovacare-training`
- [ ] Firestore indexes deployed
- [ ] Storage bucket configured
- [ ] Cloud Functions deployed and tested

---

## 📋 Deployment Phase

### Pre-Build
- [ ] Clean build directory: `rm -rf dist`
- [ ] Install dependencies: `npm install`
- [ ] Install functions dependencies: `npm install --prefix functions`

### Build
- [ ] Production build succeeded: `ng build --configuration production`
- [ ] Build size acceptable
- [ ] No build warnings
- [ ] Build artifacts verified in dist/

### Firebase Deployment
- [ ] Firebase CLI authenticated: `firebase login`
- [ ] Correct project selected: `firebase use innovacare-training`
- [ ] Deployment command reviewed: `firebase deploy`
- [ ] Deployment started
- [ ] Deployment progress monitored
- [ ] No deployment errors
- [ ] All services deployed successfully (hosting, firestore, functions)

---

## ✅ Post-Deployment Phase (Immediate)

### Basic Functionality
- [ ] Application loads at https://innovacare-training.firebaseapp.com
- [ ] No 404 errors
- [ ] No JavaScript errors in console
- [ ] Page title displays correctly
- [ ] Logo/branding visible

### Authentication
- [ ] Email/password login works
- [ ] Google login works
- [ ] New user registration works
- [ ] Password reset works
- [ ] Logout works
- [ ] Auto-logout on token expiry

### Core Features
- [ ] Dashboard loads
- [ ] Course catalog displays
- [ ] Can start a course
- [ ] Can take an exam
- [ ] Exam timer works
- [ ] Can submit exam
- [ ] Results display correctly

### Kiosk Mode
- [ ] `/exam-session-login` accessible
- [ ] Login with password works
- [ ] `/exam-session-consent` displays rules
- [ ] Exam runner launches with `lockedMode=true`
- [ ] Back button blocked
- [ ] Copy/paste blocked
- [ ] New tabs blocked
- [ ] Auto-redirect after exam works

### Admin Features
- [ ] Admin dashboard accessible (role check)
- [ ] Can create exams
- [ ] Can manage users
- [ ] Can view analytics
- [ ] Password generation works
- [ ] Proctor dashboard accessible

---

## 🔍 Post-Deployment Phase (30 minutes after)

### Error Monitoring
- [ ] Check Firebase Console for errors
- [ ] Check Functions logs: `firebase functions:log`
- [ ] No critical errors
- [ ] Error rate < 1%
- [ ] All functions healthy

### Performance Monitoring
- [ ] Page load time acceptable (< 3s)
- [ ] Time to interactive (< 5s)
- [ ] No slow queries
- [ ] Firestore read/write rates normal
- [ ] Storage usage normal

### User Experience
- [ ] Responsive on mobile
- [ ] Responsive on tablet
- [ ] Responsive on desktop
- [ ] Touch interactions work
- [ ] Keyboard navigation works
- [ ] Screen reader compatible (basic check)

### Security Verification
- [ ] SSL certificate valid
- [ ] No mixed content warnings
- [ ] Security headers present (check with curl)
- [ ] CORS working correctly
- [ ] Rate limiting active

```bash
# Check security headers
curl -i https://innovacare-training.firebaseapp.com

# Should see:
# X-Frame-Options: SAMEORIGIN
# X-Content-Type-Options: nosniff
# X-XSS-Protection: 1; mode=block
# Referrer-Policy: strict-origin-when-cross-origin
```

---

## 🔄 Post-Deployment Phase (24 hours after)

### Monitoring
- [ ] Error rate stable
- [ ] No spike in error logs
- [ ] Function duration normal
- [ ] Cold start duration acceptable
- [ ] Database performance normal
- [ ] Hosting bandwidth normal

### User Feedback
- [ ] No critical bug reports
- [ ] No widespread complaints
- [ ] Analytics data flowing
- [ ] User engagement normal

### Rollback Decision
- [ ] No reason to rollback?
- [ ] Feature working as expected?
- [ ] No major incidents?
- [ ] ✅ **DEPLOYMENT SUCCESSFUL**

---

## 🚨 Rollback Procedure

If critical issues found, execute rollback:

### Immediate Actions
```bash
# 1. Identify previous stable version
git tag

# 2. Rollback to previous version
git checkout <previous-tag>

# 3. Rebuild
ng build --configuration production

# 4. Redeploy
firebase deploy --only hosting

# 5. Verify
open https://innovacare-training.firebaseapp.com
```

### Post-Rollback
- [ ] Application loads and is stable
- [ ] No errors in console
- [ ] Users notified of rollback
- [ ] Root cause analysis started
- [ ] Issue ticket created
- [ ] Fix planned

---

## 📊 Deployment Report Template

**Version:** v1.0.0  
**Date:** 2026-07-10  
**Deployer:** Your Name  
**Environment:** Production  

### What Was Deployed
- Feature 1: Description
- Feature 2: Description
- Bug Fix 1: Description

### Deployment Status
- ✅ Build: Successful
- ✅ Tests: All passing
- ✅ Deployment: Successful
- ✅ Verification: Complete

### Issues Encountered
None

### Performance Impact
- Bundle size: 4.2MB (↓ 0.3MB)
- Load time: 2.1s (↓ 0.2s)
- Error rate: < 0.5% (stable)

### Rollback Plan
Tested and ready:
```
git checkout v0.9.9
firebase deploy --only hosting
```

---

## 🔗 Important Links

- 📍 **Live App:** https://innovacare-training.firebaseapp.com
- 🎛️ **Firebase Console:** https://console.firebase.google.com/project/innovacare-training
- 📊 **Analytics:** https://console.firebase.google.com/project/innovacare-training/analytics/overview
- 📋 **Firestore:** https://console.firebase.google.com/project/innovacare-training/firestore
- 🔧 **Functions:** https://console.firebase.google.com/project/innovacare-training/functions
- 📈 **Monitoring:** https://console.firebase.google.com/project/innovacare-training/performance
- 🐛 **Issues:** https://github.com/innovacare/trainning/issues

---

## 👥 Sign-Off

**Deployed By:** ___________________  
**Verified By:** ___________________  
**Date:** ___________________  
**Time:** ___________________  

**Status:** 
- [ ] ✅ **APPROVED FOR PRODUCTION**
- [ ] ❌ **ROLLBACK REQUIRED**
- [ ] ⏸️ **DEPLOYMENT PAUSED**

**Notes:**
_________________________________________________________________________

_________________________________________________________________________

_________________________________________________________________________
