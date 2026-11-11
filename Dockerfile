# Chaos Garden dashboard (Next.js). docker build -t chaos-garden-web .
# NEXT_PUBLIC_* values are baked into the browser bundle at build time, so the
# URLs the *browser* uses to reach the APIs are build arguments, not runtime env.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_CONTROL_API_URL=http://localhost:3000
ARG NEXT_PUBLIC_PROXY_URL=http://localhost:3100
ENV NEXT_PUBLIC_CONTROL_API_URL=$NEXT_PUBLIC_CONTROL_API_URL \
    NEXT_PUBLIC_PROXY_URL=$NEXT_PUBLIC_PROXY_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Next.js "standalone" output: a minimal server.js plus only the modules it needs.
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
