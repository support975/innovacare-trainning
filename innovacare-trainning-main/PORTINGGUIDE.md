# Porting guide — work done in innovacare-Software/innovacare-trainning (wrong repo)

Context: this work was built in `innovacare-Software/innovacare-trainning`, which turned out
to be the wrong repository (a separate "program" project). The real training platform is
`support975/innovacare-trainning`. This document summarizes everything built so it can be
efficiently re-applied (adapted as needed to that repo's actual current structure — do not
assume file paths match exactly; verify against the real codebase first).

All 5 pieces below were built against an app with this stack: Angular 20 (standalone
components, signals), Firebase (Auth/Firestore/Storage/Functions via `@angular/fire`),
Transloco for i18n, a strict multi-tenant `organizations/{orgId}/...` Firestore model. If
`support975/innovacare-trainning` differs significantly, treat this as a design reference,
not a literal patch.

---

## 1. InnovaLauncher — hardened Electron desktop shell

A separate, self-contained TypeScript/Electron project (`innova-launcher/`) implementing a
Hyperdrive-style secure desktop launcher: validates a signed environment manifest, gates on
minimum client version, runs OIDC + PKCE login in the system browser, opens a locked-down
BrowserWindow restricted to allowed origins.

Key pieces (all under `innova-launcher/src/`):
- `main/signature.ts` + `main/manifest-service.ts`: Ed25519 signature verification (canonical
  JSON, compiled-in public key) before any shape validation; cache last-good manifest for
  offline use; gate launch on `minClientVersion`.
- `main/window-factory.ts` + `main/security-policy.ts`: exact `nodeIntegration:false /
  contextIsolation:true / sandbox:true`, CSP header, deny-by-default permissions, origin-
  allowlisted navigation, certificate-error hard rejection, DevTools disabled when packaged.
- `src/preload/index.ts`: 7 explicitly enumerated `innovaNative` calls, no generic passthrough.
- `main/auth/*`: OIDC discovery + Authorization Code + PKCE via system browser, loopback
  callback on 127.0.0.1 only, refresh token encrypted via `safeStorage`.
- `main/idle-lock.ts`, `main/audit-log.ts`: idle auto-lock with launcher-owned overlay window,
  lock on OS lock-screen/suspend, append-only JSONL audit log (primitives-only schema).
- `electron-builder.yml`: Windows MSI+NSIS, macOS DMG, staged-rollout update feed.
- `scripts/sign-manifest.ts`: dev CLI for Ed25519 keygen + manifest signing.
- 33 Vitest tests covering signature verification, manifest caching, origin matching, idle
  lock timing, OIDC loopback server.

**This is a standalone project** — porting it is just copying the `innova-launcher/` directory
into the real repo. No dependency on the web app's internal structure beyond the `appUrl` it's
configured to load. Full architecture notes + security checklist + "Remaining Work" (signing
key provisioning, HID badge reader, JWKS verification, MSI custom action, backend cookie
integration) are in `innova-launcher/README.md` in the wrong repo — worth copying over too.

---

## 2. Org hierarchy (council / regional sub-orgs)

Lets a Super-Admin-created "council" org create its own child regions (e.g. a national
nursing council with regional divisions), each with full autonomy, while the council gets
**read-only** rollup visibility into its descendants.

- **`org.models.ts`**: `Organization` gains 3 optional fields — `parentOrgId` (direct parent,
  null for top-level), `ancestorOrgIds` (materialized path from root — Firestore rules can't
  do recursive parent lookups), `canCreateSubOrgs` (Super-Admin-only "this org is a council"
  flag). All optional/absent-safe — no backfill needed for existing orgs.
- **`firestore.rules`**: new helpers `orgCanCreateSubOrgs`/`orgAncestorIds`/`isCouncilAdmin`/
  `isCouncilAncestorAdmin` (all using `.get(field, default)` so a missing field == its
  default). `/organizations/{orgId}` create rule extended: a council admin may create a child
  org doc but only with `parentOrgId` == their own org and `ancestorOrgIds` exactly extending
  their own chain (validated server-side). New org can't be born with `canCreateSubOrgs:true`
  (no self-granted nesting). `update`/`delete` stay Super-Admin-only. Read-only
  `isCouncilAncestorAdmin(orgId)` access added to `users`, `courseAssignments`, `enrollments`,
  `progress`, `overdue`, `policyAcknowledgments`, `reports`, `auditLogs` (the collections
  feeding `OrganizationStats`/`OrganizationDashboardStats`).
- Design rationale/scale notes documented in a new `docs/organization-architecture.md` §10 —
  worth writing an equivalent section in the real repo's docs if it has one.

---

## 3. Branding / white-label

Lets any org's own admin self-serve cosmetic branding without Super Admin, while gating
identity-hiding features behind a separate flag.

- **`org.models.ts`**: `Organization.branding?: OrganizationBranding` (`displayName`,
  `logoUrl`, `faviconUrl`, `primaryColor`, `accentColor`, `senderName`, `senderEmail`,
  `supportEmail`, `hidePlatformBranding`, `customDomain`, `customDomainStatus`) and
  `Organization.canWhiteLabel?: boolean`.
