/* eslint-disable max-len, require-jsdoc, valid-jsdoc */
/* functions/src/index.ts (Firebase Functions v2) */
import * as admin from "firebase-admin";
import {onDocumentCreated, onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onCall, onRequest, CallableRequest, HttpsError} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";
import {defineSecret} from "firebase-functions/params";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {PDFDocument, StandardFonts, rgb} from "pdf-lib";
import {nanoid} from "nanoid";
import Stripe from "stripe";
import sgMail from "@sendgrid/mail";
import twilio from "twilio";
import {GoogleCloudTtsProvider} from "./tts/google-cloud-tts-provider.js";
import {TtsProvider} from "./tts/tts-provider.js";

/* ─────────── Init & global opts ─────────── */
admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();
// Set your region (or pass { region: 'us-central1' } per onCall below)
setGlobalOptions({region: "us-central1"});

const callableCors = [
  "https://www.innovacaretrainning.com",
  "https://innovacaretrainning.com",
  "https://innovacare-training.web.app",
  "https://innovacare-training.firebaseapp.com",
  "http://localhost:4200",
  "http://127.0.0.1:4200",
];

const DEFAULT_TTS_LANGUAGE = "en-US";
const DEFAULT_TTS_VOICE = "en-US-Neural2-F";
const DEFAULT_TTS_SPEAKING_RATE = 0.95;
const MAX_TTS_TRANSCRIPT_CHARS = 4800;
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
const SENDGRID_FROM_EMAIL = defineSecret("SENDGRID_FROM_EMAIL");
const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER = defineSecret("TWILIO_FROM_NUMBER");
const PUBLIC_APP_URL = "https://www.innovacaretrainning.com";

/* ─────────── Helpers & types ─────────── */
const setEq = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

const nowTs = () => admin.firestore.FieldValue.serverTimestamp();
const REMINDER_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SMART_REMINDER_SETTINGS: Required<SmartReminderSettings> = {
  enabled: true,
  defaultDueDays: 30,
  upcomingDueEnabled: true,
  upcomingDueDays: 7,
  overdueEnabled: true,
  overdueEscalationDays: 3,
  inactiveEnabled: true,
  inactiveDays: 7,
  managerEscalationEnabled: true,
  digestMode: false,
};

const epochMs = (value: unknown): number | undefined => {
  if (!value) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  const maybe = value as {toMillis?: () => number; seconds?: number};
  if (typeof maybe.toMillis === "function") return maybe.toMillis();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return undefined;
};

const dateKey = (timestamp = Date.now()) => new Date(timestamp).toISOString().slice(0, 10);

const sanitizeIdPart = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_");

const mergeReminderSettings = (raw: FirebaseFirestore.DocumentData | undefined) => {
  const settings = {...DEFAULT_SMART_REMINDER_SETTINGS, ...(raw || {})};
  settings.defaultDueDays = Math.max(1, Math.min(365, Number(settings.defaultDueDays || 30)));
  settings.upcomingDueDays = Math.max(1, Math.min(60, Number(settings.upcomingDueDays || 7)));
  settings.overdueEscalationDays = Math.max(0, Math.min(60, Number(settings.overdueEscalationDays || 3)));
  settings.inactiveDays = Math.max(1, Math.min(90, Number(settings.inactiveDays || 7)));
  return settings;
};

const learnerName = (learner: ReminderLearnerDoc) => {
  return String(learner.displayName || learner.email || learner.id || "Learner");
};

const reminderDueTs = (
  enrollment: ReminderEnrollmentDoc,
  course: ReminderCourseDoc | undefined,
  settings: Required<SmartReminderSettings>,
) => {
  const assigned = epochMs(enrollment.assignedAt);
  return epochMs(enrollment.dueDate) ||
    epochMs(course?.dueDate) ||
    (assigned ? assigned + settings.defaultDueDays * REMINDER_DAY_MS : undefined);
};

const notificationBase = (title: string, body: string, uid: string, severity: "info" | "warning" | "critical") => ({
  title,
  body,
  link: "/learner/assignments",
  severity,
  audience: {type: "user", uid},
  createdAt: nowTs(),
  createdBy: {uid: "system", name: "Smart reminders"},
});

const honorFromScore = (score: number) => {
  if (score >= 95) return "High Honors";
  if (score >= 90) return "Honors";
  if (score >= 80) return "Merit";
  return "Pass";
};

const pointsFromScore = (score: number) => {
  if (score >= 95) return 100;
  if (score >= 90) return 80;
  if (score >= 80) return 60;
  return 40;
};

type GradeExamPayload = {
  courseId: string;
  examId: string;
  answers: Record<string, string[]>; // qid -> array of selected option ids
  officialApplicationId?: string;
  certificationSessionId?: string;
};

type GradeExamResultPayload = {
  courseId: string;
  examId: string;
  total: number;
  correct: number;
  percent: number;
  passPct: number;
  passed: boolean;
  honor: string;
  pointsPerQuestion: number;
  details: Array<{
    id: string;
    order: number;
    prompt: string;
    your: string[];
    correct: string[];
    isCorrect: boolean;
    explanation?: string;
  }>;
};

type QuestionDoc = {
  order?: number;
  prompt?: string;
  mode?: "single" | "multi";
  options?: Array<{ id: string; text: string }>;
  explanation?: string;
};

type ExamDoc = {
  title?: string;
  available?: boolean;
  pointsPerQuestion?: number;
  passPct?: number;
};

type CreateOrganizationAdminPayload = {
  organization: {
    name: string;
    type: "health" | "IT" | "school";
    plan: "free" | "pro" | "enterprise";
    orgId?: string;
    learnerLimit?: number | null;
    active?: boolean;
  };
  owner: {
    email: string;
    displayName?: string;
  };
};

type CreateOrganizationAdminHttpBody = CreateOrganizationAdminPayload & {
  idToken?: string;
  operation?: "createOrganizationAdmin";
};

type CreateOrganizationAdminResult = {
  orgId: string;
  ownerUid: string;
  ownerEmail: string;
  temporaryPassword: string;
};

type CreateOrganizationAdminRequestDoc = CreateOrganizationAdminPayload & {
  requestedByUid?: string;
  requestedByEmail?: string;
  status?: "pending" | "processing" | "completed" | "failed";
};

type CourseAssignmentBackfillRequestDoc = {
  requestedByUid?: string;
  status?: "pending" | "processing" | "completed" | "failed";
};

type SmartReminderScanRequestDoc = {
  requestedByUid?: string;
  requestedByEmail?: string;
  orgId?: string;
  status?: "pending" | "processing" | "completed" | "failed";
};

type ManagedUserRole = "admin" | "manager" | "learner";

type CreateManagedUserPayload = {
  email: string;
  displayName?: string;
  role: ManagedUserRole;
  orgId: string;
};

type CreateManagedUserHttpBody = CreateManagedUserPayload & {
  idToken?: string;
  operation?: "createManagedUser";
};

type CreateManagedUserResult = {
  uid: string;
  email: string;
  displayName: string;
  role: ManagedUserRole;
  orgId: string;
  temporaryPassword: string;
};

type OrganizationAdminCallablePayload =
  | CreateOrganizationAdminPayload
  | (CreateManagedUserPayload & {operation: "createManagedUser"});

type ActorIdentity = {
  uid: string;
  email?: string;
};

type GenerateLessonAudioPayload = {
  courseId: string;
  lessonId: string;
  transcript: string;
  voice?: string;
  language?: string;
  title?: string;
  speakingRate?: number;
};

type GenerateLessonAudioResult = {
  url: string;
  path: string;
  title: string;
  transcript: string;
  voice: string;
  language: string;
  speakingRate: number;
  audioEncoding: "MP3";
};

type SmartReminderSettings = {
  enabled?: boolean;
  defaultDueDays?: number;
  upcomingDueEnabled?: boolean;
  upcomingDueDays?: number;
  overdueEnabled?: boolean;
  overdueEscalationDays?: number;
  inactiveEnabled?: boolean;
  inactiveDays?: number;
  managerEscalationEnabled?: boolean;
  digestMode?: boolean;
};

type SmartReminderScanResult = {
  orgsScanned: number;
  learnerNotifications: number;
  managerNotifications: number;
  remindersCreated: number;
  skippedExisting: number;
};

type PublicBillingInterval = "monthly" | "yearly";
type PublicPaidPlan = "starter" | "growth";
type InternalBillingPlan = "free" | "pro" | "enterprise";

type CreateStripeCheckoutPayload = {
  planId?: string;
  billingInterval?: string;
  customerEmail?: string;
  organizationName?: string;
};

type PublicPricingPlan = {
  stripeName: string;
  billingRecordPlan: "free" | "pro";
  monthlyAmountCents: number;
  yearlyAmountCents: number;
  includedLearners: number;
  description: string;
};

const PUBLIC_PRICING_PLANS: Record<PublicPaidPlan, PublicPricingPlan> = {
  starter: {
    stripeName: "Innovacare Training Starter",
    billingRecordPlan: "free",
    monthlyAmountCents: 4900,
    yearlyAmountCents: 49980,
    includedLearners: 25,
    description: "Starter LMS plan for structured onboarding and simple training tracking.",
  },
  growth: {
    stripeName: "Innovacare Training Growth",
    billingRecordPlan: "pro",
    monthlyAmountCents: 12900,
    yearlyAmountCents: 131580,
    includedLearners: 100,
    description: "Growth LMS plan with manager visibility, certificates and stronger follow-up.",
  },
};

const INTERNAL_PLAN_LEARNER_LIMITS: Record<InternalBillingPlan, number | null> = {
  free: 25,
  pro: 100,
  enterprise: null,
};

function normalizeInternalBillingPlan(value: unknown): InternalBillingPlan {
  const plan = String(value || "").trim().toLowerCase();
  if (plan === "starter") return "free";
  if (plan === "growth") return "pro";
  if (plan === "free" || plan === "pro" || plan === "enterprise") return plan;
  return "free";
}

async function enforceLearnerSeatLimit(orgId: string, orgSnap: FirebaseFirestore.DocumentSnapshot): Promise<void> {
  const explicitLimit = orgSnap.get("learnerLimit");
  const planLimit = INTERNAL_PLAN_LEARNER_LIMITS[normalizeInternalBillingPlan(orgSnap.get("plan"))];
  const limit = typeof explicitLimit === "number" && Number.isFinite(explicitLimit) ?
    explicitLimit :
    planLimit;

  if (limit === null) return;

  const learnersSnap = await db.collection("users")
    .where("orgId", "==", orgId)
    .where("role", "==", "learner")
    .where("active", "==", true)
    .count()
    .get();

  const currentLearners = learnersSnap.data().count;
  if (currentLearners >= limit) {
    throw new HttpsError(
      "failed-precondition",
      `This organization has reached its learner limit (${limit}). Upgrade the plan or increase learnerLimit before adding more learners.`,
    );
  }
}

type ReminderLearnerDoc = {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  orgId?: string;
  lastSeenAt?: unknown;
  lastLoginAt?: unknown;
  activityUpdatedAt?: unknown;
};

type ReminderEnrollmentDoc = {
  uid?: string;
  courseId?: string;
  status?: string;
  orgId?: string;
  assignedAt?: unknown;
  dueDate?: unknown;
};

type ReminderCourseDoc = {
  title?: string;
  dueDate?: unknown;
};

const googleTtsProvider = new GoogleCloudTtsProvider();

const getAllowedOrigin = (origin?: string) => {
  if (!origin) return callableCors[0];
  return callableCors.includes(origin) ? origin : "";
};

const applyHttpCors = (
  req: {headers: Record<string, string | string[] | undefined>; method: string},
  res: {
    set: (field: string, value: string) => void;
    status: (code: number) => {send: (body?: unknown) => void};
  },
) => {
  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  const allowedOrigin = getAllowedOrigin(origin);

  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Max-Age", "3600");

  if (allowedOrigin) {
    res.set("Access-Control-Allow-Origin", allowedOrigin);
  }

  if (req.method === "OPTIONS") {
    res.status(allowedOrigin ? 204 : 403).send();
    return true;
  }

  return false;
};

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader) return "";
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
};

const getBodyIdToken = (body: unknown) => {
  if (!body || typeof body !== "object") return "";
  const token = (body as {idToken?: unknown}).idToken;
  return typeof token === "string" ? token.trim() : "";
};

