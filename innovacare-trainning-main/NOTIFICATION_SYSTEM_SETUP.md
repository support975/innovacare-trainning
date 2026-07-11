# Real-Time Notification System Setup Guide

## Overview

This guide walks you through setting up the comprehensive email and in-app notification system for Innovacare Training. The system sends automated emails and in-app notifications for:

- **Course Assigned** — When a learner is assigned a new course
- **Course Completed** — When a learner completes a course
- **Course Overdue** — When a course becomes overdue
- **Rewards** — When a learner unlocks an achievement
- **Transcripts** — Learner transcript delivery

## System Architecture

### Cloud Functions (`functions/src/notification-service.ts`)
- Sends emails via SendGrid API
- Creates in-app notifications in Firestore
- Professional HTML email templates

### Firestore Triggers (`functions/src/index.ts`)
- `onEnrollmentCreated` — Triggers when new course assigned
- `onEnrollmentCompleted` — Triggers when course completed
- Automatically sends emails and creates notifications

### Frontend Services (`src/app/shared/services/notification.service.ts`)
- Real-time Firestore listeners
- Notification state management
- Mark as read / delete notifications

### UI Components
- **NotificationBellComponent** — Bell icon with unread count in header
- **NotificationCenterComponent** — Full notification center page
- **NotificationBellPlainComponent** — Quick dropdown in header

## Setup Instructions

### 1. SendGrid Configuration

#### 1.1 Create SendGrid Account
1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Verify your sender email address
3. Create an API key

#### 1.2 Set Firebase Secret
```bash
firebase functions:secrets:set SENDGRID_API_KEY
# Paste your SendGrid API key when prompted
```

#### 1.3 Set SendGrid From Email
```bash
firebase functions:secrets:set SENDGRID_FROM_EMAIL
# Enter the verified sender email (e.g., noreply@innovacare.training)
```

#### 1.4 Verify the Function Uses Secrets
The functions are already configured to use these secrets. Check `functions/src/index.ts`:
```typescript
const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
const SENDGRID_FROM_EMAIL = defineSecret("SENDGRID_FROM_EMAIL");
```

### 2. Firestore Rules Configuration

Add these rules to `firestore.rules` to allow learners to read their notifications:

```typescript
// Notifications collection - learners can read their own
match /notifications/{document=**} {
  match /inapp/{notificationId} {
    allow read: if request.auth.uid != null && resource.data.learnerId == request.auth.uid;
    allow update: if request.auth.uid != null && resource.data.learnerId == request.auth.uid;
    allow delete: if request.auth.uid != null && resource.data.learnerId == request.auth.uid;
  }
  
  match /emails/{emailId} {
    allow read: if request.auth.token.admin == true;
  }
}
```

### 3. Deployment

#### 3.1 Deploy Cloud Functions
```bash
npm --prefix functions run build
firebase deploy --only functions
```

#### 3.2 Build and Deploy Frontend
```bash
npm run build
firebase deploy --only hosting
```

### 4. Testing the System

#### 4.1 Test Course Assignment Notification
1. Log in as organization admin
2. Assign a course to a learner
3. Check:
   - Learner's inbox (email should arrive within 1-2 minutes)
   - Learner dashboard notification bell (shows unread count)
   - Notification center at `/learner/notifications`

#### 4.2 Test Notification Bell
1. Log in as learner
2. Bell icon in header should show unread notification count
3. Click to see dropdown with recent notifications
4. Click notification to navigate to associated page

#### 4.3 Test Notification Center
1. Navigate to `/learner/notifications`
2. See all notifications grouped by type
3. Filter by type or unread status
4. Mark as read / delete individual notifications
5. "Mark all as read" clears unread badge

### 5. Email Template Customization

Edit email templates in `functions/src/notification-service.ts`:

```typescript
const emailTemplates = {
  course_assigned: (learnerName: string, courseName: string, dueDate: string) => ({
    subject: `New Course Assigned: ${courseName}`,
    html: `...` // Update HTML content here
  }),
  // ... other templates
}
```

### 6. Adding New Notification Types

To add a new notification type (e.g., "certificate_ready"):

#### Step 1: Update types
```typescript
// notification-service.ts
type: "certificate_ready" | ... // Add new type
```

#### Step 2: Create email template
```typescript
const emailTemplates = {
  certificate_ready: (learnerName: string, certName: string) => ({
    subject: `Your Certificate is Ready: ${certName}`,
    html: `...`
  })
}
```

