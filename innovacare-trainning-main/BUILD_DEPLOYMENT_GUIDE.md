# Build & Deployment Guide - Innovacare Training Platform

## Overview

This guide covers:
1. ✅ Local build & testing
2. ✅ Firebase configuration
3. ✅ Security rules (Firestore + Auth)
4. ✅ Environment setup
5. ✅ Deployment process
6. ✅ Post-deployment verification

---

## 1️⃣ Prerequisites

### Required Tools
```bash
# Node.js & npm (required)
node --version   # v18+ recommended
npm --version    # v9+

# Angular CLI
npm install -g @angular/cli@latest

# Firebase CLI
npm install -g firebase-tools@latest
firebase --version

# Git
git --version
```

### Firebase Project
- Create Firebase project: https://console.firebase.google.com
- Enable services:
  - ✅ Authentication (Email + Google)
  - ✅ Firestore Database
  - ✅ Cloud Storage (for photos)
  - ✅ Cloud Functions (for grading, TTS)
  - ✅ Hosting
  - ✅ Cloud Tasks (optional, for scheduling)

---

## 2️⃣ Local Setup & Build

### Clone & Install
```bash
cd ~/innovacare-trainning-main
npm install
cd functions && npm install && cd ..
```

### Environment Configuration

Create `src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: "AIzaSy...",
    authDomain: "innovacare-training.firebaseapp.com",
    projectId: "innovacare-training",
    storageBucket: "innovacare-training.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123def456"
  },
  kiosk: {
    enableLocks: true,        // Enable browser locks in kiosk mode
    tokenExpiryHours: 4,      // Session token expiry
    maxConcurrentExams: 50    // Max exams per session
  }
};
```

Create `src/environments/environment.prod.ts`:
```typescript
export const environment = {
  production: true,
  firebase: {
    apiKey: "AIzaSy...",
    authDomain: "innovacare-training.firebaseapp.com",
    projectId: "innovacare-training",
    storageBucket: "innovacare-training.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123def456"
  },
  kiosk: {
    enableLocks: true,
    tokenExpiryHours: 4,
    maxConcurrentExams: 50
  }
};
```

### Local Development

```bash
# Serve locally
ng serve
# Open http://localhost:4200

# Run tests
ng test

# Build for testing
ng build

# Linting
ng lint
```

---

## 3️⃣ Firestore Security Rules