const getHttpStatusForError = (error: unknown) => {
  if (!(error instanceof HttpsError)) return 500;

  switch (error.code) {
  case "invalid-argument":
    return 400;
  case "unauthenticated":
    return 401;
  case "permission-denied":
    return 403;
  case "not-found":
    return 404;
  case "already-exists":
    return 409;
  default:
    return 500;
  }
};

const getTtsProvider = (): TtsProvider => {
  const provider = String(process.env.TTS_PROVIDER || "google").trim().toLowerCase();
  if (provider === "google") return googleTtsProvider;
  throw new HttpsError("failed-precondition", `Unsupported TTS provider: ${provider}`);
};

const requireAdminCourseAccess = async (uid: string) => {
  const actorSnap = await db.doc(`users/${uid}`).get();
  const role = String(actorSnap.get("role") || "").trim();

  if (!["admin", "super_admin", "superAdmin"].includes(role)) {
    throw new HttpsError("permission-denied", "Admin access required to generate lesson audio.");
  }

  return {
    role,
    email: String(actorSnap.get("email") || ""),
  };
};

const assertSafeStorageSegment = (value: string, field: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new HttpsError("invalid-argument", `${field} contains unsupported characters.`);
  }
};

const normalizeTtsString = (value: unknown, fallback = "") => {
  return typeof value === "string" ? value.trim() : fallback;
};

const normalizeSpeakingRate = (value: unknown) => {
  const rate = typeof value === "number" ? value : DEFAULT_TTS_SPEAKING_RATE;
  if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) {
    throw new HttpsError("invalid-argument", "speakingRate must be between 0.25 and 4.");
  }
  return Math.round(rate * 100) / 100;
};

const buildFirebaseStorageDownloadUrl = (bucketName: string, path: string, token: string) => {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
};

const stripeClient = () => {
  const key = STRIPE_SECRET_KEY.value();
  if (!key) {
    throw new HttpsError("failed-precondition", "Stripe secret key is not configured.");
  }
  return new Stripe(key);
};

const normalizeCheckoutPlan = (value: unknown): PublicPaidPlan => {
  const plan = String(value || "").trim().toLowerCase();
  if (plan === "starter" || plan === "growth") return plan;
  throw new HttpsError("invalid-argument", "Choose Starter or Growth for online payment.");
};

const normalizeBillingInterval = (value: unknown): PublicBillingInterval => {
  const interval = String(value || "yearly").trim().toLowerCase();
  if (interval === "monthly" || interval === "yearly") return interval;
  throw new HttpsError("invalid-argument", "billingInterval must be monthly or yearly.");
};

const cleanOptionalString = (value: unknown, maxLength = 160) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const safeCheckoutReturnBase = (origin: string | undefined) => {
  if (origin && callableCors.includes(origin)) return origin;
  return PUBLIC_APP_URL;
};

const subscriptionStatusToBillingStatus = (
  status: Stripe.Subscription.Status | null | undefined,
): "active" | "trial" | "past_due" | "cancelled" => {
  if (status === "trialing") return "trial";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "cancelled";
  return "active";
};

const toStripeTimestamp = (seconds: number | null | undefined) => {
  return typeof seconds === "number" ? admin.firestore.Timestamp.fromMillis(seconds * 1000) : null;
};

const webhookPlan = (value: string | null | undefined): PublicPaidPlan | undefined => {
  return value === "starter" || value === "growth" ? value : undefined;
};

const writeStripeBillingRecord = async (
  subscription: Stripe.Subscription,
  fallback?: {
    sessionId?: string;
    amountTotal?: number | null;
    currency?: string | null;
    customerEmail?: string | null;
  },
) => {
  const planId = webhookPlan(subscription.metadata?.planId) || "growth";
  const plan = PUBLIC_PRICING_PLANS[planId];
  const orgName = cleanOptionalString(subscription.metadata?.organizationName, 180) ||
    fallback?.customerEmail ||
    String(subscription.customer || "Stripe customer");
  const recordId = `stripe_${sanitizeIdPart(subscription.id)}`;
  const amount = typeof fallback?.amountTotal === "number" ? fallback.amountTotal / 100 : undefined;
  const periodSource = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };

  await db.doc(`billingRecords/${recordId}`).set(
    {
      orgId: recordId,
      orgName,
      plan: plan.billingRecordPlan,
      status: subscriptionStatusToBillingStatus(subscription.status),
      amount,
      currency: fallback?.currency || "usd",
      periodStart: toStripeTimestamp(periodSource.current_period_start),
      periodEnd: toStripeTimestamp(periodSource.current_period_end),
      paymentProvider: "stripe",
      stripeCustomerId: String(subscription.customer || ""),
      stripeSubscriptionId: subscription.id,
      stripeCheckoutSessionId: fallback?.sessionId || null,
      updatedAt: nowTs(),
    },
    {merge: true},
  );
};

export const stripeWebhook = onRequest(
  {secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET]},
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed");
      return;
    }

    const signature = request.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) {
      response.status(400).send("Missing Stripe signature");
      return;
    }

    const webhookSecret = STRIPE_WEBHOOK_SECRET.value();
    if (!webhookSecret) {
      response.status(500).send("Stripe webhook secret is not configured");
      return;
    }

    let event: Stripe.Event;
    const stripe = stripeClient();

    try {
      event = stripe.webhooks.constructEvent(request.rawBody, signature, webhookSecret);
    } catch (error) {
      response.status(400).send(`Webhook signature verification failed: ${(error as Error).message}`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = typeof session.subscription === "string" ?
        session.subscription :
        session.subscription?.id;

      await db.doc(`checkoutSessions/${session.id}`).set(
        {
          status: session.status || "complete",
          paymentStatus: session.payment_status || null,
          stripeCustomerId: String(session.customer || ""),
          stripeSubscriptionId: subscriptionId || null,
          customerEmail: session.customer_details?.email || session.customer_email || null,
          amount: typeof session.amount_total === "number" ? session.amount_total / 100 : null,
          currency: session.currency || null,
          completedAt: nowTs(),
          updatedAt: nowTs(),
        },
        {merge: true},
      );

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await writeStripeBillingRecord(subscription, {
          sessionId: session.id,
          amountTotal: session.amount_total,
          currency: session.currency,
          customerEmail: session.customer_details?.email || session.customer_email,
        });
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      await writeStripeBillingRecord(subscription);
    }

    response.json({received: true});
  },
);

export const createStripeCheckoutSession = onCall(
  {cors: callableCors, secrets: [STRIPE_SECRET_KEY]},
  async (request: CallableRequest<CreateStripeCheckoutPayload>) => {
    const planId = normalizeCheckoutPlan(request.data?.planId);
    const billingInterval = normalizeBillingInterval(request.data?.billingInterval);
    const plan = PUBLIC_PRICING_PLANS[planId];
    const amountCents = billingInterval === "yearly" ? plan.yearlyAmountCents : plan.monthlyAmountCents;
    const stripe = stripeClient();
    const returnBase = safeCheckoutReturnBase(request.rawRequest.headers.origin);
    const customerEmail = cleanOptionalString(request.data?.customerEmail, 180) ||
      String(request.auth?.token.email || "");
    const organizationName = cleanOptionalString(request.data?.organizationName, 180);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: `${returnBase}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnBase}/pricing?checkout=cancelled&plan=${planId}`,
      customer_email: customerEmail || undefined,
      client_reference_id: request.auth?.uid || undefined,
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            recurring: {
              interval: billingInterval === "yearly" ? "year" : "month",
            },
            product_data: {
              name: plan.stripeName,
              description: plan.description,
              metadata: {
                app: "innovacare-training",
                planId,
                includedLearners: String(plan.includedLearners),
              },
            },
          },
        },
      ],
      subscription_data: {
        metadata: {
          app: "innovacare-training",
          planId,
          billingInterval,
          organizationName,
          requestedByUid: request.auth?.uid || "",
        },
      },
      metadata: {
        app: "innovacare-training",
        planId,
        billingInterval,
        organizationName,
        requestedByUid: request.auth?.uid || "",
      },
    });

    await db.doc(`checkoutSessions/${session.id}`).set({
      id: session.id,
      planId,
      billingInterval,
      organizationName,
      customerEmail,
      amount: amountCents / 100,
      currency: "usd",
      status: session.status || "created",
      url: session.url,
      requestedByUid: request.auth?.uid || null,
      requestedByEmail: request.auth?.token.email || null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  },
);

async function createOrganizationAdminCore(
  payload: CreateOrganizationAdminPayload,
  actor: ActorIdentity,
): Promise<CreateOrganizationAdminResult> {
  const actorSnap = await db.doc(`users/${actor.uid}`).get();
  const actorRole = String(actorSnap.get("role") || "").trim();
  if (actorRole !== "super_admin") {
    throw new HttpsError("permission-denied", "Super admin access required.");
  }

  const orgName = String(payload.organization?.name || "").trim();
  const orgType = String(payload.organization?.type || "").trim() as "health" | "IT" | "school";
  const plan = String(payload.organization?.plan || "").trim() as "free" | "pro" | "enterprise";
  const orgId = String(payload.organization?.orgId || "").trim();
  const requestedLearnerLimit = payload.organization?.learnerLimit;
  const ownerEmail = String(payload.owner?.email || "").trim().toLowerCase();
  const ownerDisplayName = String(payload.owner?.displayName || "").trim();

  if (!orgName || !ownerEmail) {
    throw new HttpsError("invalid-argument", "Organization name and owner email are required.");
  }

  if (!["health", "IT", "school"].includes(orgType)) {
    throw new HttpsError("invalid-argument", "Invalid organization type.");
  }

  if (!["free", "pro", "enterprise"].includes(plan)) {
    throw new HttpsError("invalid-argument", "Invalid billing plan.");
  }

  const learnerLimit =
    typeof requestedLearnerLimit === "number" && Number.isFinite(requestedLearnerLimit) ?
      requestedLearnerLimit :
      INTERNAL_PLAN_LEARNER_LIMITS[plan];

  try {
    await admin.auth().getUserByEmail(ownerEmail);
    throw new HttpsError("already-exists", "A Firebase Auth user already exists with this email.");
  } catch (error) {
    const code = (error as {code?: string})?.code;
    if (code && code !== "auth/user-not-found") {
      throw error;
    }
  }

  const temporaryPassword = `Tmp-${nanoid(14)}!`;
  let ownerUid = "";

  try {
    const userRecord = await admin.auth().createUser({
      email: ownerEmail,
      password: temporaryPassword,
      displayName: ownerDisplayName || undefined,
    });
    ownerUid = userRecord.uid;

    const orgRef = await db.collection("organizations").add({
      name: orgName,
      type: orgType,
      plan,
      learnerLimit,
      active: payload.organization?.active ?? true,
      ...(orgId ? {orgId} : {}),
      ownerUid,
      ownerEmail,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    });

    await db.doc(`users/${ownerUid}`).set(
      {
        uid: ownerUid,
        email: ownerEmail,
        displayName: ownerDisplayName,
        role: "admin",
        orgId: orgRef.id,
        orgType,
        active: true,
        createdAt: nowTs(),
        updatedAt: nowTs(),
      },
      {merge: true},
    );

    await db.collection("adminLogs").add({
      type: "AUDIT",
      action: "CREATE_ORGANIZATION_WITH_GENERATED_OWNER",
      targetType: "organization",
      targetId: orgRef.id,
      actorUid: actor.uid,
      actorEmail: actor.email,
      message: `Organization ${orgName} created with generated admin ${ownerEmail}`,
      severity: "info",
      meta: {
        orgName,
        orgType,
        plan,
        ownerUid,
        ownerEmail,
      },
      createdAt: nowTs(),
    });

    return {
      orgId: orgRef.id,
      ownerUid,
      ownerEmail,
      temporaryPassword,
    };
  } catch (error) {
    if (ownerUid) {
      await admin.auth().deleteUser(ownerUid).catch(() => null);
      await db.doc(`users/${ownerUid}`).delete().catch(() => null);
    }
    throw error;
  }
}

