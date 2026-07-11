# Create Test Certification Sessions

## 🔧 How to Create Open Certification Sessions

To fix the "Select open session" dropdown, you need to create certification sessions in Firestore.

### Option A: Using Firebase Console (Manual)

1. **Open Firebase Console**
   - Go to: https://console.firebase.google.com/project/innovacare-training/firestore/data

2. **Create Collection**
   - Click "Create collection" → Name: `certificationSessions`

3. **Add Document** with this structure:
```json
{
  "organizationId": "health-org-1",
  "title": "Professional Nursing Certification",
  "description": "Advanced nursing certification program",
  "status": "open",
  "applicationDeadline": "2025-12-31T23:59:59Z",
  "examId": "your-exam-id-here",
  "courseId": "your-course-id-here",
  "createdAt": "2025-07-08T00:00:00Z",
  "updatedAt": "2025-07-08T00:00:00Z",
  "maxApplicants": 50,
  "currentApplicants": 0
}
```

### Option B: Using Cloud Functions (Recommended)

Create a Cloud Function to add test sessions:

```javascript
// functions/src/index.ts
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const createTestCertificationSessions = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new Error('Not authenticated');

  const db = admin.firestore();
  const organizationId = data.organizationId || 'health-org-1';

  const testSessions = [
    {
      organizationId,
      title: 'Professional Nursing Certification',
      description: 'Advanced nursing certification program',
      status: 'open',
      applicationDeadline: new Date('2025-12-31'),
      maxApplicants: 50,
      currentApplicants: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      organizationId,
      title: 'Healthcare Management Certification',
      description: 'Certification for healthcare managers',
      status: 'open',
      applicationDeadline: new Date('2025-11-30'),
      maxApplicants: 30,
      currentApplicants: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      organizationId,
      title: 'Clinical Excellence Program',
      description: 'Advanced clinical skills certification',
      status: 'open',
      applicationDeadline: new Date('2025-10-31'),
      maxApplicants: 40,
      currentApplicants: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  ];

  const batch = db.batch();

  for (const session of testSessions) {
    const ref = db.collection('certificationSessions').doc();
    batch.set(ref, session);
  }

  await batch.commit();
  return { message: `Created ${testSessions.length} test sessions` };
});
```

### Option C: Manual Firestore Data Entry

**Document Structure:**
```
Collection: certificationSessions

Document: {auto-generated-id}
├── organizationId: "your-org-id"
├── title: "Certification Title"
├── description: "Certification description"
├── status: "open" (must be "open" to show in dropdown)
├── applicationDeadline: Timestamp
├── examId: "exam-id-reference"
├── courseId: "course-id-reference"
├── maxApplicants: 50
├── currentApplicants: 0
├── createdAt: Timestamp
└── updatedAt: Timestamp
```

---

## 🔐 Firestore Security Rules

Make sure your Firestore rules allow learners to read open certification sessions:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow learners to read open certification sessions
    match /certificationSessions/{document=**} {
      allow read: if request.auth.uid != null && resource.data.status == 'open';
      allow create, update, delete: if request.auth.token.admin == true;
    }
    
    // Allow learners to create candidate applications
    match /candidateApplications/{document=**} {
      allow read: if request.auth.uid != null;
      allow create: if request.auth.uid == request.resource.data.uid;
      allow update: if request.auth.uid == resource.data.uid || 
                       request.auth.token.admin == true;
    }
  }
}
```

---

## ✅ What to Check

After creating sessions:

1. **Verify Sessions Exist**
   - Firebase Console → Firestore → certificationSessions
   - See all created sessions

2. **Check Status**
   - Make sure `status` = `"open"`
   - If not "open", learners won't see it

3. **Verify Organization**
   - Make sure `organizationId` matches learner's organization
   - Check learner's profile for `orgId`

4. **Test Dropdown**
   - Reload the page
   - Click "Select open session"
   - Sessions should now appear

---

## 🧪 Test Data

### Sample Session 1:
```
Title: Professional Nursing Certification
Organization: health-org-1
Status: open
Deadline: 2025-12-31
Max Applicants: 50
```

### Sample Session 2:
```
Title: Healthcare IT Certification
Organization: IT-org-1
Status: open
Deadline: 2025-11-30
Max Applicants: 30
```

---

## 🐛 Troubleshooting

### Sessions Not Appearing

**Check:**
- [ ] Sessions exist in Firestore
- [ ] `status` is exactly `"open"`
- [ ] `organizationId` matches learner's org
- [ ] Firestore rules allow read access
- [ ] No filtering in the component code

### Dropdown Empty

**Solutions:**
1. Create more test sessions
2. Check browser console for errors
3. Verify Firestore rules
4. Check learner's organization ID

### Wrong Organization

**Fix:**
1. Verify learner's `orgId` in `users/{uid}`
2. Verify session's `organizationId`
3. Both must match exactly

---

## ✨ Quick Setup (5 Minutes)

1. **Open Firebase Console**
   - https://console.firebase.google.com/project/innovacare-training

2. **Go to Firestore**
   - Click "Firestore Database"

3. **Create Collection** (if not exists)
   - Click "+ Collection"
   - Name: `certificationSessions`

4. **Add Document**
   - Click "+ Add document"
   - Set fields:
     - `organizationId`: "health-org-1"
     - `title`: "Test Certification"
     - `status`: "open"
     - `applicationDeadline`: Pick a future date
     - `maxApplicants`: 50

5. **Test**
   - Refresh the app
   - Try selecting the session

---

## 📝 Status Codes

- `open` - Available for applications ✅
- `closed` - No new applications ❌
- `in_progress` - Session running ❌
- `completed` - Session finished ❌

**Only "open" sessions appear in the dropdown!**

---

Need help creating the sessions? I can do it for you! 🚀
