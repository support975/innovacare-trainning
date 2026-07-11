/* eslint-disable max-len, require-jsdoc */
import * as admin from "firebase-admin";
import sgMail from "@sendgrid/mail";

const db = admin.firestore();

export interface EmailNotification {
  type: "course_assigned" | "course_completed" | "course_overdue" | "transcript" | "reward";
  learnerId: string;
  learnerEmail: string;
  learnerName: string;
  subject: string;
  htmlContent: string;
  data?: Record<string, unknown>;
  sentAt?: FirebaseFirestore.FieldValue;
  status?: "pending" | "sent" | "failed";
}

export interface InAppNotification {
  id?: string;
  learnerId: string;
  type:
    | "course_assigned"
    | "course_completed"
    | "course_overdue"
    | "transcript"
    | "reward";
  title: string;
  message: string;
  icon: string;
  actionUrl?: string;
  read: boolean;
  createdAt?: FirebaseFirestore.FieldValue;
  data?: Record<string, unknown>;
}

// Email Templates
const emailTemplates = {
  course_assigned: (learnerName: string, courseName: string, dueDate: string) => ({
    subject: `New Course Assigned: ${courseName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1a3f6f 0%, #00a79d 100%); color: white; padding: 24px; border-radius: 8px; margin-bottom: 24px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 24px; }
            .content p { margin: 12px 0; line-height: 1.6; }
            .course-info { background: white; padding: 16px; border-left: 4px solid #00a79d; margin: 16px 0; border-radius: 4px; }
            .course-info strong { color: #1a3f6f; }
            .button { display: inline-block; background: linear-gradient(135deg, #1a3f6f, #00a79d); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0; }
            .footer { color: #6b7280; font-size: 12px; text-align: center; margin-top: 24px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📚 New Course Assigned</h1>
            </div>
            <div class="content">
              <p>Hello ${learnerName},</p>
              <p>A new course has been assigned to you:</p>
              <div class="course-info">
                <strong>Course:</strong> ${courseName}<br>
                <strong>Due Date:</strong> ${dueDate}
              </div>
              <p>Start learning now to complete this course on time. Access your assignments and track your progress in your learner dashboard.</p>
              <a href="https://innovacare-training.web.app/learner/assignments" class="button">View Assignments</a>
              <p>If you have any questions, contact your training administrator.</p>
            </div>
            <div class="footer">
              <p>© 2026 Innovacare Training. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  }),

  course_completed: (learnerName: string, courseName: string, grade?: string) => ({
    subject: `🎉 Course Completed: ${courseName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 24px; border-radius: 8px; margin-bottom: 24px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #f0fdf4; padding: 20px; border-radius: 8px; margin-bottom: 24px; }
            .content p { margin: 12px 0; line-height: 1.6; }
            .achievement { background: white; padding: 16px; border-left: 4px solid #10b981; margin: 16px 0; border-radius: 4px; text-align: center; }
            .achievement strong { color: #065f46; font-size: 18px; }
            .button { display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0; }
            .footer { color: #6b7280; font-size: 12px; text-align: center; margin-top: 24px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Congratulations!</h1>
            </div>
            <div class="content">
              <p>Hello ${learnerName},</p>
              <p>You have successfully completed the course:</p>
              <div class="achievement">
                <strong>${courseName}</strong><br>
                ${grade ? `Grade: ${grade}` : ""}
              </div>
              <p>Great work! Your completion has been recorded and you can now download your certificate.</p>
              <a href="https://innovacare-training.web.app/learner/certifications" class="button">View Certificates</a>
              <p>Keep up the excellent work and continue your learning journey!</p>
            </div>
            <div class="footer">
              <p>© 2026 Innovacare Training. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  }),

  course_overdue: (learnerName: string, courseName: string, daysOverdue: number) => ({
    subject: `⚠️ Course Overdue: ${courseName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 24px; border-radius: 8px; margin-bottom: 24px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #fef2f2; padding: 20px; border-radius: 8px; margin-bottom: 24px; }
            .content p { margin: 12px 0; line-height: 1.6; }
            .alert { background: white; padding: 16px; border-left: 4px solid #ef4444; margin: 16px 0; border-radius: 4px; }
            .alert strong { color: #7f1d1d; }
            .button { display: inline-block; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0; }
            .footer { color: #6b7280; font-size: 12px; text-align: center; margin-top: 24px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Course Overdue</h1>
            </div>
            <div class="content">
              <p>Hello ${learnerName},</p>
              <p>The following course is now overdue:</p>
              <div class="alert">
                <strong>Course:</strong> ${courseName}<br>
                <strong>Days Overdue:</strong> ${daysOverdue} days
              </div>
              <p>Please complete this course as soon as possible. Contact your training administrator if you need assistance.</p>
              <a href="https://innovacare-training.web.app/learner/assignments" class="button">Complete Now</a>
            </div>
            <div class="footer">
              <p>© 2026 Innovacare Training. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  }),

  transcript: (learnerName: string) => ({
    subject: "Your Learning Transcript",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1a3f6f 0%, #00a79d 100%); color: white; padding: 24px; border-radius: 8px; margin-bottom: 24px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 24px; }
            .content p { margin: 12px 0; line-height: 1.6; }
            .button { display: inline-block; background: linear-gradient(135deg, #1a3f6f, #00a79d); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0; }
            .footer { color: #6b7280; font-size: 12px; text-align: center; margin-top: 24px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📋 Your Learning Transcript</h1>
            </div>
            <div class="content">
              <p>Hello ${learnerName},</p>
              <p>Please find your updated learning transcript attached to this email. It includes all completed courses, grades, and certifications.</p>
              <p>You can also view your transcript anytime in your learner dashboard:</p>
              <a href="https://innovacare-training.web.app/learner/transcript" class="button">View Transcript</a>
              <p>If you need any assistance, please contact your administrator.</p>
            </div>
            <div class="footer">
              <p>© 2026 Innovacare Training. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  }),

  reward: (learnerName: string, rewardName: string, points: number) => ({
    subject: `🏆 Achievement Unlocked: ${rewardName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 24px; border-radius: 8px; margin-bottom: 24px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #fffbeb; padding: 20px; border-radius: 8px; margin-bottom: 24px; }
            .content p { margin: 12px 0; line-height: 1.6; }
            .achievement { background: white; padding: 16px; border-left: 4px solid #f59e0b; margin: 16px 0; border-radius: 4px; text-align: center; }
            .achievement strong { color: #92400e; font-size: 18px; }
            .points { background: #fcd34d; color: #78350f; padding: 8px 12px; border-radius: 4px; display: inline-block; margin: 8px 0; }
            .button { display: inline-block; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0; }
            .footer { color: #6b7280; font-size: 12px; text-align: center; margin-top: 24px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🏆 Achievement Unlocked!</h1>
            </div>
            <div class="content">
              <p>Hello ${learnerName},</p>
              <p>Congratulations! You've unlocked a new achievement:</p>
              <div class="achievement">
                <strong>${rewardName}</strong><br>
                <div class="points">+${points} Points</div>
              </div>
              <p>Keep up the great work and continue earning rewards as you progress through your learning journey!</p>
              <a href="https://innovacare-training.web.app/learner/rewards" class="button">View Rewards</a>
            </div>
            <div class="footer">
              <p>© 2026 Innovacare Training. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  }),
};

export async function sendEmail(
  apiKey: string,
  fromEmail: string,
  notification: EmailNotification,
): Promise<void> {
  sgMail.setApiKey(apiKey);

  try {
    await sgMail.send({
      to: notification.learnerEmail,
      from: fromEmail,
      subject: notification.subject,
      html: notification.htmlContent,
    });

    // Log email in Firestore
    await db.collection("notificationEmails").add({
      ...notification,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "sent",
    });
  } catch (error) {
    console.error("SendGrid error:", error);
    await db.collection("notificationEmails").add({
      ...notification,
      status: "failed",
      error: String(error),
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw error;
  }
}

export async function createInAppNotification(notification: InAppNotification): Promise<string> {
  const docRef = await db.collection("notificationInApp").add({
    ...notification,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

export function getEmailTemplate(type: EmailNotification["type"], ...args: unknown[]) {
  const template = emailTemplates[type as keyof typeof emailTemplates];
  if (!template) throw new Error(`Unknown template: ${type}`);
  return (template as (...args: unknown[]) => {subject: string; html: string})(...args);
}

export async function sendCourseAssignedNotification(
  learnerId: string,
  learnerEmail: string,
  learnerName: string,
  courseName: string,
  dueDate: string,
  apiKey: string,
  fromEmail: string,
): Promise<void> {
  const template = getEmailTemplate("course_assigned", learnerName, courseName, dueDate);

  await Promise.all([
    sendEmail(apiKey, fromEmail, {
      type: "course_assigned",
      learnerId,
      learnerEmail,
      learnerName,
      subject: template.subject,
      htmlContent: template.html,
      data: {courseName, dueDate},
    }),
    createInAppNotification({
      learnerId,
      type: "course_assigned",
      title: "New Course Assigned",
      message: `${courseName} has been assigned to you. Due: ${dueDate}`,
      icon: "📚",
      actionUrl: "/learner/assignments",
      read: false,
      data: {courseName, dueDate},
    }),
  ]);
}

export async function sendCourseCompletedNotification(
  learnerId: string,
  learnerEmail: string,
  learnerName: string,
  courseName: string,
  grade?: string,
  apiKey?: string,
  fromEmail?: string,
): Promise<void> {
  const template = getEmailTemplate("course_completed", learnerName, courseName, grade);

  if (apiKey && fromEmail) {
    await sendEmail(apiKey, fromEmail, {
      type: "course_completed",
      learnerId,
      learnerEmail,
      learnerName,
      subject: template.subject,
      htmlContent: template.html,
      data: {courseName, grade},
    });
  }

  await createInAppNotification({
    learnerId,
    type: "course_completed",
    title: "Course Completed",
    message: `Congratulations! You've completed ${courseName}${grade ? ` with grade ${grade}` : ""}`,
    icon: "🎉",
    actionUrl: "/learner/certifications",
    read: false,
    data: {courseName, grade},
  });
}

export async function sendCourseOverdueNotification(
  learnerId: string,
  learnerEmail: string,
  learnerName: string,
  courseName: string,
  daysOverdue: number,
  apiKey: string,
  fromEmail: string,
): Promise<void> {
  const template = getEmailTemplate("course_overdue", learnerName, courseName, daysOverdue);

  await Promise.all([
    sendEmail(apiKey, fromEmail, {
      type: "course_overdue",
      learnerId,
      learnerEmail,
      learnerName,
      subject: template.subject,
      htmlContent: template.html,
      data: {courseName, daysOverdue},
    }),
    createInAppNotification({
      learnerId,
      type: "course_overdue",
      title: "Course Overdue",
      message: `${courseName} is ${daysOverdue} days overdue. Please complete it as soon as possible.`,
      icon: "⚠️",
      actionUrl: "/learner/assignments",
      read: false,
      data: {courseName, daysOverdue},
    }),
  ]);
}

export async function sendRewardNotification(
  learnerId: string,
  learnerEmail: string,
  learnerName: string,
  rewardName: string,
  points: number,
  apiKey?: string,
  fromEmail?: string,
): Promise<void> {
  const template = getEmailTemplate("reward", learnerName, rewardName, points);

  if (apiKey && fromEmail) {
    await sendEmail(apiKey, fromEmail, {
      type: "reward",
      learnerId,
      learnerEmail,
      learnerName,
      subject: template.subject,
      htmlContent: template.html,
      data: {rewardName, points},
    });
  }

  await createInAppNotification({
    learnerId,
    type: "reward",
    title: "Achievement Unlocked",
    message: `${rewardName} - +${points} points`,
    icon: "🏆",
    actionUrl: "/learner/rewards",
    read: false,
    data: {rewardName, points},
  });
}