async function createManagedUserCore(
  payload: CreateManagedUserPayload,
  actor: ActorIdentity,
): Promise<CreateManagedUserResult> {
  const actorSnap = await db.doc(`users/${actor.uid}`).get();
  if (!actorSnap.exists) {
    throw new HttpsError("permission-denied", "Administrator profile not found.");
  }

  const actorRole = String(actorSnap.get("role") || "").trim();
  const actorOrgId = String(actorSnap.get("orgId") || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const displayName = String(payload.displayName || "").trim();
  const role = String(payload.role || "").trim() as ManagedUserRole;
  const requestedOrgId = String(payload.orgId || "").trim();
  const isSuperAdmin = ["super_admin", "superAdmin"].includes(actorRole);
  const isOrganizationAdmin = actorRole === "admin";

  if (!isSuperAdmin && !isOrganizationAdmin) {
    throw new HttpsError("permission-denied", "Administrator access required.");
  }

  if (!email || !requestedOrgId) {
    throw new HttpsError("invalid-argument", "Email and organization are required.");
  }

  if (!["admin", "manager", "learner"].includes(role)) {
    throw new HttpsError("invalid-argument", "Invalid user role.");
  }

  if (isOrganizationAdmin && !["manager", "learner"].includes(role)) {
    throw new HttpsError("permission-denied", "Organization admins can create managers and learners only.");
  }

  const targetOrgId = isSuperAdmin ? requestedOrgId : actorOrgId;
  if (!targetOrgId || (isOrganizationAdmin && requestedOrgId !== actorOrgId)) {
    throw new HttpsError("permission-denied", "You can only create users in your organization.");
  }

  const orgSnap = await db.doc(`organizations/${targetOrgId}`).get();
  if (!orgSnap.exists) {
    throw new HttpsError("not-found", "Organization not found.");
  }

  if (role === "learner") {
    await enforceLearnerSeatLimit(targetOrgId, orgSnap);
  }

  try {
    await admin.auth().getUserByEmail(email);
    throw new HttpsError("already-exists", "A Firebase Auth user already exists with this email.");
  } catch (error) {
    const code = (error as {code?: string})?.code;
    if (code && code !== "auth/user-not-found") {
      throw error;
    }
  }

  const temporaryPassword = `Tmp-${nanoid(14)}!`;
  let uid = "";

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password: temporaryPassword,
      displayName: displayName || undefined,
    });
    uid = userRecord.uid;

    await db.doc(`users/${uid}`).set({
      uid,
      email,
      displayName,
      role,
      orgId: targetOrgId,
      orgType: orgSnap.get("type") || null,
      onboardingSource: isSuperAdmin ? "super-admin-created" : "organization-admin-created",
      active: true,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      totalAppSeconds: 0,
    });

    await db.collection("adminLogs").add({
      type: "AUDIT",
      action: "CREATE_MANAGED_USER",
      targetType: "user",
      targetId: uid,
      actorUid: actor.uid,
      actorEmail: actor.email,
      message: `Managed user created: ${email}`,
      severity: "info",
      meta: {email, displayName, role, orgId: targetOrgId},
      createdAt: nowTs(),
    });

    return {
      uid,
      email,
      displayName,
      role,
      orgId: targetOrgId,
      temporaryPassword,
    };
  } catch (error) {
    if (uid) {
      await admin.auth().deleteUser(uid).catch(() => null);
      await db.doc(`users/${uid}`).delete().catch(() => null);
    }
    throw error;
  }
}

async function createSmartReminderEvent(params: {
  eventId: string;
  notification: FirebaseFirestore.DocumentData;
  event: FirebaseFirestore.DocumentData;
}): Promise<"created" | "existing"> {
  try {
    await db.doc(`smartReminderEvents/${params.eventId}`).create({
      ...params.event,
      createdAt: nowTs(),
    });
  } catch (error) {
    const code = (error as {code?: number | string})?.code;
    if (code === 6 || code === "already-exists") return "existing";
    throw error;
  }

  await db.collection("notifications").add(params.notification);
  return "created";
}

async function loadReminderCourses(enrollments: ReminderEnrollmentDoc[]) {
  const courseIds = Array.from(new Set(enrollments.map((enr) => String(enr.courseId || "")).filter(Boolean)));
  const courseMap = new Map<string, ReminderCourseDoc>();

  for (const courseId of courseIds) {
    const snap = await db.doc(`courses/${courseId}`).get();
    if (snap.exists) courseMap.set(courseId, snap.data() as ReminderCourseDoc);
  }

  return courseMap;
}

async function loadReminderOrgPeople(orgId: string) {
  const usersSnap = await db.collection("users").where("orgId", "==", orgId).get();
  const learners: ReminderLearnerDoc[] = [];
  const managers: ReminderLearnerDoc[] = [];

  usersSnap.forEach((docSnap) => {
    const data = {id: docSnap.id, ...docSnap.data()} as ReminderLearnerDoc;
    const role = String(data.role || "");
    if (role === "learner") learners.push(data);
    if (role === "admin" || role === "manager") managers.push(data);
  });

  return {learners, managers};
}

async function scanReminderOrganization(
  orgId: string,
  settings: Required<SmartReminderSettings>,
): Promise<SmartReminderScanResult> {
  const result: SmartReminderScanResult = {
    orgsScanned: 1,
    learnerNotifications: 0,
    managerNotifications: 0,
    remindersCreated: 0,
    skippedExisting: 0,
  };

  if (!settings.enabled) return result;

  const [{learners, managers}, enrollmentsSnap] = await Promise.all([
    loadReminderOrgPeople(orgId),
    db.collectionGroup("enrollments").where("orgId", "==", orgId).get(),
  ]);

  const enrollments: ReminderEnrollmentDoc[] = [];
  enrollmentsSnap.forEach((docSnap) => enrollments.push(docSnap.data() as ReminderEnrollmentDoc));

  const courseMap = await loadReminderCourses(enrollments);
  const learnerMap = new Map(learners.map((learner) => [learner.id, learner]));
  const today = dateKey();
  const now = Date.now();
  let overdueForEscalation = 0;
  let inactiveForEscalation = 0;

  for (const enrollment of enrollments) {
    const uid = String(enrollment.uid || "");
    const courseId = String(enrollment.courseId || "");
    const status = String(enrollment.status || "assigned");
    if (!uid || !courseId || status === "completed") continue;

    const course = courseMap.get(courseId);
    const dueTs = reminderDueTs(enrollment, course, settings);
    if (!dueTs) continue;

    const daysUntilDue = Math.ceil((dueTs - now) / REMINDER_DAY_MS);
    const learner = learnerMap.get(uid);
    const courseTitle = String(course?.title || courseId);
    let type: "upcoming_due" | "overdue" | "" = "";

    if (settings.overdueEnabled && dueTs < now) {
      type = "overdue";
    } else if (
      settings.upcomingDueEnabled &&
      daysUntilDue >= 0 &&
      daysUntilDue <= settings.upcomingDueDays
    ) {
      type = "upcoming_due";
    }

    if (!type) continue;

    const eventId = sanitizeIdPart(`${today}_${orgId}_${uid}_${courseId}_${type}`);
    const isOverdue = type === "overdue";
    const title = isOverdue ? "Training overdue" : "Training due soon";
    const body = isOverdue ?
      `${courseTitle} is overdue. Please complete it as soon as possible.` :
      `${courseTitle} is due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}.`;
    const created = await createSmartReminderEvent({
      eventId,
      notification: notificationBase(title, body, uid, isOverdue ? "critical" : "warning"),
      event: {
        type,
        orgId,
        uid,
        learnerName: learner ? learnerName(learner) : uid,
        courseId,
        courseTitle,
        dueAt: admin.firestore.Timestamp.fromMillis(dueTs),
        dateKey: today,
      },
    });

    if (created === "created") {
      result.learnerNotifications++;
      result.remindersCreated++;
    } else {
      result.skippedExisting++;
    }

    if (isOverdue && Math.abs(daysUntilDue) >= settings.overdueEscalationDays) {
      overdueForEscalation++;
    }
  }

  if (settings.inactiveEnabled) {
    const inactiveCutoff = now - settings.inactiveDays * REMINDER_DAY_MS;
    for (const learner of learners) {
      const lastActivity = Math.max(
        epochMs(learner.activityUpdatedAt) || 0,
        epochMs(learner.lastSeenAt) || 0,
        epochMs(learner.lastLoginAt) || 0,
      );
      if (lastActivity && lastActivity >= inactiveCutoff) continue;

      const eventId = sanitizeIdPart(`${today}_${orgId}_${learner.id}_inactive`);
      const created = await createSmartReminderEvent({
        eventId,
        notification: notificationBase(
          "Training activity reminder",
          "Please sign in and review your assigned learning activities.",
          learner.id,
          "info",
        ),
        event: {
          type: "inactive",
          orgId,
          uid: learner.id,
          learnerName: learnerName(learner),
          lastActivityAt: lastActivity ? admin.firestore.Timestamp.fromMillis(lastActivity) : null,
          dateKey: today,
        },
      });

      if (created === "created") {
        result.learnerNotifications++;
        result.remindersCreated++;
        inactiveForEscalation++;
      } else {
        result.skippedExisting++;
      }
    }
  }

  if (settings.managerEscalationEnabled && managers.length && (overdueForEscalation || inactiveForEscalation)) {
    for (const manager of managers) {
      const eventId = sanitizeIdPart(`${today}_${orgId}_${manager.id}_manager_escalation`);
      const created = await createSmartReminderEvent({
        eventId,
        notification: {
          ...notificationBase(
            "Learner follow-up needed",
            `${overdueForEscalation} overdue and ${inactiveForEscalation} inactive learner items need review.`,
            manager.id,
            overdueForEscalation ? "critical" : "warning",
          ),
          link: "/manager/compliance-matrix",
        },
        event: {
          type: "manager_escalation",
          orgId,
          uid: manager.id,
          overdueForEscalation,
          inactiveForEscalation,
          dateKey: today,
        },
      });

      if (created === "created") {
        result.managerNotifications++;
        result.remindersCreated++;
      } else {
        result.skippedExisting++;
      }
    }
  }

  return result;
}

async function scanSmartReminders(targetOrgId?: string | null): Promise<SmartReminderScanResult> {
  const totals: SmartReminderScanResult = {
    orgsScanned: 0,
    learnerNotifications: 0,
    managerNotifications: 0,
    remindersCreated: 0,
    skippedExisting: 0,
  };

  const orgsSnap = targetOrgId ?
    await db.collection("organizations").where(admin.firestore.FieldPath.documentId(), "==", targetOrgId).get() :
    await db.collection("organizations").where("active", "!=", false).get();

  for (const orgDoc of orgsSnap.docs) {
    const settingsSnap = await orgDoc.ref.collection("settings").doc("reminders").get();
    if (!settingsSnap.exists) continue;
    const settings = mergeReminderSettings(settingsSnap.data());
    const result = await scanReminderOrganization(orgDoc.id, settings);
    totals.orgsScanned += result.orgsScanned;
    totals.learnerNotifications += result.learnerNotifications;
    totals.managerNotifications += result.managerNotifications;
    totals.remindersCreated += result.remindersCreated;
    totals.skippedExisting += result.skippedExisting;
  }

  return totals;
}

async function resolveSmartReminderOrg(
  actorUid: string,
  requestedOrgIdRaw?: string | null,
) {
  const actorSnap = await db.doc(`users/${actorUid}`).get();
  const actorRole = String(actorSnap.get("role") || "");
  const actorOrgId = String(actorSnap.get("orgId") || "");
  const requestedOrgId = String(requestedOrgIdRaw || actorOrgId || "").trim();
  const isSuperAdmin = ["super_admin", "superAdmin"].includes(actorRole);

  if (!requestedOrgId) {
    throw new HttpsError("invalid-argument", "Organization is required.");
  }

  if (!isSuperAdmin && (!["admin", "manager"].includes(actorRole) || requestedOrgId !== actorOrgId)) {
    throw new HttpsError("permission-denied", "You can run reminders for your organization only.");
  }

  return requestedOrgId;
}

export const runSmartReminderScan = onCall(
  {
    cors: callableCors,
  },
  async (request: CallableRequest<{orgId?: string | null}>): Promise<SmartReminderScanResult> => {
    const actorUid = request.auth?.uid;
    if (!actorUid) throw new HttpsError("unauthenticated", "Sign in required.");

    const requestedOrgId = await resolveSmartReminderOrg(actorUid, request.data?.orgId);
    return scanSmartReminders(requestedOrgId);
  },
);