Create `.firestore.rules`:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isAuth() {
      return request.auth != null;
    }
    
    function hasRole(role) {
      return isAuth() && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == role;
    }
    
    function hasAnyRole(roles) {
      return isAuth() && 
        request.auth.token.role in roles;
    }
    
    function isOwnDoc(field) {
      return isAuth() && request.auth.uid == resource.data[field];
    }
    
    function isOrgMember() {
      return isAuth() && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.orgId == resource.data.orgId;
    }

    // Public course catalog
    match /courses/{courseId} {
      allow read: if isAuth();
      allow write: if hasAnyRole(['admin', 'manager', 'super_admin']);
      
      match /exams/{examId} {
        allow read: if isAuth();
        allow write: if hasAnyRole(['admin', 'manager', 'super_admin']);
        
        match /questions/{questionId} {
          allow read: if isAuth();
          allow write: if hasAnyRole(['admin', 'manager', 'super_admin']);
        }
      }
    }

    // User profiles
    match /users/{userId} {
      allow read: if isAuth() && (request.auth.uid == userId || hasAnyRole(['admin', 'super_admin']));
      allow create: if request.auth.uid == userId;
      allow update: if request.auth.uid == userId || hasAnyRole(['admin', 'super_admin']);
      
      match /enrollments/{courseId} {
        allow read: if request.auth.uid == userId || isOrgMember();
        allow write: if request.auth.uid == userId;
      }
      
      match /examSubmissions/{submissionId} {
        allow read: if request.auth.uid == userId;
        allow create: if request.auth.uid == userId;
        allow update: if hasAnyRole(['super_admin', 'admin']);
      }
    }

    // Exam Sessions (Kiosk Mode)
    match /examSessions/{sessionId} {
      allow read: if isAuth();
      allow create: if hasAnyRole(['admin', 'manager', 'super_admin']);
      allow update: if hasAnyRole(['admin', 'manager', 'super_admin']);
      allow delete: if hasAnyRole(['super_admin']);
    }

    // Proctor Verifications
    match /proctorVerifications/{verifyId} {
      allow read: if isAuth() && (
        hasAnyRole(['proctor', 'admin', 'manager', 'super_admin']) ||
        resource.data.candidateUid == request.auth.uid
      );
      allow create: if hasAnyRole(['proctor', 'admin', 'manager', 'super_admin']);
      allow update: if hasAnyRole(['proctor', 'admin', 'manager', 'super_admin']);
    }

    // Proctor Audit Logs
    match /proctorAuditLogs/{logId} {
      allow read: if hasAnyRole(['proctor', 'admin', 'manager', 'super_admin']);
      allow create: if hasAnyRole(['proctor', 'admin', 'manager', 'super_admin']);
    }

    // Exam Centers
    match /examCenters/{centerId} {
      allow read: if isAuth();
      allow write: if hasAnyRole(['admin', 'manager', 'super_admin']);
    }

    // Organizations
    match /organizations/{orgId} {
      allow read: if isAuth() && isOrgMember();
      allow write: if hasAnyRole(['admin', 'super_admin']);
    }

    // Candidate Applications (Certification)
    match /candidateApplications/{appId} {
      allow read: if isAuth() && (
        resource.data.candidateUserId == request.auth.uid ||
        hasAnyRole(['admin', 'manager', 'super_admin'])
      );
      allow create: if isAuth();
      allow update: if hasAnyRole(['admin', 'manager', 'super_admin']);
    }

    // Certificates
    match /certificates/{certId} {
      allow read: if isAuth() && (
        resource.data.uid == request.auth.uid ||
        hasAnyRole(['admin', 'super_admin'])
      );
      allow write: if hasAnyRole(['admin', 'super_admin']);
    }

    // Rewards & Wallet
    match /rewardWallets/{userId} {
      allow read: if request.auth.uid == userId || hasAnyRole(['admin', 'super_admin']);
      allow write: if hasAnyRole(['admin', 'super_admin']);
    }

    // Deny all by default
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 4️⃣ Firestore Indexes

The following composite indexes are required. Deploy via Firebase Console or CLI:

```bash
firebase firestore:indexes
```

Required indexes:
```
Collection: examSessions
  - sessionDate (Descending)
  - centerId (Ascending)
  - status (Ascending)

Collection: proctorVerifications
  - sessionId (Ascending)
  - candidateUid (Ascending)
  - verifiedAt (Descending)

Collection: examSubmissions
  - uid (Ascending)
  - createdAt (Descending)

Collection: enrollments
  - uid (Ascending)
  - status (Ascending)
```

---

## 5️⃣ Cloud Functions Deployment

### Functions to Deploy

**functions/src/index.ts** should include:

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// Grade Exam Function
export const gradeExam = functions.firestore
  .document('users/{uid}/examSubmissions/{submissionId}')
  .onCreate(async (snap, context) => {
    const submission = snap.data();
    // Grade logic here
    // Update submission with result
  });

// Generate Certificate Function
export const generateCertificate = functions.https.onCall(async (data, context) => {
  // Certificate generation logic
});

// TTS (Text-to-Speech) Function
export const textToSpeech = functions.https.onCall(async (data, context) => {
  // TTS logic for accessibility
});
```

### Deploy Functions

```bash
cd functions
npm run build
firebase deploy --only functions

# Monitor logs
firebase functions:log
```

---

## 6️⃣ Angular Build

### Production Build

```bash
# Full optimized build
ng build --configuration production

# Output: dist/innovacare-training/
# - index.html
# - runtime.*.js
# - main.*.js
# - styles.*.css
# - assets/

