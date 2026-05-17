# Implementation Plan: WhatsApp Bulk Messaging Microservice (v25)

This plan outlines the steps to transform the current "partial setup" into a fully functional, high-throughput bulk messaging software that acts as a standalone microservice using **Meta Graph API v25.0**.

---

## Phase 1: Stabilization & Refactoring
**Objective**: Fix codebase inconsistencies and prepare for v25 integration.

1.  **Codebase Cleanup**:
    - Rename `src/whatsup` to `src/whatsapp` (correcting typo).
    - Refactor `Template.schema1.ts` to `template.schema.ts` and ensure model consistency.
2.  **Environment Calibration**:
    - Update `.env` to target `v25.0` (Meta's 2026 Graph API version).
    - Validate `WHATSAPP_PHONE_ID` and `WHATSAPP_TOKEN` for the new version.
3.  **Schema Enhancements**:
    - **Template Schema**: Add `variableCount` (number of placeholders in Body/Header) and `exampleValues` to ensure template integrity before queuing.
    - **Message Schema**: Add a `variables` field (JSON/Array) to store dynamic values for each recipient.
    - **Campaign Schema**: Add `metadata` for tracking origin service/system.

---

## Phase 2: BullMQ & Redis Scaling (High-Throughput)
**Objective**: Build a SaaS-grade sending engine with parallel processing.

1.  **Queue Implementation**:
    - Add **BullMQ** for job persistence and horizontal scaling.
    - Set the **Message ID as Job ID** for atomic idempotency.
2.  **Rate Limiting (MANDATORY for v25)**:
    - Implement a `limiter` in BullMQ (e.g., 80 msgs/sec) to stay below Meta thresholds.
    - Implement a Redis-based sliding window per Meta Phone ID.
3.  **Worker Cluster**:
    - Move logic from legacy MongoDB workers to BullMQ processors.
    - Implement **Exponential Backoff** for Meta transient errors (429, 503).

---

## Phase 3: Webhook Feedback Loop & Microservice Ready
**Objective**: Build reliable conversation tracking and secure the service.

1.  **Webhook Integration (Meta v25)**:
    - Handle `sent`, `delivered`, `read`, and `failed` events.
    - Update `Message` and `MessageLog` collections with real-time Meta IDs.
2.  **Microservice Isolation**:
    - Implement API Key / JWT authentication guards.
    - Expose the "Quick Send" API for low-latency alerts (OTPs).
3.  **Status Callback Engine**:
    - Fire events back to parent services (CRM/Marketing) via outgoing webhooks.

---

## Phase 4: Analytics & Multi-Tenancy
**Objective**: Visualizing delivery metrics and scaling to multiple clients.

1.  **Reporting Hub**:
    - Build aggregated campaign dashboards (Sent vs Read rates).
    - Map cost per message based on Meta conversation pricing.
2.  **Multi-WABA Support**:
    - Store multiple `PhoneID` configs in DB for multi-tenant support.
    - Tier-based rate limits based on client phone quality rating.

---

## Target Version: Meta Graph API v25.0
> [!IMPORTANT]
> The implementation assumes compatibility with the **v25.0** release of Meta's Graph API. Key changes often include stricter template requirements and new interactive message formats. Check [Meta's Changelog](https://developers.facebook.com/docs/graph-api/changelog) for specific v25 deprecations.

---

## Next Steps
1.  **Refactor Project Structure**: Fix directories and schema naming.
2.  **Variable Prototype**: Implement dynamic variables in one template and test end-to-end.
3.  **Webhook Loop**: complete the status update cycle.