export const processSmartReminderScanRequest = onDocumentCreated(
  "smartReminderScanRequests/{requestId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const requestDoc = snap.data() as SmartReminderScanRequestDoc;
    if (requestDoc.status && requestDoc.status !== "pending") return;

    try {
      await snap.ref.update({
        status: "processing",
        startedAt: nowTs(),
        updatedAt: nowTs(),
      });

      const actorUid = String(requestDoc.requestedByUid || "");
      if (!actorUid) throw new HttpsError("unauthenticated", "Request is missing actor.");
      const orgId = await resolveSmartReminderOrg(actorUid, requestDoc.orgId);
      const result = await scanSmartReminders(orgId);

      await snap.ref.update({
        status: "completed",
        result,
        completedAt: nowTs(),
        updatedAt: nowTs(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Smart reminder scan failed.";
      await snap.ref.update({
        status: "failed",
        error: {message},
        failedAt: nowTs(),
        updatedAt: nowTs(),
      });
    }
  },
);

export const scheduledSmartReminderScan = onSchedule("every day 07:00", async () => {
  await scanSmartReminders();
});

/* ─────────── Callable: gradeExam ───────────
   Reads questions from:
     /courses/{courseId}/exams/{examId}/questions/{qid}
   Reads correct answers from staff-only:
     /courses/{courseId}/exams/{examId}/answerKey/{qid}  -> { correctIds: string[] }
   Returns grading details and marks enrollment completed on pass.
*/
async function gradeExamForUser(uid: string, payload: GradeExamPayload): Promise<GradeExamResultPayload> {
  const courseId = String(payload?.courseId || "").trim();
  const examId = String(payload?.examId || "").trim();
  const answers = (payload?.answers ?? {}) as Record<string, string[]>;

  if (!courseId || !examId || typeof answers !== "object") {
    throw new HttpsError("invalid-argument", "courseId, examId, answers are required.");
  }

  const examRef = db.doc(`courses/${courseId}/exams/${examId}`);
  const examSnap = await examRef.get();
  if (!examSnap.exists) throw new HttpsError("not-found", "Exam not found.");
  const exam = (examSnap.data() || {}) as ExamDoc;
  const courseSnap = await db.doc(`courses/${courseId}`).get();
  const course = courseSnap.data() || {};

  const passPct = typeof exam.passPct === "number" ? exam.passPct : 80;
  const pointsPer = typeof exam.pointsPerQuestion === "number" ? exam.pointsPerQuestion : 10;

  const qsSnap = await db
    .collection(`courses/${courseId}/exams/${examId}/questions`)
    .orderBy("order", "asc")
    .get();

  const keySnap = await db.collection(`courses/${courseId}/exams/${examId}/answerKey`).get();

  const keyMap = new Map<string, string[]>();
  keySnap.forEach((doc) => {
    const corr = doc.get("correctIds");
    keyMap.set(doc.id, Array.isArray(corr) ? corr : []);
  });

  let total = 0;
  let correct = 0;

  const details: GradeExamResultPayload["details"] = [];

  qsSnap.forEach((qdoc) => {
    const q = (qdoc.data() || {}) as QuestionDoc;
    const qid = qdoc.id;

    const your = Array.isArray(answers[qid]) ? answers[qid] : [];
    const correctIds = keyMap.get(qid) || [];

    total += 1;
    const ok = setEq([...your].sort(), [...correctIds].sort());
    if (ok) correct += 1;

    details.push({
      id: qid,
      order: typeof q.order === "number" ? q.order : total,
      prompt: typeof q.prompt === "string" ? q.prompt : "",
      your,
      correct: correctIds,
      isCorrect: ok,
      explanation: typeof q.explanation === "string" ? q.explanation : undefined,
    });
  });

  const percent = total ? Math.round((correct / total) * 100) : 0;
  const passed = percent >= passPct;
  const honor = honorFromScore(percent);
  const pointsAwarded = pointsFromScore(percent);
  const courseTitle = typeof course.title === "string" ? course.title : courseId;
  const rawHours = typeof course.ceCredit === "number" ? course.ceCredit :
    typeof course.durationMin === "number" ? course.durationMin : 0;
  const normalizedHours = rawHours > 24 ? Math.round((rawHours / 60) * 100) / 100 : rawHours;
  const issuedAt = new Date();
  const y = issuedAt.getFullYear();
  const m = String(issuedAt.getMonth() + 1).padStart(2, "0");
  const d = String(issuedAt.getDate()).padStart(2, "0");
  const certificateNo = `ICT-${y}${m}${d}-${courseId.slice(0, 6).toUpperCase()}-${uid.slice(0, 6).toUpperCase()}`;
  const rewardBaseId = `${courseId}_${examId}`.replace(/[^\w-]/g, "_");

  if (passed) {
    await db.runTransaction(async (transaction) => {
      const enrollmentRef = db.doc(`users/${uid}/enrollments/${courseId}`);
      const walletRef = db.doc(`users/${uid}/wallet/main`);
      const certificateRewardRef = db.doc(`users/${uid}/rewards/${rewardBaseId}_certificate`);
      const pointsRewardRef = db.doc(`users/${uid}/rewards/${rewardBaseId}_points`);
      const hoursRewardRef = db.doc(`users/${uid}/rewards/${rewardBaseId}_hours`);

      const [walletSnap, pointsRewardSnap] = await Promise.all([
        transaction.get(walletRef),
        transaction.get(pointsRewardRef),
      ]);

      const currentTotalPoints = Number(walletSnap.get("totalPoints") ?? 0);
      const totalPoints = pointsRewardSnap.exists ? currentTotalPoints : currentTotalPoints + pointsAwarded;

      transaction.set(enrollmentRef, {
        uid,
        courseId,
        status: "completed",
        score: percent,
        honor,
        passed: true,
        passPct,
        completedAt: nowTs(),
        gradedAt: nowTs(),
        updatedAt: nowTs(),
        passedExamId: examId,
        examTotal: total,
        examCorrect: correct,
      }, {merge: true});

      transaction.set(certificateRewardRef, {
        type: "certificate",
        uid,
        courseId,
        examId,
        title: `Certificate - ${courseTitle}`,
        description: `Completed with ${honor}`,
        score: percent,
        honor,
        certificateId: `${uid}_${courseId}`.replace(/[^\w-]/g, "_"),
        certificateNo,
        issuedAt: nowTs(),
        issuedBy: "system",
        status: "active",
      }, {merge: true});

      transaction.set(pointsRewardRef, {
        type: "points",
        uid,
        courseId,
        examId,
        title: `Points - ${courseTitle}`,
        description: `Awarded for completion (${honor})`,
        points: pointsAwarded,
        score: percent,
        honor,
        issuedAt: nowTs(),
        issuedBy: "system",
        status: "active",
      }, {merge: true});

      transaction.set(hoursRewardRef, {
        type: "credit_hours",
        uid,
        courseId,
        examId,
        title: `Training Hours - ${courseTitle}`,
        description: "Credits earned",
        hours: normalizedHours,
        creditUnit: "Hours",
        score: percent,
        honor,
        issuedAt: nowTs(),
        issuedBy: "system",
        status: "active",
      }, {merge: true});

      transaction.set(walletRef, {
        uid,
        totalPoints,
        updatedAt: nowTs(),
      }, {merge: true});
    });
  } else {
    await db.doc(`users/${uid}/enrollments/${courseId}`).set({
      uid,
      courseId,
      score: percent,
      honor,
      passed: false,
      passPct,
      gradedAt: nowTs(),
      updatedAt: nowTs(),
      passedExamId: examId,
      examTotal: total,
      examCorrect: correct,
    }, {merge: true});
  }

  return {
    courseId,
    examId,
    total,
    correct,
    percent,
    passPct,
    passed,
    honor,
    pointsPerQuestion: pointsPer,
    details,
  };
}

export const processExamSubmission = onDocumentCreated(
  "users/{uid}/examSubmissions/{submissionId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const uid = String(event.params.uid || "");
    const data = snap.data() as GradeExamPayload & {uid?: string; status?: string};

    if (!uid || data.uid !== uid || data.status !== "pending") {
      await snap.ref.set({
        status: "failed",
        error: {message: "Invalid exam submission."},
        updatedAt: nowTs(),
      }, {merge: true});
      return;
    }

    try {
      await snap.ref.set({status: "processing", updatedAt: nowTs()}, {merge: true});
      let officialApplicationRef: FirebaseFirestore.DocumentReference | null = null;
      let officialApplicationData: FirebaseFirestore.DocumentData | null = null;
      if (data.officialApplicationId) {
        officialApplicationRef = db.collection("candidateApplications").doc(String(data.officialApplicationId));
        const officialApplicationSnap = await officialApplicationRef.get();
        officialApplicationData = officialApplicationSnap.exists ? officialApplicationSnap.data() || null : null;
        const allowedStatuses = ["eligible", "approved_for_exam"];
        if (
          !officialApplicationData ||
          officialApplicationData.candidateUserId !== uid ||
          !allowedStatuses.includes(String(officialApplicationData.status || "")) ||
          (data.certificationSessionId && officialApplicationData.sessionId !== data.certificationSessionId)
        ) {
          throw new Error("This official exam requires an approved candidate application.");
        }
      }
      const result = await gradeExamForUser(uid, data);
      await snap.ref.set({
        status: "graded",
        result,
        gradedAt: nowTs(),
        updatedAt: nowTs(),
      }, {merge: true});
      if (officialApplicationRef && officialApplicationData) {
        await officialApplicationRef.set({
          status: "exam_completed",
          examResult: result,
          examCompletedAt: nowTs(),
          lastExamSubmissionId: snap.id,
          certificationSessionId: data.certificationSessionId || officialApplicationData.sessionId || null,
          updatedAt: nowTs(),
        }, {merge: true});
        await db.collection("certificationAuditLogs").add({
          organizationId: officialApplicationData.organizationId || null,
          actorUid: uid,
          action: "certification.exam.completed",
          targetType: "candidateApplication",
          targetId: officialApplicationRef.id,
          meta: {
            courseId: data.courseId,
            examId: data.examId,
            submissionId: snap.id,
            passed: result.passed,
            percent: result.percent,
          },
          createdAt: nowTs(),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to grade exam.";
      await snap.ref.set({
        status: "failed",
        error: {message},
        updatedAt: nowTs(),
      }, {merge: true});
    }
  },
);

export const gradeExam = onCall(
  {
    cors: callableCors,
    invoker: "public",
  },
  async (request: CallableRequest<GradeExamPayload>) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    return gradeExamForUser(uid, request.data);
  },
);

/* ─────────── Certificate generator (helper) ───────────
   You can call it from another callable if you want certificates on pass.
*/
async function generateCertificate(
  uid: string,
  courseId: string,
  examId: string,
  scorePct: number,
) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 396]); // landscape small
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawText("Certificate of Completion", {x: 170, y: 320, size: 20, font});
  page.drawText(`Awarded to: ${uid}`, {x: 60, y: 260, size: 14, font});
  page.drawText(`Course: ${courseId}`, {x: 60, y: 230, size: 12, font});
  page.drawText(`Exam: ${examId}   Score: ${scorePct}%`, {x: 60, y: 200, size: 12, font});

  const bytes = await pdf.save();
  const path = `certificates/${uid}_${courseId}_${Date.now()}.pdf`;
  const bucket = storage.bucket();
  const file = bucket.file(path);

  await file.save(Buffer.from(bytes), {contentType: "application/pdf"});
  const [url] = await file.getSignedUrl({
    action: "read",
    // 1 year
    expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
  });

  const token = nanoid(12);
  const certRef = db.collection("certificates").doc();
  await certRef.set({
    id: certRef.id,
    uid,
    courseId,
    examId,
    issuedAt: admin.firestore.FieldValue.serverTimestamp(),
    scorePct,
    verifyToken: token,
    fileUrl: url,
  });

  return url;
}

/* ─────────── Optional callable: generateCertificateForResult ───────────
   Call this after a successful pass if you want a certificate URL.
*/
export const generateCertificateForResult = onCall(
  async (request: CallableRequest<{ courseId: string; examId: string; scorePct: number }>) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

    const courseId = String(request.data?.courseId || "").trim();
    const examId = String(request.data?.examId || "").trim();
    const scorePct = Number(request.data?.scorePct ?? 0);

    if (!courseId || !examId) {
      throw new HttpsError("invalid-argument", "courseId, examId required.");
    }
    if (Number.isNaN(scorePct)) {
      throw new HttpsError("invalid-argument", "scorePct must be a number.");
    }

    const url = await generateCertificate(uid, courseId, examId, scorePct);
    return {url};
  },
);