- **Two independent capabilities**: cosmetic branding is self-serve for any org admin
  regardless of tier; `canWhiteLabel` (Super-Admin-only, independent of `canCreateSubOrgs`)
  gates only `hidePlatformBranding`/`customDomain`.
- **`customDomain` is a request, not a live toggle**: self-serve write can only set
  `customDomainStatus` to `'none'`/`'pending'`; only Super Admin sets `'active'` once DNS/SSL
  is actually provisioned.
- **`firestore.rules`**: `isValidSelfServeBrandingWrite(orgId)` — caller is that org's own
  admin/manager AND `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['branding','updatedAt'])`.
  Every other field and `delete` stay Super-Admin-only.
- **`storage.rules`**: `organizations/{orgId}/branding/{allPaths=**}` — world-readable (logo
  needs to render before/without auth), writable only by that org's own admin/manager via
  Storage's cross-service `firestore.get()`.
- Branding cascades down the hierarchy (per-field merge: own value, else nearest ancestor's,
  else platform default) — resolved client-side using `ancestorOrgIds` from item 2.

---

## 4. Council admin UI

Follow-up UI to item 2: a council's own org_admin (org.canCreateSubOrgs == true) gets a
`/manager/council` page.

- **`core/organization/services/organization-hierarchy.service.ts`**: `listChildren(parentOrgId)`,
  `createRegion(input)`. Computes `ancestorOrgIds` from the parent, and — important gotcha —
  sets `orgId == doc.id` in the **same** `setDoc` as the hierarchy fields (a follow-up
  `updateDoc` would hit the Super-Admin-only update rule instead of the create rule). Uses
  `doc(collection(afs,'organizations'))` to pre-generate the ref before `setDoc`.
- **`core/organization/services/organization-council-rollup.service.ts`**: reuses the existing
  per-org `OrganizationAdminDashboardService.stats(orgId)` (if the real repo has an equivalent
  — find it and reuse rather than reimplementing stats logic) per region, combines into
  council-wide totals + unweighted average completion rate. Live fan-out reads — fine at
  ~10-region scale; switch to a scheduled Cloud Function pre-aggregate past ~30-50 regions.
- **`features/manager/council/`**: page (region-creation form, regional-admin invite form,
  rollup view) + `council.canmatch.ts` (UX-only guard — real boundary is firestore.rules).
  Manager shell shows a nav entry only when the signed-in admin's own org is a council.
- **Cloud Function change** (`functions/src/index.ts`, function `createOrgUser` or equivalent):
  added optional `targetOrgId` so a council admin can create a user — including `role:'admin'`
  — in one of its own descendant regions, mirroring the Firestore rule's
  `isCouncilAdmin`/`ancestorOrgIds` check server-side. **Critical existing behavior to
  preserve**: an org_admin creating an admin *within their own org* must stay super_admin-only
  — the cross-org carve-out only applies when `targetOrgId` differs from caller's own org AND
  the ancestor check passes. Check whatever the real repo's equivalent user-creation function
  looks like before assuming this pattern transfers directly.

---

## 5. Dev Firebase environment + build config

- Added `enviroment.development.ts` (mirroring whatever the real repo's environment-file
  shape is) populated with a dev Firebase project's web config.
- Added an Angular `fileReplacements` entry on the `development` build configuration in
  `angular.json` so `ng serve`/`ng build --configuration development` actually swap in the dev
  config — **check whether the real repo already has this wired**; the wrong repo didn't, which
  was itself a notable finding (production and any "staging" config were literally identical
  compiled bundles despite separate Firestore-rules-deploy targets).
- Added a `dev` project alias in `.firebaserc`.

**Important unresolved finding from the wrong repo, worth checking in the real one too**: the
app's actual runtime Firebase SDK config pointed at a project (`innovacare-stripe`) different
from `.firebaserc`'s default (`innovacare-training`) — i.e. Firestore rules were being deployed
to a project the live app might never actually talk to. Worth verifying this isn't *also* true
in `support975/innovacare-trainning` before assuming its rules deployments are effective.

---

## Recommended order to re-apply in the real repo

1. First, audit `support975/innovacare-trainning`'s actual current structure — do NOT assume
   file paths/model names match. It may have a different (or no) multi-tenant org model, a
   different i18n setup, different Cloud Functions.
2. Port item 5 (dev environment) first — lowest risk, needed to safely test everything else.
3. Port item 2 (org hierarchy schema/rules) — foundation for items 3 and 4.
4. Port item 3 (branding schema/rules) — independent of 2, but references it for cascading.
5. Port item 4 (council UI) — depends on 2 and whatever the real repo's dashboard/stats
   services look like.
6. Port item 1 (InnovaLauncher) — fully standalone, can happen anytime, lowest coupling.

Also worth doing early in the real repo, independent of anything above: the i18n gap found
during this session (Transloco wired into only ~4 shell components out of the whole app, most
feature pages never actually translated) — check if the same gap exists there.
