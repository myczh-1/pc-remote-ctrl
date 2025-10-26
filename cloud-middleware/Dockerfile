# syntax=docker/dockerfile:1.7

FROM golang:1.24-alpine AS builder
WORKDIR /src
ENV CGO_ENABLED=0 GO111MODULE=on

RUN --mount=type=cache,target=/root/.cache/go-build true
RUN --mount=type=cache,target=/go/pkg/mod true

COPY go.work go.work.sum ./
COPY backend ./backend
COPY cloud-middleware ./cloud-middleware
COPY proto ./proto
COPY vendor ./vendor

RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    cd cloud-middleware && go build -v -o /out/cloud-middleware ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -h /app appuser
WORKDIR /app

COPY --from=builder /out/cloud-middleware /usr/local/bin/cloud-middleware

ENV GRPC_PORT=7073
EXPOSE 7073
USER appuser
ENTRYPOINT ["/usr/local/bin/cloud-middleware"]
