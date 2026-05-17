-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AddTeamRole" AS ENUM ('MANAGER', 'USER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'USER');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('QUEUED', 'DRAFT', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "userstatus" AS ENUM ('active', 'inactive', 'pending');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "groupId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "attributes" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactGroup" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "totalContacts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaEventLog" (
    "id" SERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "payloadHash" TEXT,
    "wabaId" TEXT,
    "eventType" TEXT NOT NULL,
    "fieldName" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "isReplayed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreVerifiedNumber" (
    "id" SERIAL NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "preVerifiedId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verificationExp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreVerifiedNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "clientId" INTEGER NOT NULL,
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'INBOUND',
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "mediaUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "add_team" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "userpassword" TEXT NOT NULL,
    "role" "AddTeamRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "add_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_details" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "useremail" TEXT NOT NULL,
    "countries" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "userpassword" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "gst" TEXT NOT NULL,
    "websit" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "smssendCampaign" BOOLEAN NOT NULL DEFAULT true,
    "smsloginAccess" BOOLEAN NOT NULL DEFAULT true,
    "smssubAccountStatus" BOOLEAN NOT NULL DEFAULT true,
    "smsEditCampaign" BOOLEAN NOT NULL DEFAULT true,
    "sms" BOOLEAN NOT NULL DEFAULT true,
    "whatsappSubAccountStatus" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "rcsSubAccountStats" BOOLEAN NOT NULL DEFAULT true,
    "rcsSendCampaign" BOOLEAN NOT NULL DEFAULT true,
    "rcsLogAccess" BOOLEAN NOT NULL DEFAULT true,
    "rcsDuplicate" BOOLEAN NOT NULL DEFAULT true,
    "rcs" BOOLEAN NOT NULL DEFAULT true,
    "emailSendCampaign" BOOLEAN NOT NULL DEFAULT true,
    "emaiLogAccess" BOOLEAN NOT NULL DEFAULT true,
    "emailEditCampaign" BOOLEAN NOT NULL DEFAULT true,
    "emailSubAccountStats" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "exportLogs" BOOLEAN NOT NULL DEFAULT true,
    "showSubAccount" BOOLEAN NOT NULL DEFAULT true,
    "editSubAccount" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "smsSendingPrice" DOUBLE PRECISION NOT NULL,
    "smsDeliveryPrice" DOUBLE PRECISION NOT NULL,
    "rcs" DOUBLE PRECISION NOT NULL,
    "Rcsm" DOUBLE PRECISION NOT NULL,
    "RcsConv" DOUBLE PRECISION NOT NULL,
    "p2a" DOUBLE PRECISION NOT NULL,
    "eOtp" DOUBLE PRECISION NOT NULL,
    "eTransactional" DOUBLE PRECISION NOT NULL,
    "ePromational" DOUBLE PRECISION NOT NULL,
    "wotp" DOUBLE PRECISION NOT NULL,
    "trans" DOUBLE PRECISION NOT NULL,
    "promo" DOUBLE PRECISION NOT NULL,
    "conv" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "send_campaign" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled Campaign',
    "templateId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "status" "campaign_status" NOT NULL DEFAULT 'QUEUED',
    "recipients" JSONB,
    "contactGroupId" TEXT,
    "totalRecipients" INTEGER NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "failureReason" TEXT,
    "mediaId" TEXT,
    "isSplit" BOOLEAN NOT NULL DEFAULT false,
    "batchSize" INTEGER NOT NULL DEFAULT 0,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 0,
    "isScheduled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "send_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DEBIT',
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "category" TEXT,
    "referenceId" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "fullname" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "userStatus" "userstatus" NOT NULL DEFAULT 'active',
    "rolls" "UserRole" NOT NULL DEFAULT 'USER',
    "password" TEXT NOT NULL,
    "twoFA" BOOLEAN NOT NULL DEFAULT false,
    "twoFaType" TEXT NOT NULL DEFAULT 'sms',
    "twoFaSecret" TEXT,
    "twoFaOtp" TEXT,
    "twoFaOtpExpiry" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_services" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "apiClient" TEXT NOT NULL,
    "apikey" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waba_credentials" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "phoneNumber" TEXT,
    "displayName" TEXT,
    "verifiedName" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "twoStepPin" TEXT,
    "allocationConfigId" TEXT,
    "isCoexistence" BOOLEAN NOT NULL DEFAULT false,
    "needsVerification" BOOLEAN NOT NULL DEFAULT false,
    "accessTokenEnc" TEXT,
    "iv" TEXT,
    "encryptionKeyId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "qualityRating" TEXT NOT NULL DEFAULT 'GREEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "businessId" TEXT,

    CONSTRAINT "waba_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsappPricingConfig" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsappPricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_message_logs" (
    "id" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "wamid" TEXT NOT NULL,
    "conversationId" TEXT,
    "pricingCategory" TEXT,
    "billable" BOOLEAN DEFAULT false,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_groupId_idx" ON "Contact"("groupId");

-- CreateIndex
CREATE INDEX "Contact_userId_idx" ON "Contact"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_userId_phone_groupId_key" ON "Contact"("userId", "phone", "groupId");

-- CreateIndex
CREATE INDEX "ContactGroup_userId_idx" ON "ContactGroup"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaEventLog_eventId_key" ON "MetaEventLog"("eventId");

-- CreateIndex
CREATE INDEX "MetaEventLog_eventType_idx" ON "MetaEventLog"("eventType");

-- CreateIndex
CREATE INDEX "MetaEventLog_wabaId_idx" ON "MetaEventLog"("wabaId");

-- CreateIndex
CREATE UNIQUE INDEX "PreVerifiedNumber_phoneNumber_key" ON "PreVerifiedNumber"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PreVerifiedNumber_preVerifiedId_key" ON "PreVerifiedNumber"("preVerifiedId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessage_externalId_key" ON "WhatsappMessage"("externalId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_clientId_idx" ON "WhatsappMessage"("clientId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_clientId_sender_idx" ON "WhatsappMessage"("clientId", "sender");

-- CreateIndex
CREATE INDEX "WhatsappMessage_createdAt_idx" ON "WhatsappMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "add_team_email_key" ON "add_team"("email");

-- CreateIndex
CREATE INDEX "add_team_managerId_idx" ON "add_team"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "company_details_userId_key" ON "company_details"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "company_details_useremail_key" ON "company_details"("useremail");

-- CreateIndex
CREATE UNIQUE INDEX "company_details_email_key" ON "company_details"("email");

-- CreateIndex
CREATE UNIQUE INDEX "permission_companyId_key" ON "permission"("companyId");

-- CreateIndex
CREATE INDEX "permission_companyId_idx" ON "permission"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_companyId_key" ON "pricing"("companyId");

-- CreateIndex
CREATE INDEX "pricing_companyId_idx" ON "pricing"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "send_campaign_idempotencyKey_key" ON "send_campaign"("idempotencyKey");

-- CreateIndex
CREATE INDEX "send_campaign_contactGroupId_idx" ON "send_campaign"("contactGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_referenceId_key" ON "transaction"("referenceId");

-- CreateIndex
CREATE INDEX "transaction_clientId_idx" ON "transaction"("clientId");

-- CreateIndex
CREATE INDEX "transaction_referenceId_idx" ON "transaction"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_services_userId_serviceId_key" ON "user_services"("userId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "waba_credentials_clientId_key" ON "waba_credentials"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "waba_credentials_wabaId_key" ON "waba_credentials"("wabaId");

-- CreateIndex
CREATE UNIQUE INDEX "waba_credentials_phoneNumberId_key" ON "waba_credentials"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_clientId_key" ON "wallet"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsappPricingConfig_category_key" ON "whatsappPricingConfig"("category");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_message_logs_wamid_key" ON "whatsapp_message_logs"("wamid");

-- CreateIndex
CREATE INDEX "whatsapp_message_logs_campaignId_idx" ON "whatsapp_message_logs"("campaignId");

-- CreateIndex
CREATE INDEX "whatsapp_message_logs_clientId_idx" ON "whatsapp_message_logs"("clientId");

-- CreateIndex
CREATE INDEX "whatsapp_message_logs_conversationId_idx" ON "whatsapp_message_logs"("conversationId");

-- CreateIndex
CREATE INDEX "whatsapp_message_logs_status_idx" ON "whatsapp_message_logs"("status");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ContactGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroup" ADD CONSTRAINT "ContactGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "add_team" ADD CONSTRAINT "add_team_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_details" ADD CONSTRAINT "company_details_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing" ADD CONSTRAINT "pricing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "send_campaign" ADD CONSTRAINT "send_campaign_contactGroupId_fkey" FOREIGN KEY ("contactGroupId") REFERENCES "ContactGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "send_campaign" ADD CONSTRAINT "send_campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_services" ADD CONSTRAINT "user_services_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waba_credentials" ADD CONSTRAINT "waba_credentials_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_message_logs" ADD CONSTRAINT "whatsapp_message_logs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "send_campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

