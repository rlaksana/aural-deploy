FROM node:20-bookworm-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* are baked into the client bundle at build time.
# These are public by design (Supabase anon key is RLS-protected).
# Secrets (SUPABASE_SERVICE_ROLE_KEY, MINIMAX_API_KEY, ...) are runtime-only via env_file.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_VOICE_RELAY_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_VOICE_RELAY_URL=$NEXT_PUBLIC_VOICE_RELAY_URL

# Server-side Supabase clients are created at module scope; `next build` imports
# route modules while collecting page data, so these must be non-empty during
# build. Same placeholders as CI — real values are runtime-only via env_file.
# ARG-scoped vars exist only in this build stage, never in the final image.
ARG SUPABASE_URL=https://build-placeholder.supabase.co
ARG SUPABASE_ANON_KEY=build-placeholder
ARG SUPABASE_SERVICE_ROLE_KEY=build-placeholder
ARG GEMINI_API_KEY=build-placeholder

RUN npm run build

EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
