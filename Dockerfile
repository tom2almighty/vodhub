FROM node:22-alpine AS web-builder
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY web ./
RUN pnpm build

FROM golang:1.26-alpine AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY web/embed.go ./web/embed.go
COPY --from=web-builder /app/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/vodhub ./cmd/vodhub

FROM alpine:3.21 AS runner
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S vodhub \
    && adduser -S -G vodhub vodhub \
    && mkdir -p /app/data \
    && chown -R vodhub:vodhub /app
WORKDIR /app
COPY --from=go-builder --chown=vodhub:vodhub /out/vodhub /app/vodhub
ENV PORT=3000 SITE_NAME=vodhub DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
USER vodhub
ENTRYPOINT ["/app/vodhub"]