export const createOrganizationAdmin = onCall(
  {
    cors: callableCors,
    invoker: "public",
  },
  async (request: CallableRequest<OrganizationAdminCallablePayload>) => {
    const actorUid = request.auth?.uid;
    if (!actorUid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    if ("operation" in request.data && request.data.operation === "createManagedUser") {
      return createManagedUserCore(request.data, {
        uid: actorUid,
        email: typeof request.auth?.token?.email === "string" ? request.auth.token.email : undefined,
      });
    }

    return createOrganizationAdminCore(request.data as CreateOrganizationAdminPayload, {
      uid: actorUid,
      email: typeof request.auth?.token?.email === "string" ? request.auth.token.email : undefined,
    });
  },
);

export const createOrgUser = onCall(
  {
    cors: callableCors,
  },
  async (request: CallableRequest<CreateManagedUserPayload>) => {
    const actorUid = request.auth?.uid;
    if (!actorUid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    return createManagedUserCore(request.data, {
      uid: actorUid,
      email: typeof request.auth?.token?.email === "string" ? request.auth.token.email : undefined,
    });
  },
);

export const processOrganizationAdminCreateRequest = onDocumentCreated(
  "organizationAdminCreateRequests/{requestId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const requestDoc = snap.data() as CreateOrganizationAdminRequestDoc;
    if (requestDoc.status && requestDoc.status !== "pending") return;

    try {
      await snap.ref.update({
        status: "processing",
        startedAt: nowTs(),
        updatedAt: nowTs(),
      });

      const result = await createOrganizationAdminCore({
        organization: requestDoc.organization,
        owner: requestDoc.owner,
      }, {
        uid: String(requestDoc.requestedByUid || ""),
        email: requestDoc.requestedByEmail,
      });

      await snap.ref.update({
        status: "completed",
        result,
        completedAt: nowTs(),
        updatedAt: nowTs(),
      });
    } catch (error) {
      const message = error instanceof HttpsError ? error.message : "Failed to create organization admin.";
      const code = error instanceof HttpsError ? error.code : "internal";

      await snap.ref.update({
        status: "failed",
        error: {message, code},
        failedAt: nowTs(),
        updatedAt: nowTs(),
      });
    }
  },
);

export const processCourseAssignmentBackfillRequest = onDocumentCreated(
  "courseAssignmentBackfillRequests/{requestId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const requestDoc = snap.data() as CourseAssignmentBackfillRequestDoc;
    if (requestDoc.status && requestDoc.status !== "pending") return;

    try {
      await snap.ref.update({
        status: "processing",
        startedAt: nowTs(),
        updatedAt: nowTs(),
      });

      const assignmentsSnap = await db.collection("organizationCourseAssignments").get();
      const pathAssignmentsSnap = await db.collection("organizationLearningPathAssignments").get();
      const courseOrgIds = new Map<string, Set<string>>();
      const pathOrgIds = new Map<string, Set<string>>();
      const validOrgCoursePairs = new Set<string>();

      assignmentsSnap.forEach((assignmentDoc) => {
        const data = assignmentDoc.data();
        if (data.active === false) return;

        const courseId = String(data.courseId || "").trim();
        const orgId = String(data.orgId || "").trim();
        if (!courseId || !orgId) return;

        const orgIds = courseOrgIds.get(courseId) ?? new Set<string>();
        orgIds.add(orgId);
        courseOrgIds.set(courseId, orgIds);
        validOrgCoursePairs.add(`${orgId}:${courseId}`);
      });

      pathAssignmentsSnap.forEach((assignmentDoc) => {
        const data = assignmentDoc.data();
        if (data.active === false) return;

        const pathId = String(data.pathId || "").trim();
        const orgId = String(data.orgId || "").trim();
        if (!pathId || !orgId) return;

        const orgIds = pathOrgIds.get(pathId) ?? new Set<string>();
        orgIds.add(orgId);
        pathOrgIds.set(pathId, orgIds);
      });

      for (const [pathId, orgIds] of pathOrgIds.entries()) {
        const pathSnap = await db.doc(`learningPaths/${pathId}`).get();
        if (!pathSnap.exists) continue;
        const courseIds = Array.isArray(pathSnap.get("courseIds")) ?
          pathSnap.get("courseIds") as unknown[] :
          [];
        courseIds.forEach((courseIdRaw: unknown) => {
          const courseId = String(courseIdRaw || "").trim();
          if (!courseId) return;
          const courseOrgSet = courseOrgIds.get(courseId) ?? new Set<string>();
          orgIds.forEach((orgId) => {
            courseOrgSet.add(orgId);
            validOrgCoursePairs.add(`${orgId}:${courseId}`);
          });
          courseOrgIds.set(courseId, courseOrgSet);
        });
      }

      const writer = db.bulkWriter();
      let updatedCourses = 0;
      let updatedLearningPaths = 0;
      let removedEnrollments = 0;

      for (const [pathId, orgIds] of pathOrgIds.entries()) {
        writer.set(db.doc(`learningPaths/${pathId}`), {
          assignedOrgIds: Array.from(orgIds).sort(),
          updatedAt: nowTs(),
        }, {merge: true});
        updatedLearningPaths++;
      }

      for (const [courseId, orgIds] of courseOrgIds.entries()) {
        writer.set(db.doc(`courses/${courseId}`), {
          assignedOrgIds: Array.from(orgIds).sort(),
          updatedAt: nowTs(),
        }, {merge: true});
        updatedCourses++;
      }

      const enrollmentsSnap = await db.collectionGroup("enrollments").get();
      enrollmentsSnap.forEach((enrollmentDoc) => {
        const data = enrollmentDoc.data();
        const orgId = String(data.orgId || "").trim();
        const courseId = String(data.courseId || enrollmentDoc.id || "").trim();
        const accessMode = String(data.accessMode || "").trim();

        if (!orgId || !courseId) return;
        if (accessMode === "individual" || accessMode === "approved_individual") return;
        if (validOrgCoursePairs.has(`${orgId}:${courseId}`)) return;

        writer.delete(enrollmentDoc.ref);
        removedEnrollments++;
      });

      await writer.close();

      await snap.ref.update({
        status: "completed",
        updatedCourses,
        updatedLearningPaths,
        assignmentCount: assignmentsSnap.size,
        pathAssignmentCount: pathAssignmentsSnap.size,
        removedEnrollments,
        completedAt: nowTs(),
        updatedAt: nowTs(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Backfill failed.";

      await snap.ref.update({
        status: "failed",
        error: {message},
        failedAt: nowTs(),
        updatedAt: nowTs(),
      });
    }
  },
);

export const createOrganizationAdminHttp = onRequest(
  {
    invoker: "public",
  },
  async (req, res) => {
    if (applyHttpCors(req, res)) {
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({error: {message: "Method not allowed."}});
      return;
    }

    try {
      const authHeader = Array.isArray(req.headers.authorization) ?
        req.headers.authorization[0] :
        req.headers.authorization;
      const requestBody = (req.body?.data ?? req.body ?? {}) as
        CreateOrganizationAdminHttpBody & Partial<CreateManagedUserHttpBody>;
      const idToken = getBearerToken(authHeader) || getBodyIdToken(requestBody);

      if (!idToken) {
        throw new HttpsError("unauthenticated", "Sign in required.");
      }

      const decodedToken = await admin.auth().verifyIdToken(idToken);
      if (requestBody.operation === "createManagedUser") {
        const result = await createManagedUserCore({
          email: String(requestBody.email || ""),
          displayName: requestBody.displayName,
          role: requestBody.role as ManagedUserRole,
          orgId: String(requestBody.orgId || ""),
        }, {
          uid: decodedToken.uid,
          email: typeof decodedToken.email === "string" ? decodedToken.email : undefined,
        });
        res.status(200).json({result});
        return;
      }

      const payload: CreateOrganizationAdminPayload = {
        organization: requestBody.organization,
        owner: requestBody.owner,
      };
      const result = await createOrganizationAdminCore(payload, {
        uid: decodedToken.uid,
        email: typeof decodedToken.email === "string" ? decodedToken.email : undefined,
      });

      res.status(200).json({result});
    } catch (error) {
      const status = getHttpStatusForError(error);
      const message = error instanceof HttpsError ? error.message : "Internal server error.";

      res.status(status).json({
        error: {
          message,
          status: error instanceof HttpsError ? error.code : "internal",
        },
      });
    }
  },
);

export const generateLessonAudio = onCall(
  {
    cors: callableCors,
    invoker: "public",
  },
  async (request: CallableRequest<GenerateLessonAudioPayload>): Promise<GenerateLessonAudioResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const courseId = normalizeTtsString(request.data?.courseId);
    const lessonId = normalizeTtsString(request.data?.lessonId);
    const transcript = normalizeTtsString(request.data?.transcript);
    const title = normalizeTtsString(request.data?.title, "Lesson narration");
    const language = normalizeTtsString(
      request.data?.language || process.env.TTS_DEFAULT_LANGUAGE,
      DEFAULT_TTS_LANGUAGE,
    );
    const voice = normalizeTtsString(
      request.data?.voice || process.env.TTS_DEFAULT_VOICE,
      DEFAULT_TTS_VOICE,
    );
    const speakingRate = normalizeSpeakingRate(request.data?.speakingRate);

    if (!courseId || !lessonId || !transcript) {
      throw new HttpsError("invalid-argument", "courseId, lessonId, and transcript are required.");
    }

    assertSafeStorageSegment(courseId, "courseId");
    assertSafeStorageSegment(lessonId, "lessonId");

    if (transcript.length > MAX_TTS_TRANSCRIPT_CHARS) {
      throw new HttpsError(
        "invalid-argument",
        `Transcript is too long for one audio file. Limit: ${MAX_TTS_TRANSCRIPT_CHARS} characters.`,
      );
    }

    const actor = await requireAdminCourseAccess(uid);
    const courseSnap = await db.doc(`courses/${courseId}`).get();
    if (!courseSnap.exists) {
      throw new HttpsError("not-found", "Course not found.");
    }

    const provider = getTtsProvider();
    let audio;
    try {
      audio = await provider.synthesize({
        transcript,
        languageCode: language,
        voiceName: voice,
        speakingRate,
        audioEncoding: "MP3",
      });
    } catch (error) {
      console.error("generateLessonAudio synthesis failed", error);
      throw new HttpsError("internal", "Audio generation failed. Check Text-to-Speech configuration.");
    }

    const token = nanoid(32);
    const timestamp = Date.now();
    const path = `courses/${courseId}/lessons/${lessonId}/audio/${timestamp}.${audio.extension}`;
    const bucket = storage.bucket();
    const file = bucket.file(path);

    await file.save(audio.audioContent, {
      metadata: {
        contentType: audio.contentType,
        cacheControl: "public, max-age=31536000",
        metadata: {
          firebaseStorageDownloadTokens: token,
          courseId,
          lessonId,
          generatedBy: uid,
          generatedByEmail: actor.email,
          provider: String(process.env.TTS_PROVIDER || "google"),
          voice,
          language,
        },
      },
      resumable: false,
    });

    await db.collection("adminLogs").add({
      type: "AUDIT",
      action: "GENERATE_LESSON_AUDIO",
      targetType: "lesson",
      targetId: lessonId,
      actorUid: uid,
      actorEmail: actor.email,
      message: `Generated lesson audio for ${courseId}/${lessonId}`,
      severity: "info",
      meta: {
        courseId,
        lessonId,
        title,
        voice,
        language,
        speakingRate,
        transcriptLength: transcript.length,
        storagePath: path,
      },
      createdAt: nowTs(),
    });

    return {
      url: buildFirebaseStorageDownloadUrl(bucket.name, path, token),
      path,
      title,
      transcript,
      voice,
      language,
      speakingRate,
      audioEncoding: "MP3",
    };
  },
);

/* ─────────── Optional: seed a demo course/exam ───────────
   Creates a small demo under /courses/demo-course/exams/demo-exam
*/
export const seedDemoData = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const now = admin.firestore.FieldValue.serverTimestamp();

  const courseId = "demo-course";
  const examId = "demo-exam";

  await db.doc(`courses/${courseId}`).set(
    {
      title: "Demo Course",
      subtitle: "Sample",
      description: "Demo content for testing exam runner",
      lang: "EN",
      durationMin: 10,
      ceCredit: 0,
      active: true,
      kind: "Course",
      tags: ["demo"],
      createdAt: now,
      updatedAt: now,
    },
    {merge: true},
  );

  await db.doc(`courses/${courseId}/exams/${examId}`).set(
    {
      title: "Demo Exam",
      available: true,
      passPct: 80,
      pointsPerQuestion: 10,
      createdAt: now,
      updatedAt: now,
    },
    {merge: true},
  );

  await db.doc(`courses/${courseId}/exams/${examId}/questions/q1`).set(
    {
      order: 1,
      mode: "single",
      prompt: "2 + 2 = ?",
      options: [
        {id: "a", text: "3"},
        {id: "b", text: "4"},
        {id: "c", text: "5"},
      ],
      explanation: "Basic math 🙂",
      createdAt: now,
      updatedAt: now,
    },
    {merge: true},
  );

  await db
    .doc(`courses/${courseId}/exams/${examId}/answerKey/q1`)
    .set({correctIds: ["b"]}, {merge: true});

  return {ok: true, courseId, examId};
});

