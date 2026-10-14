# Prepared locally only. Activation is a separate orchestrator/Isaac decision.
FROM public.ecr.aws/supabase/storage-api:v1.70.3@sha256:528ec49c3c32561908b07ee91bced7f8456f3b688164e341eaa422441767a0bd
COPY patch-deletion-abort.cjs /tmp/patch-deletion-abort.cjs
RUN node /tmp/patch-deletion-abort.cjs && rm /tmp/patch-deletion-abort.cjs
