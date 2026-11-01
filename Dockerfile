# Build the standalone Go server.
FROM docker.io/library/golang:1.23-alpine AS builder
WORKDIR /src
COPY go.mod ./
COPY server ./server
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/royal-reels ./server

# Small, unprivileged runtime image. The site directory is writable by UID 10001
# because the authenticated API updates JSON files in place (atomically).
FROM docker.io/library/alpine:3.22
RUN addgroup -S -g 10001 royalreels && adduser -S -D -H -u 10001 -G royalreels royalreels
WORKDIR /app
COPY --from=builder /out/royal-reels /usr/local/bin/royal-reels
COPY --chown=10001:10001 . /app/site
ENV RR_ADDR=:8080
ENV RR_WEB_ROOT=/app/site
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/royal-reels"]