/* ─────────── Transactional email (SendGrid) ───────────
 * Client code queues outgoing email by writing a document to the top-level
 * `mail` collection: { to: string[], message: { subject: string, html: string } }.
 * This trigger picks it up and sends it via SendGrid, then records the result
 * back onto the document for auditing/debugging.
 */
type MailDoc = {
  to?: string[] | string;
  message?: { subject?: string; html?: string; text?: string };
};

export const sendQueuedMail = onDocumentCreated(
  {document: "mail/{mailId}", secrets: [SENDGRID_API_KEY, SENDGRID_FROM_EMAIL]},
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() as MailDoc;
    const to = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];
    const subject = data.message?.subject;
    const html = data.message?.html;

    if (!to.length || !subject || !html) {
      await snap.ref.set(
        {delivery: {state: "ERROR", error: "Missing to/subject/html", updatedAt: nowTs()}},
        {merge: true},
      );
      return;
    }

    try {
      sgMail.setApiKey(SENDGRID_API_KEY.value());
      const attachments = Array.isArray((data.message as {attachments?: unknown[]})?.attachments) ?
        (data.message as {attachments?: Array<{content: string; filename: string; type?: string}>}).attachments :
        undefined;
      await sgMail.send({
        to,
        from: SENDGRID_FROM_EMAIL.value(),
        subject,
        html,
        ...(attachments && attachments.length ? {attachments: attachments.map((a) => ({
          content: a.content,
          filename: a.filename,
          type: a.type || "application/pdf",
          disposition: "attachment",
        }))} : {}),
      });
      await snap.ref.set(
        {delivery: {state: "SUCCESS", updatedAt: nowTs()}},
        {merge: true},
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await snap.ref.set(
        {delivery: {state: "ERROR", error: message, updatedAt: nowTs()}},
        {merge: true},
      );
    }
  },
);

/* ─────────── Transactional SMS (Twilio) ───────────
 * Client code queues outgoing SMS by writing a document to the top-level
 * `sms` collection: { to: string, body: string }.
 * This trigger picks it up and sends it via Twilio, then records the result
 * back onto the document for auditing/debugging.
 */
type SmsDoc = { to?: string; body?: string };

export const sendQueuedSms = onDocumentCreated(
  {document: "sms/{smsId}", secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER]},
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() as SmsDoc;
    const to = data.to;
    const body = data.body;

    if (!to || !body) {
      await snap.ref.set(
        {delivery: {state: "ERROR", error: "Missing to/body", updatedAt: nowTs()}},
        {merge: true},
      );
      return;
    }

    try {
      const client = twilio(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());
      const message = await client.messages.create({
        to,
        from: TWILIO_FROM_NUMBER.value(),
        body,
      });
      await snap.ref.set(
        {delivery: {state: "SUCCESS", sid: message.sid, updatedAt: nowTs()}},
        {merge: true},
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await snap.ref.set(
        {delivery: {state: "ERROR", error: message, updatedAt: nowTs()}},
        {merge: true},
      );
    }
  },
);

function toMillisOrNaN(value: unknown): number {
  if (!value) return NaN;
  const anyValue = value as {toMillis?: () => number};
  if (typeof anyValue.toMillis === "function") return anyValue.toMillis();
  const d = new Date(value as string | number);
  return d.getTime();
}

/* ─────────── Automated renewal reminders ───────────
 * Runs daily; emails/texts members whose membership card is expiring within
 * 30, 7 or 1 day(s), or has just expired. Each window is only notified once
 * per membership cycle, tracked via `renewalRemindersSent` on the document
 * (cleared whenever the membership is renewed/re-issued).
 */
const REMINDER_WINDOWS_DAYS = [30, 7, 1];

function buildReminderEmailHtml(input: {
  name: string;
  membershipNumber: string;
  daysLeft: number;
  expired: boolean;
}): string {
  const headline = input.expired ?
    "Your membership has expired" :
    `Your membership expires in ${input.daysLeft} day${input.daysLeft === 1 ? "" : "s"}`;
  const body = input.expired ?
    "Your membership card and certificate of good standing are no longer active. Please complete your renewal requirements as soon as possible to reactivate them." :
    "To keep your membership and certificate of good standing active without interruption, please complete your renewal requirements before the expiry date.";
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2b4a">
      <h2 style="color:${input.expired ? "#b91c1c" : "#1a3f6f"}">${headline}</h2>
      <p>Hello ${input.name},</p>
      <p>${body}</p>
      <p style="padding:12px 16px;background:#f4f7fb;border-radius:8px">
        <strong>Membership number:</strong> ${input.membershipNumber}
      </p>
      <p>Log in to your candidate profile to review renewal course requirements and submit your renewal.</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">This is an automated reminder from your training portal.</p>
    </div>
  `;
}

export const sendRenewalReminders = onSchedule(
  {
    schedule: "every day 08:00",
    timeZone: "UTC",
    secrets: [SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER],
  },
  async () => {
    const snap = await db.collection("candidateApplications")
      .where("status", "==", "passed")
      .get();

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const card = data.membershipCard;
      const expiresMs = toMillisOrNaN(card?.expiresAt);
      if (!Number.isFinite(expiresMs)) continue;

      const daysLeft = Math.ceil((expiresMs - now) / dayMs);
      const alreadySent: string[] = data.renewalRemindersSent || [];
      const expired = daysLeft <= 0;

      let label: string | null = null;
      if (expired) {
        if (!alreadySent.includes("expired")) label = "expired";
      } else {
        const window = REMINDER_WINDOWS_DAYS.find((w) => daysLeft <= w && !alreadySent.includes(String(w)));
        if (window !== undefined) label = String(window);
      }
      if (label === null) continue;

      const name = data.profileSnapshot?.displayName || "Member";
      const email = data.profileSnapshot?.email;
      const phone = data.profileSnapshot?.phone;
      const membershipNumber = card?.number || "";

      if (email) {
        await db.collection("mail").add({
          to: [email],
          message: {
            subject: expired ?
              "Your membership has expired" :
              `Your membership expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
            html: buildReminderEmailHtml({name, membershipNumber, daysLeft, expired}),
          },
        });
      }

      if (phone) {
        await db.collection("sms").add({
          to: phone,
          body: expired ?
            `Innovacare: Your membership ${membershipNumber} has expired. Please renew to keep your certification active.` :
            `Innovacare: Your membership ${membershipNumber} expires in ${daysLeft} day(s). Please complete renewal requirements soon.`,
        });
      }

      await docSnap.ref.set(
        {renewalRemindersSent: admin.firestore.FieldValue.arrayUnion(label)},
        {merge: true},
      );
    }
  },
);

/* ─────────── Exam Result Emails ───────────
 * Sends immediate result email when exam completes
 * Called from exam runner when learner finishes exam
 */
