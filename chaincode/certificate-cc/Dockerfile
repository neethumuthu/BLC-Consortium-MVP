# certificate-cc runs as a chaincode-as-a-service (ccaas) container —
# built directly via `docker build` on the host, never by the peer's own
# internal builder. Same reasoning as institution-cc's Dockerfile — see
# docs/BUILD_LOG.md's Phase 7 entry.
#
# Builds from the already-vendored vendor/ directory (go mod vendor), so
# this build needs no network access.

FROM golang:1.25 AS build
WORKDIR /chaincode
COPY . .
RUN CGO_ENABLED=0 go build -mod=vendor -o /chaincode-server .

FROM alpine:3.19
COPY --from=build /chaincode-server /chaincode-server
EXPOSE 9999
ENTRYPOINT ["/chaincode-server"]