#### Step 3: Create helper function
```typescript
export async function sendCertificateReadyNotification(
  learnerId: string,
  learnerEmail: string,
  learnerName: string,
  certName: string,
  apiKey: string,
  fromEmail: string,
): Promise<void> {
  const template = getEmailTemplate("certificate_ready", learnerName, certName);
  // ... send email and create in-app notification
}
```

#### Step 4: Create Cloud Function trigger
```typescript
export const onCertificateGenerated = onDocumentCreated(
  "certificates/{certId}",
  async (event) => {
    // ... trigger notification
  }
);
```

### 7. Monitoring & Logging

#### 7.1 View Function Logs
```bash
firebase functions:log --limit 50
```

#### 7.2 View Firestore Notification Collection
- Firebase Console → Firestore Database → `notifications/emails`
- See sent/failed emails with status and timestamps

#### 7.3 Check SendGrid Dashboard
- SendGrid Dashboard → Mail Activity
- See all sent emails, bounces, complaints

### 8. Troubleshooting

#### Issue: Emails not sending
1. Check SendGrid API key is set correctly
2. Verify from email is verified in SendGrid
3. Check Firebase Functions logs for errors
4. Ensure Firestore rules allow writing to notifications collection

#### Issue: Notifications not appearing in app
1. Verify Firestore rules allow read access
2. Check browser console for JavaScript errors
3. Ensure user is logged in with correct profile
4. Check if learnerId matches user.uid in Firestore

#### Issue: Email template broken
1. Test HTML in email client before deploying
2. Use inline CSS (CSS in <style> tags)
3. Avoid external resources (images should be embedded)
4. Check SendGrid spam score (aim for < 5)

### 9. Performance Considerations

#### Email Sending
- Emails are sent asynchronously via Cloud Functions
- Typical delivery time: 1-2 seconds to SendGrid
- SendGrid takes 1-30 seconds for actual delivery

#### In-App Notifications
- Real-time updates via Firestore snapshot listeners
- Unsubscribes automatically on component destroy
- Max 10MB storage per user recommended

#### Optimization Tips
- Archive old notifications periodically
- Batch similar notifications for digest mode
- Cache templates in memory for high-volume scenarios

## API Reference

### NotificationService (Angular)

```typescript
// Initialize and listen to notifications
notificationService.initializeNotifications();
notificationService.notifications$  // Observable<InAppNotification[]>
notificationService.unreadCount$    // Observable<number>

// Mark notification as read
await notificationService.markAsRead(notificationId);

// Mark all as read
await notificationService.markAllAsRead();

// Delete notification
await notificationService.deleteNotification(notificationId);

// Clear all
await notificationService.clearAllNotifications();
```

### Cloud Functions

```typescript
// Send course assignment notification
await sendCourseAssignedNotification(
  learnerId,
  learnerEmail,
  learnerName,
  courseName,
  dueDate,
  apiKey,
  fromEmail
);

// Send completion notification
await sendCourseCompletedNotification(
  learnerId,
  learnerEmail,
  learnerName,
  courseName,
  grade,
  apiKey,
  fromEmail
);

// Send overdue notification
await sendCourseOverdueNotification(
  learnerId,
  learnerEmail,
  learnerName,
  courseName,
  daysOverdue,
  apiKey,
  fromEmail
);

// Send reward notification
await sendRewardNotification(
  learnerId,
  learnerEmail,
  learnerName,
  rewardName,
  points,
  apiKey,
  fromEmail
);
```

## Rate Limiting

Consider implementing rate limiting for high-volume scenarios:

```typescript
// Example: Max 5 emails per learner per day
const emailsToday = await db
  .collection("notifications/emails")
  .where("learnerId", "==", learnerId)
  .where("sentAt", ">", startOfDay)
  .count()
  .get();

if (emailsToday.data().count >= 5) {
  console.log("Rate limit exceeded");
  return;
}
```

## Future Enhancements

### SMS Notifications
- Add Twilio integration for SMS alerts
- Send SMS for critical notifications (overdue, urgent)

### Push Notifications
- Integrate Firebase Cloud Messaging
- Send browser push notifications

### Email Digest
- Combine multiple notifications into weekly digest
- Configurable notification preferences per user

### Analytics
- Track email open/click rates via SendGrid webhooks
- Monitor notification engagement metrics

---

**Support:** For issues or questions, contact your Innovacare administrator.