function buildExamResultEmailHtml(input: {
  learnerName: string;
  examTitle: string;
  score: number;
  passed: boolean;
  passingScore: number;
  durationMinutes: number;
}): string {
  const statusColor = input.passed ? "#22c55e" : "#ef4444";
  const statusText = input.passed ? "PASSED ✓" : "FAILED ✕";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1a2b4a">
      <div style="background:${statusColor};color:white;padding:24px;text-align:center;border-radius:12px 12px 0 0">
        <h1 style="margin:0;font-size:32px">${statusText}</h1>
        <p style="margin:8px 0 0 0;font-size:18px">${input.examTitle}</p>
      </div>

      <div style="background:#f9fafb;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none">
        <p>Hello ${input.learnerName},</p>

        <p>Your exam has been completed and scored. Here are your results:</p>

        <div style="background:white;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid ${statusColor}">
          <p style="margin:0"><strong>Score:</strong> ${input.score}/${100}</p>
          <p style="margin:8px 0 0 0"><strong>Passing Score:</strong> ${input.passingScore}/${100}</p>
          <p style="margin:8px 0 0 0"><strong>Duration:</strong> ${input.durationMinutes} minutes</p>
        </div>

        ${input.passed ?
    "<p style=\"color:#22c55e\"><strong>Congratulations!</strong> You have passed the exam.</p>" :
    "<p style=\"color:#ef4444\"><strong>Not passed.</strong> You may retake. Check your profile for retake dates.</p>"
}

        <p style="margin-top:24px;padding:16px;background:#f0f9ff;border-radius:8px">
          Log in to your training portal for detailed feedback and next steps.
        </p>

        <p style="color:#9ca3af;font-size:12px;margin-top:32px">This is an automated result notification from your training portal.</p>
      </div>
    </div>
  `;
}

/* ─────────── Credential PDFs by Email ───────────
 * Admin queues a request in credentialEmailRequests/{id}; this generates the
 * digital membership card and certificate of good standing as PDFs (pdf-lib)
 * and emails them to the candidate as attachments.
 */
async function buildCredentialPdfs(input: {
  candidateName: string;
  profession: string;
  organizationName: string;
  membershipNumber: string;
  certificateNumber: string;
  issuedAt: Date;
  expiresAt: Date;
}): Promise<{cardB64: string; certB64: string}> {
  const issued = input.issuedAt.toLocaleDateString("en-GB");
  const expires = input.expiresAt.toLocaleDateString("en-GB");

  // Membership card — credit-card-like landscape
  const cardDoc = await PDFDocument.create();
  const card = cardDoc.addPage([340, 214]);
  const bold = await cardDoc.embedFont(StandardFonts.HelveticaBold);
  const reg = await cardDoc.embedFont(StandardFonts.Helvetica);
  const white = rgb(1, 1, 1);
  const lightBlue = rgb(0.78, 0.87, 1);
  card.drawRectangle({x: 0, y: 0, width: 340, height: 214, color: rgb(0.102, 0.227, 0.541)});
  card.drawRectangle({x: 0, y: 168, width: 340, height: 46, color: rgb(0.066, 0.161, 0.42)});
  card.drawText(input.organizationName || "Innovacare", {x: 16, y: 186, size: 13, font: bold, color: white});
  card.drawText("DIGITAL MEMBERSHIP CARD", {x: 16, y: 172, size: 8, font: reg, color: lightBlue});
  card.drawText(input.candidateName.toUpperCase(), {x: 16, y: 128, size: 15, font: bold, color: white});
  if (input.profession) {
    card.drawText(input.profession, {x: 16, y: 112, size: 10, font: reg, color: lightBlue});
  }
  card.drawText(`No: ${input.membershipNumber}`, {x: 16, y: 78, size: 12, font: bold, color: rgb(0.99, 0.75, 0.14)});
  card.drawText(`Issued: ${issued}`, {x: 16, y: 40, size: 9, font: reg, color: white});
  card.drawText(`Valid until: ${expires}`, {x: 16, y: 26, size: 9, font: reg, color: white});
  const cardB64 = Buffer.from(await cardDoc.save()).toString("base64");

  // Certificate of good standing — A4 landscape
  const certDoc = await PDFDocument.create();
  const page = certDoc.addPage([842, 595]);
  const certBold = await certDoc.embedFont(StandardFonts.TimesRomanBold);
  const certReg = await certDoc.embedFont(StandardFonts.TimesRoman);
  const navy = rgb(0.102, 0.227, 0.541);
  const gray = rgb(0.35, 0.4, 0.48);
  page.drawRectangle({x: 20, y: 20, width: 802, height: 555, borderColor: navy, borderWidth: 3});
  page.drawRectangle({x: 30, y: 30, width: 782, height: 535, borderColor: navy, borderWidth: 1});
  const center = (text: string, y: number, size: number, font = certReg, color = gray) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, {x: (842 - w) / 2, y, size, font, color});
  };
  center(input.organizationName || "Innovacare", 520, 22, certBold, navy);
  center("CERTIFICATE OF GOOD STANDING", 470, 30, certBold, navy);
  center("This is to certify that", 420, 14);
  center(input.candidateName, 380, 28, certBold, navy);
  if (input.profession) center(input.profession, 352, 14);
  center("is a member in good standing of this professional organization.", 315, 14);
  center(`Membership No: ${input.membershipNumber}   •   Certificate No: ${input.certificateNumber}`, 275, 13, certBold, navy);
  center(`Issued on ${issued}   •   Valid until ${expires}`, 245, 12);
  center("This digital certificate can be verified online using the membership number.", 120, 10);
  const certB64 = Buffer.from(await certDoc.save()).toString("base64");

  return {cardB64, certB64};
}

export const processCredentialEmailRequest = onDocumentCreated(
  {
    document: "credentialEmailRequests/{requestId}",
    secrets: [SENDGRID_API_KEY, SENDGRID_FROM_EMAIL],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const req = snap.data();
    if (req.status && req.status !== "pending") return;

    try {
      await snap.ref.update({status: "processing", updatedAt: nowTs()});

      const appSnap = await db.doc(`candidateApplications/${String(req.applicationId || "")}`).get();
      if (!appSnap.exists) throw new Error("Application not found.");
      const app = appSnap.data() as FirebaseFirestore.DocumentData;
      const card = app.membershipCard;
      const cert = app.certificate;
      if (!card?.number || !cert?.number) throw new Error("No card/certificate issued on this application yet.");

      const email = app.profileSnapshot?.email;
      if (!email) throw new Error("Candidate has no email on file.");

      let organizationName = "";
      try {
        const orgSnap = await db.doc(`organizations/${app.organizationId}`).get();
        organizationName = orgSnap.get("name") || "";
      } catch {/* best effort */}

      const toDate = (v: unknown): Date => {
        const anyV = v as {toDate?: () => Date};
        if (anyV?.toDate) return anyV.toDate();
        const d = new Date(v as string);
        return isNaN(d.getTime()) ? new Date() : d;
      };

      const {cardB64, certB64} = await buildCredentialPdfs({
        candidateName: app.profileSnapshot?.displayName || "Member",
        profession: app.profileSnapshot?.profession || "",
        organizationName,
        membershipNumber: String(card.number),
        certificateNumber: String(cert.number),
        issuedAt: toDate(card.issuedAt),
        expiresAt: toDate(card.expiresAt),
      });

      sgMail.setApiKey(SENDGRID_API_KEY.value());
      await sgMail.send({
        to: email,
        from: SENDGRID_FROM_EMAIL.value(),
        subject: "Your digital membership card & certificate of good standing",
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2b4a">
            <h2 style="color:#1a3f6f">Your official credentials are attached</h2>
            <p>Hello ${app.profileSnapshot?.displayName || "Member"},</p>
            <p>Please find attached your <strong>digital membership card</strong> and your
            <strong>certificate of good standing</strong> in PDF format.</p>
            <p style="padding:12px 16px;background:#f4f7fb;border-radius:8px">
              <strong>Membership No:</strong> ${card.number}<br/>
              <strong>Certificate No:</strong> ${cert.number}
            </p>
            <p>Your credentials can be verified online at any time using your membership number.</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px">This is an automated message from your training portal.</p>
          </div>
        `,
        attachments: [
          {content: cardB64, filename: `membership-card-${card.number}.pdf`, type: "application/pdf", disposition: "attachment"},
          {content: certB64, filename: `certificate-good-standing-${cert.number}.pdf`, type: "application/pdf", disposition: "attachment"},
        ],
      });

      await snap.ref.update({status: "completed", completedAt: nowTs(), updatedAt: nowTs()});
    } catch (error) {
      await snap.ref.update({
        status: "failed",
        error: {message: (error as Error)?.message || "Failed to email credentials."},
        failedAt: nowTs(),
        updatedAt: nowTs(),
      });
    }
  },
);

/* ─────────── Retake Invitations ───────────
 * When a new onsite exam session is scheduled, invite candidates who failed a
 * previous attempt (same org) to register for the new session.
 */
export const onNewSessionRetakeInvites = onDocumentCreated(
  {document: "examSessions/{sessionId}", secrets: [SENDGRID_API_KEY, SENDGRID_FROM_EMAIL]},
  async (event) => {
    const session = event.data?.data();
    if (!session) return;

    try {
      const failedSnap = await db.collection("examAttempts")
        .where("passed", "==", false)
        .limit(500)
        .get();

      const invited = new Set<string>();
      const sessionDate = (session.sessionDate as {toDate?: () => Date})?.toDate?.() || null;
      const dateLabel = sessionDate ? sessionDate.toLocaleDateString("en-GB") : "soon";

      for (const attemptDoc of failedSnap.docs) {
        const attempt = attemptDoc.data();
        const uid = String(attempt.candidateUid || "");
        const email = attempt.candidateEmail || "";
        if (!uid || invited.has(uid)) continue;

        // Same-organization check + skip candidates who passed since
        const userSnap = await db.doc(`users/${uid}`).get();
        if (!userSnap.exists || userSnap.get("orgId") !== session.orgId) continue;
        const passedSnap = await db.collection("examAttempts")
          .where("candidateUid", "==", uid)
          .where("passed", "==", true)
          .limit(1)
          .get();
        if (!passedSnap.empty) continue;

        const targetEmail = email || userSnap.get("email");
        if (!targetEmail) continue;
        invited.add(uid);

        await db.collection("mail").add({
          to: [targetEmail],
          message: {
            subject: "New exam session available — register for your retake",
            html: `
              <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2b4a">
                <h2 style="color:#1a3f6f">A new exam session is open</h2>
                <p>Hello ${userSnap.get("displayName") || "Candidate"},</p>
                <p>A new onsite exam session has been scheduled for <strong>${dateLabel}</strong>.
                You are eligible to retake the exam.</p>
                <p>Log in to your training portal, open <strong>Onsite Exams</strong>, and register for the new session.
                Remember to submit your documents and bring a photo ID and your account password on exam day.</p>
                <p style="color:#9ca3af;font-size:12px;margin-top:24px">This is an automated message from your training portal.</p>
              </div>
            `,
          },
        });
      }
    } catch (error) {
      console.error("Retake invite error:", error);
    }
  },
);

/* ─────────── Rewards Engine ───────────
 * Awards points and badges automatically:
 *  - Course completed: 50 pts + 1 pt per 10 min of course duration
 *  - Official exam passed: 100 pts (+50 and a badge for a perfect score)
 *  - Milestone badges at 1 / 5 / 10 / 25 completed courses
 * Reward docs use deterministic IDs so retriggering never double-awards.
 */
const COURSE_MILESTONES: Array<{count: number; badge: string}> = [
  {count: 1, badge: "first_course"},
  {count: 5, badge: "five_courses"},
  {count: 10, badge: "ten_courses"},
  {count: 25, badge: "twenty_five_courses"},
];

async function awardReward(
  uid: string,
  rewardId: string,
  reward: Record<string, unknown>,
  points: number,
): Promise<boolean> {
  try {
    await db.doc(`users/${uid}/rewards/${rewardId}`).create({
      ...reward,
      points,
      issuedAt: nowTs(),
    });
  } catch (error) {
    const code = (error as {code?: number | string})?.code;
    if (code === 6 || code === "already-exists") return false; // already awarded
    throw error;
  }
  if (points > 0) {
    await db.doc(`users/${uid}/wallet/main`).set(
      {totalPoints: admin.firestore.FieldValue.increment(points), updatedAt: nowTs()},
      {merge: true},
    );
  }
  return true;
}

export const onCourseCompletedReward = onDocumentUpdated(
  "users/{uid}/enrollments/{enrollmentId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.status === "completed" || after.status !== "completed") return;

    const uid = event.params.uid;
    const courseId = String(after.courseId || event.params.enrollmentId);

    // Course points: 50 base + 1 pt per 10 minutes of duration
    let courseTitle = "";
    let durationMin = 0;
    try {
      const courseSnap = await db.doc(`courses/${courseId}`).get();
      courseTitle = courseSnap.get("title") || "";
      durationMin = Number(courseSnap.get("durationMin") || 0);
    } catch {/* course lookup is best-effort */}

    const points = 50 + Math.min(50, Math.floor(durationMin / 10));
    await awardReward(uid, `course_${courseId}`, {
      type: "points",
      title: courseTitle ? `Course completed: ${courseTitle}` : "Course completed",
      courseId,
    }, points);

    // Milestone badges
    const completedSnap = await db
      .collection(`users/${uid}/enrollments`)
      .where("status", "==", "completed")
      .get();
    const completedCount = completedSnap.size;

    for (const m of COURSE_MILESTONES) {
      if (completedCount >= m.count) {
        await awardReward(uid, `badge_${m.badge}`, {
          type: "badge",
          badge: m.badge,
          title: `Badge: ${m.badge.replace(/_/g, " ")}`,
          courseId: "",
        }, 25);
      }
    }
  },
);

export const onExamPassedReward = onDocumentCreated(
  "examAttempts/{attemptId}",
  async (event) => {
    const attempt = event.data?.data();
    if (!attempt || attempt.passed !== true) return;

    const uid = String(attempt.candidateUid || "");
    if (!uid) return;
    // Only award real user accounts
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) return;

    await awardReward(uid, `exam_${event.params.attemptId}`, {
      type: "points",
      title: "Official exam passed",
      courseId: "",
      score: Number(attempt.score || 0),
    }, 100);

    await awardReward(uid, "badge_exam_passed", {
      type: "badge",
      badge: "exam_passed",
      title: "Badge: exam ace",
      courseId: "",
    }, 25);

    if (Number(attempt.score) === 100) {
      await awardReward(uid, "badge_perfect_score", {
        type: "badge",
        badge: "perfect_score",
        title: "Badge: perfect score",
        courseId: "",
        score: 100,
      }, 50);
    }
  },
);

/* ─────────── Kiosk Candidate Account Creation ───────────
 * A proctor/manager adds a candidate who has no account yet: this creates the
 * Firebase Auth user with an initial password, the users profile, enrolls
 * them in the exam session, and emails/SMS the initial password.
 */
