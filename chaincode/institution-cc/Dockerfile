# institution-cc runs as a chaincode-as-a-service (ccaas) container —
# built directly via `docker build` on the host, never by the peer's own
# internal builder. See docs/BUILD_LOG.md's Phase 7 entry for why:
# Fabric 2.5.0's bundled Docker client (used by the peer's classic
# "golang" builder) is incompatible with newer Docker Engine versions
# that dropped legacy Build API support. This Dockerfile sidesteps that
# path entirely.
#
# Builds from the already-vendored vendor/ directory (go mod vendor),
# so this build needs no network access — deliberate, since it also
# removes network flakiness as a variable, not just the Docker
# incompatibility.

FROM golang:1.25 AS build
WORKDIR /chaincode
COPY . .
RUN CGO_ENABLED=0 go build -mod=vendor -o /chaincode-server .

FROM alpine:3.19
COPY --from=build /chaincode-server /chaincode-server
EXPOSE 9999
ENTRYPOINT ["/chaincode-server"]
