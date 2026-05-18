-- ContourAI initial schema
-- Run with: psql $DATABASE_URL -f migrations/0001_initial.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------------------------------------------------------------------------
-- clinics
-- ---------------------------------------------------------------------------
CREATE TABLE clinics (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    text NOT NULL,
    slug                    text NOT NULL UNIQUE,
    timezone                text NOT NULL DEFAULT 'America/Los_Angeles',
    service_area_zips       text[] NOT NULL DEFAULT '{}',
    lead_scoring_weights    jsonb NOT NULL DEFAULT '{}'::jsonb,
    ghl_location_id         text,
    meta_page_id            text,
    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------------
CREATE TABLE patients (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id               uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    display_name            text,
    email                   citext,
    phone                   text,
    handles                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    journey_state           text NOT NULL DEFAULT 'new_lead',
    profile                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    consent_marketing       boolean NOT NULL DEFAULT false,
    last_seen_at            timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT journey_state_valid CHECK (journey_state IN (
        'new_lead','qualifying','nurturing','consult_scheduled',
        'consult_complete','pre_op','post_op_d0_d14','recovery_complete',
        'review_solicit','reactivation','escalated','closed_lost'
    ))
);

CREATE INDEX patients_clinic_idx ON patients (clinic_id);
CREATE INDEX patients_journey_state_idx ON patients (clinic_id, journey_state);

-- Idempotent resolution by channel handle. Partial unique indexes — a patient
-- without an IG handle doesn't conflict with another patient without one.
CREATE UNIQUE INDEX patients_handle_instagram_uniq
    ON patients (clinic_id, (handles->>'instagram'))
    WHERE handles ? 'instagram';
CREATE UNIQUE INDEX patients_handle_tiktok_uniq
    ON patients (clinic_id, (handles->>'tiktok'))
    WHERE handles ? 'tiktok';
CREATE UNIQUE INDEX patients_phone_uniq
    ON patients (clinic_id, phone)
    WHERE phone IS NOT NULL;

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
CREATE TABLE conversations (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id               uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id              uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    channel                 text NOT NULL,
    platform_thread_id      text,
    last_message_at         timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT channel_valid CHECK (channel IN
        ('instagram','tiktok','sms','voice','web','email'))
);

CREATE UNIQUE INDEX conversations_thread_uniq
    ON conversations (clinic_id, channel, platform_thread_id)
    WHERE platform_thread_id IS NOT NULL;
CREATE INDEX conversations_patient_idx ON conversations (patient_id);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
CREATE TABLE messages (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id         uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction               text NOT NULL,
    sender                  text NOT NULL,
    body                    text,
    attachments             jsonb NOT NULL DEFAULT '[]'::jsonb,
    platform_msg_id         text,
    llm_metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT direction_valid CHECK (direction IN ('inbound','outbound')),
    CONSTRAINT sender_valid    CHECK (sender    IN ('patient','bot','human'))
);

CREATE UNIQUE INDEX messages_platform_uniq
    ON messages (conversation_id, platform_msg_id)
    WHERE platform_msg_id IS NOT NULL;
CREATE INDEX messages_conversation_created_idx
    ON messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
CREATE TABLE leads (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id               uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id              uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    source                  text NOT NULL,
    intent                  text,
    procedure               text,
    score                   int  NOT NULL DEFAULT 0,
    status                  text NOT NULL DEFAULT 'open',
    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    closed_at               timestamptz,
    CONSTRAINT status_valid CHECK (status IN ('open','won','lost')),
    CONSTRAINT score_range  CHECK (score BETWEEN 0 AND 100)
);

CREATE INDEX leads_clinic_status_idx ON leads (clinic_id, status, score DESC);
CREATE INDEX leads_patient_idx ON leads (patient_id);

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------
CREATE TABLE appointments (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id               uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id              uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    external_id             text,
    starts_at               timestamptz NOT NULL,
    kind                    text NOT NULL,
    status                  text NOT NULL,
    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kind_valid   CHECK (kind   IN ('consult','pre_op','surgery','post_op')),
    CONSTRAINT status_valid CHECK (status IN ('scheduled','completed','no_show','cancelled'))
);

CREATE UNIQUE INDEX appointments_external_uniq
    ON appointments (clinic_id, external_id)
    WHERE external_id IS NOT NULL;
CREATE INDEX appointments_patient_idx ON appointments (patient_id, starts_at);

-- ---------------------------------------------------------------------------
-- escalations
-- ---------------------------------------------------------------------------
CREATE TABLE escalations (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id               uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id              uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    message_id              uuid REFERENCES messages(id) ON DELETE SET NULL,
    reason                  text NOT NULL,
    severity                int  NOT NULL DEFAULT 3,
    notified_at             timestamptz,
    resolved_at             timestamptz,
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT severity_range CHECK (severity BETWEEN 1 AND 5),
    CONSTRAINT reason_valid CHECK (reason IN (
        'red_flag_medical','human_handoff_request','complaint','compliance','other'
    ))
);

CREATE INDEX escalations_open_idx
    ON escalations (clinic_id, created_at DESC)
    WHERE resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- events (append-only audit log)
-- ---------------------------------------------------------------------------
CREATE TABLE events (
    id                      bigserial PRIMARY KEY,
    clinic_id               uuid REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id              uuid REFERENCES patients(id) ON DELETE SET NULL,
    kind                    text NOT NULL,
    payload                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_clinic_created_idx ON events (clinic_id, created_at DESC);
CREATE INDEX events_patient_created_idx ON events (patient_id, created_at DESC);
CREATE INDEX events_kind_idx ON events (kind, created_at DESC);