export const processKioskCandidateCreateRequest = onDocumentCreated(
  "kioskCandidateCreateRequests/{requestId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const req = snap.data();
    if (req.status && req.status !== "pending") return;

    try {
      await snap.ref.update({status: "processing", updatedAt: nowTs()});

      const email = String(req.email || "").trim().toLowerCase();
      const name = String(req.name || "").trim();
      const phone = String(req.phone || "").trim();
      const orgId = String(req.orgId || "");
      const sessionId = String(req.sessionId || "");
      if (!email || !orgId || !sessionId) {
        throw new Error("email, orgId and sessionId are required.");
      }

      // The requester must be staff of the same organization
      const requesterSnap = await db.doc(`users/${String(req.requestedByUid || "")}`).get();
      const requesterRole = requesterSnap.get("role");
      if (
        !requesterSnap.exists ||
        requesterSnap.get("orgId") !== orgId ||
        !["manager", "admin", "super_admin", "proctor"].includes(requesterRole)
      ) {
        throw new Error("Requester is not authorized for this organization.");
      }

      const sessionSnap = await db.doc(`examSessions/${sessionId}`).get();
      if (!sessionSnap.exists) throw new Error("Exam session not found.");

      let uid = "";
      let created = false;
      let temporaryPassword = "";

      try {
        const existing = await admin.auth().getUserByEmail(email);
        uid = existing.uid;
      } catch (error) {
        const code = (error as {code?: string})?.code;
        if (code && code !== "auth/user-not-found") throw error;
      }

      if (!uid) {
        const orgSnap = await db.doc(`organizations/${orgId}`).get();
        if (!orgSnap.exists) throw new Error("Organization not found.");

        temporaryPassword = `Exam-${nanoid(10)}`;
        const record = await admin.auth().createUser({
          email,
          password: temporaryPassword,
          displayName: name || undefined,
        });
        uid = record.uid;
        created = true;

        await db.doc(`users/${uid}`).set({
          uid,
          email,
          displayName: name,
          phone: phone || null,
          role: "learner",
          orgId,
          orgType: orgSnap.get("type") || null,
          onboardingSource: "onsite-exam-enrollment",
          active: true,
          createdAt: nowTs(),
          updatedAt: nowTs(),
          totalAppSeconds: 0,
        });
      } else {
        const userSnap = await db.doc(`users/${uid}`).get();
        if (userSnap.exists && userSnap.get("orgId") && userSnap.get("orgId") !== orgId) {
          throw new Error("This email belongs to a user in another organization.");
        }
        if (!userSnap.exists) {
          await db.doc(`users/${uid}`).set({
            uid,
            email,
            displayName: name,
            phone: phone || null,
            role: "learner",
            orgId,
            onboardingSource: "onsite-exam-enrollment",
            active: true,
            createdAt: nowTs(),
            updatedAt: nowTs(),
            totalAppSeconds: 0,
          });
        }
      }

      // Enroll into the exam session (unverified — proctor verifies onsite)
      await db.doc(`examSessions/${sessionId}/candidateVerifications/${uid}`).set({
        candidateUid: uid,
        displayName: name || email,
        email,
        phone: phone || null,
        photoUrl: null,
        verified: false,
        examCompleted: false,
        enrolledAt: nowTs(),
        enrolledBy: String(req.requestedByUid || ""),
      }, {merge: true});

      // Deliver the initial password to the candidate
      if (created && temporaryPassword) {
        await db.collection("mail").add({
          to: [email],
          message: {
            subject: "Your exam account is ready — initial password inside",
            html: `
              <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2b4a">
                <h2 style="color:#1a3f6f">Welcome${name ? ", " + name : ""}!</h2>
                <p>An account has been created for you to take your onsite certification exam.</p>
                <div style="background:#f4f7fb;border-radius:8px;padding:16px;margin:16px 0">
                  <p style="margin:0"><strong>Login email:</strong> ${email}</p>
                  <p style="margin:8px 0 0 0"><strong>Initial password:</strong> ${temporaryPassword}</p>
                </div>
                <p><strong>Important:</strong> bring this password to the exam center — you will use it to log in at the exam station after the proctor verifies your identity.</p>
                <p>We recommend changing your password after your first login to the training portal.</p>
                <p style="color:#9ca3af;font-size:12px;margin-top:24px">This is an automated message from your training portal.</p>
              </div>
            `,
          },
        });
        if (phone) {
          await db.collection("sms").add({
            to: phone,
            body: `Innovacare: Your exam account is ready. Login: ${email} — Initial password: ${temporaryPassword}. Bring it to the exam center.`,
          });
        }
      }

      await snap.ref.update({
        status: "completed",
        result: {uid, created},
        completedAt: nowTs(),
        updatedAt: nowTs(),
      });
    } catch (error) {
      await snap.ref.update({
        status: "failed",
        error: {message: (error as Error)?.message || "Failed to create candidate."},
        failedAt: nowTs(),
        updatedAt: nowTs(),
      });
    }
  },
);

export const onExamCompleted = onDocumentCreated(
  {
    document: "examAttempts/{attemptId}",
    secrets: [SENDGRID_API_KEY, SENDGRID_FROM_EMAIL],
  },
  async (event) => {
    const attempt = event.data?.data();
    if (!attempt) return;

    // Onsite (kiosk) attempts carry a sessionId — their results are published
    // manually by an admin from the Onsite Exam Center, not auto-emailed.
    if (attempt.sessionId) return;

    try {
      // Get learner info
      const userSnap = await db.collection("users").doc(attempt.candidateUid).get();
      const user = userSnap.data();
      if (!user?.email) return;

      // Get exam info
      const sessionSnap = await db.collection("examSessions").doc(attempt.sessionId).get();
      const session = sessionSnap.data();
      if (!session) return;

      // Build and send immediate result email
      const html = buildExamResultEmailHtml({
        learnerName: user.displayName || user.email,
        examTitle: session.examTitle || "Exam",
        score: attempt.score || 0,
        passed: attempt.passed || false,
        passingScore: session.passingScore || 80,
        durationMinutes: session.durationMinutes || 60,
      });

      await db.collection("mail").add({
        to: [user.email],
        message: {
          subject: attempt.passed ?
            `✓ Exam Passed: ${session.examTitle || "Your Exam"}` :
            `✕ Exam Result: ${session.examTitle || "Your Exam"}`,
          html: html,
        },
      });

      // Schedule delayed email (8 hours from now)
      const delayedTime = new Date(Date.now() + 8 * 60 * 60 * 1000);
      await db.collection("mail").add({
        to: [user.email],
        message: {
          subject: `[Final Result] ${session.examTitle || "Your Exam"} - Score: ${attempt.score}%`,
          html: html,
        },
        scheduledTime: delayedTime,
      });
    } catch (error) {
      console.error("Error sending exam result email:", error);
    }
  }
);

/* eslint max-len: ["error", { "code": 120, "ignoreUrls": true }] */
// ─────────── NOTIFICATION TRIGGERS ───────────

/**
 * Trigger when enrollment is created (course assigned).
 * Enrollments live at users/{uid}/enrollments/{courseId} -- NOT under
 * organizations/{orgId}/enrollments -- see EnrollmentService in the
 * client app (shared/services/enrollement.ts).
 */
export const onEnrollmentCreated = onDocumentCreated(
  {document: "users/{uid}/enrollments/{courseId}", secrets: [SENDGRID_API_KEY, SENDGRID_FROM_EMAIL]},
  async (event) => {
    const enrollment = event.data?.data();
    if (!enrollment) return;

    const learnerId = event.params.uid;
    const courseId = event.params.courseId;

    try {
      // Get learner info
      const learnerDoc = await db.collection("users").doc(learnerId).get();
      const learner = learnerDoc.data();
      if (!learner) return;

      const learnerEmail = learner.email as string;
      const learnerName = learner.displayName || learner.email || "Learner";

      // Get course info (top-level 'courses' collection)
      const courseDoc = await db.collection("courses").doc(courseId).get();
      const course = courseDoc.data();
      const courseName = course?.title || "Course";

      // Calculate due date (from enrollment if set, else default 30 days)
      const dueDate = enrollment.dueDate?.toDate?.() ?? (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d;
      })();
      const dueDateStr = dueDate.toLocaleDateString(
        "en-US",
        {year: "numeric", month: "long", day: "numeric"},
      );

      // Send email via SendGrid
      if (learnerEmail) {
        sgMail.setApiKey(SENDGRID_API_KEY.value());
        const template = getNotificationEmailTemplate(
          "course_assigned",
          learnerName,
          courseName,
          dueDateStr,
        );

        await sgMail.send({
          to: learnerEmail,
          from: SENDGRID_FROM_EMAIL.value(),
          subject: template.subject,
          html: template.html,
        });
      }

      // Create in-app notification
      await db.collection("notificationInApp").add({
        learnerId,
        type: "course_assigned",
        title: "New Course Assigned",
        message: `${courseName} has been assigned to you. Due: ${dueDateStr}`,
        icon: "📚",
        actionUrl: "/learner/assignments",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        data: {courseName, dueDate: dueDateStr},
      });
    } catch (error) {
      console.error("Error processing enrollment notification:", error);
    }
  },
);

/**
 * Trigger when enrollment completion is marked.
 * Same path correction as onEnrollmentCreated above.
 */
export const onEnrollmentCompleted = onDocumentUpdated(
  {document: "users/{uid}/enrollments/{courseId}", secrets: [SENDGRID_API_KEY, SENDGRID_FROM_EMAIL]},
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

    // Check if completion status changed to completed
    const wasCompleted = beforeData.completedAt;
    const isCompleted = afterData.completedAt;

    // Already completed or still not completed
    if (wasCompleted || !isCompleted) return;

    const learnerId = event.params.uid;
    const courseId = event.params.courseId;
    const grade = afterData.grade as string | undefined;

    try {
      // Get learner info
      const learnerDoc = await db.collection("users").doc(learnerId).get();
      const learner = learnerDoc.data();
      if (!learner) return;

      const learnerEmail = learner.email as string;
      const learnerName = learner.displayName || learner.email || "Learner";

      // Get course info (top-level 'courses' collection)
      const courseDoc = await db.collection("courses").doc(courseId).get();
      const course = courseDoc.data();
      const courseName = course?.title || "Course";

      // Send email via SendGrid
      if (learnerEmail) {
        sgMail.setApiKey(SENDGRID_API_KEY.value());
        const template = getNotificationEmailTemplate(
          "course_completed",
          learnerName,
          courseName,
          grade,
        );

        await sgMail.send({
          to: learnerEmail,
          from: SENDGRID_FROM_EMAIL.value(),
          subject: template.subject,
          html: template.html,
        });
      }

      // Create in-app notification
      const msg = grade ? ` with grade ${grade}` : "";
      await db.collection("notificationInApp").add({
        learnerId,
        type: "course_completed",
        title: "Course Completed",
        message: `Congratulations! You've completed ${courseName}${msg}`,
        icon: "🎉",
        actionUrl: "/learner/certifications",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        data: {courseName, grade},
      });
    } catch (error) {
      console.error("Error processing completion notification:", error);
    }
  },
);

export {grantManualReward, onWalletUpdated, backfillLeaderboardProjections} from "./rewards-admin";

/**
 * Helper function for notification email templates.
 * @param {string} type - The notification type
 * @param {string} learnerName - The learner's name
 * @param {string} courseName - The course name
 * @param {string} param3 - Optional third parameter
 * @returns {{subject: string; html: string}} Email template
 */
function getNotificationEmailTemplate(
  type: string,
  learnerName: string,
  courseName: string,
  param3?: string,
): {subject: string; html: string} {
  const baseStyle = `
    <style>
      body { font-family: Arial, sans-serif; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #1a3f6f 0%, #00a79d 100%); color: white; padding: 24px; border-radius: 8px; margin-bottom: 24px; }
      .header h1 { margin: 0; font-size: 24px; }
      .content { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 24px; }
      .content p { margin: 12px 0; line-height: 1.6; }
      .info-box { background: white; padding: 16px; border-left: 4px solid #00a79d; margin: 16px 0; border-radius: 4px; }
      .button { display: inline-block; background: linear-gradient(135deg, #1a3f6f, #00a79d); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0; }
      .footer { color: #6b7280; font-size: 12px; text-align: center; margin-top: 24px; }
    </style>
  `;

  if (type === "course_assigned") {
    return {
      subject: `New Course Assigned: ${courseName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>${baseStyle}</head>
          <body>
            <div class="container">
              <div class="header"><h1>📚 New Course Assigned</h1></div>
              <div class="content">
                <p>Hello ${learnerName},</p>
                <p>A new course has been assigned to you:</p>
                <div class="info-box">
                  <strong>Course:</strong> ${courseName}<br>
                  <strong>Due Date:</strong> ${param3}
                </div>
                <p>Start learning now to complete this course on time.</p>
                <a href="https://www.innovacaretrainning.com/learner/assignments" class="button">View Assignments</a>
              </div>
              <div class="footer"><p>© 2026 Innovacare Training. All rights reserved.</p></div>
            </div>
          </body>
        </html>
      `,
    };
  }

  if (type === "course_completed") {
    return {
      subject: `🎉 Course Completed: ${courseName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>${baseStyle}</head>
          <body>
            <div class="container">
              <div class="header"><h1>🎉 Congratulations!</h1></div>
              <div class="content">
                <p>Hello ${learnerName},</p>
                <p>You have successfully completed:</p>
                <div class="info-box">
                  <strong>${courseName}</strong><br>
                  ${param3 ? `Grade: ${param3}` : ""}
                </div>
                <p>Great work! Download your certificate now.</p>
                <a href="https://www.innovacaretrainning.com/learner/certifications" class="button">View Certificates</a>
              </div>
              <div class="footer"><p>© 2026 Innovacare Training. All rights reserved.</p></div>
            </div>
          </body>
        </html>
      `,
    };
  }

  return {subject: "Notification", html: "<p>Notification</p>"};
}
