# Architectural Plan: SaaS-Grade BullMQ & Redis Queue System (v25)

This plan moves the system from its current legacy "MongoDB loop" into a production-grade **BullMQ** architecture. This transition is essential for building a **WA-as-a-Service** platform that can handle high-throughput campaigns and strictly follow Meta's rate-limiting tiers.

---

## 🏗️ Core Infrastructure: The BullMQ Stack

### 1. Stack Selection
*   **Infrastructure**: Redis (BullMQ's engine).
*   **Module**: `@nestjs/bullmq` for seamless NestJS integration.
*   **Admin UI**: `bull-board` (optional but recommended for observability into the queue state).

### 2. Multi-Tenant Queue Design
To prevent a single client ("Noisy Neighbor Problem") from blocking the entire infrastructure, we will implement **Client-Based Prioritization**:
*   **Shared Queue**: `whatsapp-messages`
*   **Job Grouping (Wait, Group ID)**: BullMQ's `groupId` feature (available in Pro, but we can simulate with individual job priorities or dynamic rate-limiting logic based on Meta Tiers).
*   **Partitioning Strategy**: We can categorize jobs by `campaignId` or `clientId` to ensure fair distribution during massive bulk loads.

---

## 🛠️ The Implementation Flow (A → B → C)

### A. Producer Logic (Campaign service)
Instead of relying on workers to "find" messages in the DB, the **Campaign Service** will "Push" them to the queue as soon as the campaign status becomes `QUEUED`.

1.  **Job Payload Structure**:
    ```ts
    {
      messageId: string,    // DB reference
      phone: string,        // Recipient
      variables: string[],  // Dynamic params
      templateName: string, // Meta Template ID
      clientId: string,     // For rate-limiting/billing
      priority: number      // Optional: Premium vs Standard users
    }
    ```
2.  **Bulk Injection**: Use `queue.addBulk()` to minimize Redis RTT (Round Trip Time) when injecting 10k+ messages.

### B. Consumer Logic (The Worker Engine)
A dedicated `MessageConsumer` will process jobs concurrently.

1.  **Concurrency Management**:
    *   Set `concurrency` based on CPU capacity and Meta API throughput limits (e.g., `100` concurrent instances across multiple worker pods).
2.  **Idempotency & State Sync**:
    *   **Check**: Before sending, verify `message.status !== SENT` (Prevents duplicate sends if a job is retried after a partial failure).
    *   **Update**: Mark `status: PROCESSING` at the start and `SENT` on success.

### C. Advanced Rate Limiting (MANDATORY)
Since Meta (v25) enforces strict tiers (Tier 1: 1k/day, Tier 2: 10k/day, etc.), our queue must be "Smart":

1.  **Global Limiter**: Use BullMQ's `limiter` setting:
    ```ts
    limiter: {
      max: 80,         // messages per
      duration: 1000   // 1 second (Stay safe under Meta's RPS limits)
    }
    ```
2.  **Client-Tier Throttling**: Use `Flow` or separate queues if different clients have different Meta Tiers.

---

## 🔄 Robust Error Handling & Retry Strategy

1.  **Exponential Backoff**:
    *   **Settings**: `attempts: 3` (minimum), `backoff: { type: 'exponential', delay: 2000 }`.
2.  **Meta-Specific Logic**:
    *   **Retry on**: `Rate Limit Exceeded (429)`, `Service Unavailable (503)`.
    *   **Do NOT retry on**: `Invalid Phone Number (131030)`, `Template Mismatch (132001)`.
    *   **Dead Letter Queue (DLQ)**: Move permanently failed jobs to a `FAILED` status and log the Meta Error Code for the user dashboard.

---

## 🔬 Monitoring & Observability

1.  **Job Lifecycle Tracking**:
    *   Monitor `Active`, `Waiting`, `Completed`, and `Failed` counts.
2.  **Throughput Metrics**:
    *   Calculate **Sent Messages Per Second (SMPS)** to provide real-time status to clients.

---

## 🎯 Proposed Execution Order (Post-Approval)

1.  **Add Dependencies**: `bullmq`, `@nestjs/bullmq`, `ioredis`.
2.  **Queue Module Config**: Global Redis connection and `WHATSAPP_QUEUE` initialization.
3.  **Refactor Campaign Service**: Switch from "Save and Wait" to "Save and Push to Queue".
4.  **Create New Worker**: Implement the `BullMQ` processor, mirroring current `sendMessage` logic but adding backoff and concurrency.
5.  **Remove Legacy Worker**: Delete the existing MongoDB-lock system once BullMQ is stable.

---

## 💡 Architecture Decision (Idempotency)
> [!IMPORTANT]
> To prevent duplicate charges/messages, we will use the **Message ID** as the **Job ID** in BullMQ. This ensures that even if the producer pushes the same message twice, BullMQ will treat it as a single job.

---

**Do you approve of this architecture plan? If yes, I will begin Step 1 (Dependencies & Config).**
