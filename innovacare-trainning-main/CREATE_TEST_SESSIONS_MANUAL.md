# Manually Create Test Certification Sessions

Since Cloud Functions requires more setup, here's the fastest way to add the 3 test sessions:

## 🚀 Quick Steps (5 minutes)

### Step 1: Open Firebase Console
https://console.firebase.google.com/project/innovacare-training/firestore/data

### Step 2: Create Collection (if needed)
- Click on **"Start collection"**
- Collection ID: `certificationSessions`
- Click **"Next"**

### Step 3: Add First Document

Click **"Add Document"** and enter these fields:

```
Document ID: (auto-generated)

Fields:
├── organizationId: "E6Da1PQLc3RdMxDFjc1G" (string)
├── title: "Professional Healthcare Certification" (string)
├── description: "Comprehensive healthcare provider certification" (string)
├── status: "open" (string) ⭐ IMPORTANT
├── applicationDeadline: 2025-12-31 (timestamp)
├── maxApplicants: 50 (number)
├── currentApplicants: 0 (number)
├── createdAt: (serverTimestamp) [click clock icon]
└── updatedAt: (serverTimestamp) [click clock icon]
```

**Click "Save"**

### Step 4: Add Second Document

Click **"Add Document"** again:

```
Fields:
├── organizationId: "E6Da1PQLc3RdMxDFjc1G" (string)
├── title: "Clinical Excellence Program" (string)
├── description: "Advanced clinical skills and best practices" (string)
├── status: "open" (string) ⭐ IMPORTANT
├── applicationDeadline: 2025-11-30 (timestamp)
├── maxApplicants: 40 (number)
├── currentApplicants: 0 (number)
├── createdAt: (serverTimestamp)
└── updatedAt: (serverTimestamp)
```

**Click "Save"**

### Step 5: Add Third Document

Click **"Add Document"** one more time:

```
Fields:
├── organizationId: "E6Da1PQLc3RdMxDFjc1G" (string)
├── title: "Quality Assurance & Patient Safety" (string)
├── description: "Quality improvement and patient safety standards" (string)
├── status: "open" (string) ⭐ IMPORTANT
├── applicationDeadline: 2025-10-31 (timestamp)
├── maxApplicants: 35 (number)
├── currentApplicants: 0 (number)
├── createdAt: (serverTimestamp)
└── updatedAt: (serverTimestamp)
```

**Click "Save"**

---

## ✅ Verify It Works

1. Refresh your app
2. Go to Official Certifications
3. Click "Select open session"
4. **All 3 sessions should appear!** ✨

---

## 🔑 Important Notes

### ⭐ The status MUST be "open"
- If status is not exactly `"open"`, learners won't see it
- Check spelling carefully: `"open"` (lowercase)

### Organization ID
- Must be: `E6Da1PQLc3RdMxDFjc1G`
- This matches the learner's organization

### Timestamps
- Use **serverTimestamp** for createdAt and updatedAt
- In Firebase Console, click the clock icon ⏰

### Application Deadline
- Use a future date (2025-10-31, 2025-11-30, 2025-12-31)
- Format: YYYY-MM-DD

---

## 📸 Visual Steps

### Step 1: Go to Firestore Data
```
Firebase Console
    ↓
Project: innovacare-training
    ↓
Firestore Database
    ↓
Data tab
```

### Step 2: Create Collection
```
Click "Start collection"
Collection ID: certificationSessions
Click "Next"
```

### Step 3: Add Document
```
Click "Auto-generate ID" (or use custom)
Add fields (see above)
Click "Save"
```

Repeat for all 3 documents.

---

## 🧪 After Adding Sessions

### Test the Dropdown
1. Refresh app
2. Go to: `/learner/official-certifications`
3. Click "Select open session" dropdown
4. You should see all 3 sessions! ✅

### Test Full Flow
1. Select a session
2. Select an education path
3. Click "Create application"
4. You should be able to apply! ✨

---

## 🆘 Troubleshooting

### Sessions don't appear in dropdown

**Check:**
- [ ] Collection name is exactly `certificationSessions`
- [ ] `status` field is exactly `"open"` (lowercase)
- [ ] `organizationId` is exactly `"E6Da1PQLc3RdMxDFjc1G"`
- [ ] Documents are saved (check for confirmation)
- [ ] Page is refreshed (F5)

### Wrong organization ID

**If the learner's organization is different:**

Find learner's organization ID:
1. Firebase Console → Users collection
2. Find learner's document (uid)
3. Look for `orgId` field
4. Use that ID in `organizationId`

---

## ✨ Quick Summary

1. **Open**: https://console.firebase.google.com/project/innovacare-training/firestore/data
2. **Create collection**: `certificationSessions`
3. **Add 3 documents** with fields shown above
4. **Make sure**: `status: "open"`
5. **Make sure**: `organizationId: "E6Da1PQLc3RdMxDFjc1G"`
6. **Refresh app** and test!

---

That's it! The learner will then be able to select sessions in the dropdown. 🎉