# Check bundle size
npm run bundle-report
```

### Build Optimization

Update `angular.json`:
```json
{
  "production": {
    "optimization": true,
    "outputHashing": "all",
    "sourceMap": false,
    "namedChunks": false,
    "aot": true,
    "extractLicenses": true,
    "vendorChunk": false,
    "budgets": [
      {
        "type": "initial",
        "maximumWarning": "2mb",
        "maximumError": "5mb"
      },
      {
        "type": "anyComponentStyle",
        "maximumWarning": "6kb",
        "maximumError": "10kb"
      }
    ]
  }
}
```

---

## 7️⃣ Firebase Hosting Configuration

Create/Update `firebase.json`:

```json
{
  "hosting": {
    "public": "dist/innovacare-training",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=1year, immutable"
          }
        ]
      },
      {
        "source": "/index.html",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=3600"
          }
        ]
      }
    ]
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions",
    "predeploy": [
      "npm --prefix functions run build"
    ],
    "runtime": "nodejs18"
  }
}
```

---

## 8️⃣ Pre-Deployment Checklist

### Code Quality
- [ ] Run linting: `ng lint`
- [ ] Run tests: `ng test`
- [ ] Run e2e tests: `ng e2e`
- [ ] No console errors
- [ ] No TODOs in critical code
- [ ] Branch protected

### Security
- [ ] No API keys in code
- [ ] Environment variables set
- [ ] Firestore rules reviewed
- [ ] Auth guards in place
- [ ] Rate limiting configured
- [ ] CORS properly set

### Performance
- [ ] Build size < 5MB
- [ ] Lighthouse score > 80
- [ ] First Contentful Paint < 3s
- [ ] Time to Interactive < 5s
- [ ] No unused packages

### Features
- [ ] Login/auth working
- [ ] Kiosk mode tested
- [ ] Exam runner tested
- [ ] Proctor dashboard tested
- [ ] Mobile responsive
- [ ] Accessibility (a11y) verified

### Data
- [ ] Database backup created
- [ ] Test data prepared
- [ ] Sample exams created
- [ ] Test users created
- [ ] Disaster recovery plan

---

## 9️⃣ Deployment Steps

### Step 1: Prepare
```bash
# Update version
npm version patch  # or minor/major

# Commit changes
git add .
git commit -m "Release v1.0.0"
git tag v1.0.0
git push origin main --tags
```

### Step 2: Build
```bash
# Clean build
rm -rf dist
ng build --configuration production

# Verify build
ls -lh dist/innovacare-training/
```

### Step 3: Test Built App Locally
```bash
# Serve production build locally
npm install -g http-server
cd dist/innovacare-training
http-server

# Open http://localhost:8080
# Test all critical flows
```

### Step 4: Deploy to Firebase
```bash
# Login to Firebase
firebase login

# Select project
firebase use innovacare-training

# Deploy everything
firebase deploy --only hosting,firestore,functions

# Or deploy separately
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only functions
```

### Step 5: Verify Deployment
```bash
# Check hosting
firebase hosting:channel:list

# View logs
firebase functions:log

# Check firestore rules
firebase firestore:indexes

# Test live app
open https://innovacare-training.firebaseapp.com
```

---

## 🔟 Post-Deployment Verification

### Functional Tests

**Login & Auth**
- [ ] Email/password login works
- [ ] Google login works
- [ ] Password reset works
- [ ] Logout works
- [ ] Auto-logout on token expiry
- [ ] Role-based access control

**Kiosk Mode**
- [ ] `/exam-session-login` loads
- [ ] `/exam-session-consent` loads
- [ ] Exam runner starts with `lockedMode=true`
- [ ] Back button blocked
- [ ] New tabs blocked
- [ ] Copy/paste blocked
- [ ] Auto-redirect after exam
- [ ] Token expiry works (4 hours)

**Proctor Features**
- [ ] Dashboard monitoring works
- [ ] Password generation works
- [ ] Verification dashboard works
- [ ] ID photo upload works
- [ ] Audit log created

**Exam Features**
- [ ] Questions load correctly
- [ ] Timer counts down
- [ ] Answer saving works
- [ ] Review mode works
- [ ] Submit grades exam
- [ ] Results display correctly

### Performance Tests

```bash
# Lighthouse
npm install -g lighthouse
lighthouse https://innovacare-training.firebaseapp.com --view

# Expected scores:
# Performance: > 80
# Accessibility: > 90
# Best Practices: > 85
# SEO: > 90
```

### Security Tests

- [ ] SQL Injection: Try `admin'; --` in login
- [ ] XSS: Try `<script>alert('xss')</script>`
- [ ] CSRF: Check CSRF tokens
- [ ] Auth bypass: Try direct URL access without token
- [ ] Role bypass: Try accessing admin with learner role
- [ ] Data leakage: Check network tab for sensitive data

