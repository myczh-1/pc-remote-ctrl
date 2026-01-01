# syntax=docker/dockerfile:1.7

FROM golang:1.24-alpine AS builder
WORKDIR /src
ENV CGO_ENABLED=0 GO111MODULE=on

# Prime cache directories so mount instructions always work
RUN --mount=type=cache,target=/root/.cache/go-build true
RUN --mount=type=cache,target=/go/pkg/mod true

# Copy workspace modules so replace directives keep working
COPY go.work go.work.sum ./
COPY backend ./backend
COPY cloud-middleware ./cloud-middleware
COPY proto ./proto
COPY vendor ./vendor

RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    cd backend && go build -v -o /out/home-gateway ./cmd/home-gateway

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -h /app appuser
WORKDIR /app

COPY --from=builder /out/home-gateway /usr/local/bin/home-gateway
COPY backend/data ./data

ENV LOCAL_PORT=7071 \
    HOME_DEVICES_DB=/data/home.db \
    HOME_DEVICES_FILE=/data/home.db \
    HOME_SCENES_FILE=/data/scenes.json \
    HOME_AUTOMATIONS_FILE=/data/automations.json

EXPOSE 7071
USER appuser
ENTRYPOINT ["/usr/local/bin/home-gateway"]