### Load Testing

```bash
# Install Apache Bench
brew install httpd  # macOS
# apt-get install apache2-utils  # Linux

# Load test (100 concurrent, 1000 requests)
ab -n 1000 -c 100 https://innovacare-training.firebaseapp.com/

# Expected:
# Requests per second: > 50
# Failed requests: 0
# 95% response time: < 500ms
```

---

## 1️⃣1️⃣ Monitoring & Analytics

### Enable Google Analytics
```bash
firebase init analytics
firebase deploy --only analytics
```

### Monitor Functions
```bash
# View function logs
firebase functions:log --limit 50

# Set up alerts in Firebase Console:
# - Error rate > 5%
# - Function duration > 30s
# - Cold start > 2s
```

### Monitor Firestore
- [ ] Database size
- [ ] Read/write operations
- [ ] Storage costs
- [ ] Query performance

---

## 1️⃣2️⃣ Rollback Procedure

If deployment fails:

```bash
# View deployment history
firebase hosting:channel:list

# Rollback to previous version
firebase hosting:clone innovacare-training:live innovacare-training:rollback

# Or redeploy older build
git checkout <previous-tag>
ng build --configuration production
firebase deploy --only hosting
```

---

## 1️⃣3️⃣ Environment-Specific Configs

### Development
```bash
firebase use innovacare-dev
firebase deploy --only hosting,firestore
```

### Staging
```bash
firebase use innovacare-staging
firebase deploy --only hosting,firestore,functions
```

### Production
```bash
firebase use innovacare-training
firebase deploy --only hosting,firestore,functions
# Review changes before confirming
```

---

## 1️⃣4️⃣ Maintenance Tasks

### Weekly
- [ ] Review error logs
- [ ] Monitor Firestore costs
- [ ] Check failed authentications

### Monthly
- [ ] Database backup
- [ ] Security audit
- [ ] Performance review
- [ ] Update dependencies: `npm audit`

### Quarterly
- [ ] Load testing
- [ ] Security penetration testing
- [ ] Disaster recovery drill

---

## 1️⃣5️⃣ Environment Variables

Store sensitive data in `.env.local` (never commit):

```bash
# .env.local (DO NOT COMMIT)
FIREBASE_API_KEY=AIzaSy...
FIREBASE_AUTH_DOMAIN=innovacare-training.firebaseapp.com
FIREBASE_PROJECT_ID=innovacare-training
FIREBASE_STORAGE_BUCKET=innovacare-training.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abc123def456

# Kiosk mode settings
KIOSK_ENABLE_LOCKS=true
KIOSK_TOKEN_EXPIRY_HOURS=4

# Admin settings
ADMIN_EMAIL=admin@innovacare.com
ADMIN_PASSWORD=<use Firebase Auth instead>
```

Add to `.gitignore`:
```
.env.local
.env.*.local
```

---

## 1️⃣6️⃣ Quick Deployment Script

Create `deploy.sh`:

```bash
#!/bin/bash

set -e

echo "🔨 Building..."
ng build --configuration production

echo "✅ Build complete"
echo "🚀 Deploying to Firebase..."

firebase deploy --only hosting,firestore,functions

echo "✨ Deployment complete!"
echo "📍 Visit: https://innovacare-training.firebaseapp.com"

# Optional: Run post-deployment tests
echo "🧪 Running post-deployment tests..."
npm run e2e:prod
```

Run:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## Support & Troubleshooting

### Common Issues

**Issue: "Cannot find module"**
```bash
npm install
npm install --prefix functions
```

**Issue: Firebase not initializing**
```bash
firebase logout
firebase login
firebase init
```

**Issue: Slow build**
```bash
ng build --configuration production --stats-json
npm install -g webpack-bundle-analyzer
webpack-bundle-analyzer dist/innovacare-training/stats.json
```

**Issue: 403 Firestore permission denied**
- Check firestore.rules deployed correctly
- Verify user has correct role in database
- Check if token expired

---

## Contact & Support

- 📧 Email: support@innovacare.com
- 🐛 Report bugs: https://github.com/innovacare/trainning/issues
- 💬 Chat: team Slack #engineering
