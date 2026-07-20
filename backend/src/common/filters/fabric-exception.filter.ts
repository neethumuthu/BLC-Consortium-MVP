import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { CommitError, EndorseError, GatewayError, SubmitError } from '@hyperledger/fabric-gateway';

// Translates Fabric Gateway SDK exceptions into HTTP responses. Chaincode
// business-rule rejections (e.g. RevokeCertificate's "not the issuer")
// surface as EndorseError, since that check runs during
// simulation/endorsement — exception.details[0].message carries the
// real Go fmt.Errorf string from the peer.
//
// The string-matching table below is a FIRST DRAFT, not verified against
// live output yet (see docs/BUILD_LOG.md's Phase 11 entry / this
// implementation's own verification plan) — chaincode errors have no
// structured error-code convention on the Go side, only fmt.Errorf
// strings, so this is unavoidably heuristic. Log the raw exception shape
// during verification and correct this table against real observed data
// before treating it as final.
// SubmitError can't be named here directly - @hyperledger/fabric-gateway's
// public entry point re-exports it as a type-only export even though
// it's a real class internally. Both SubmitError and EndorseError extend
// GatewayError (CommitError does not - it extends plain Error), so
// catching GatewayError already catches SubmitError instances too via
// instanceof; only CommitError needs to be listed separately.
@Catch(EndorseError, CommitError, GatewayError)
export class FabricExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(FabricExceptionFilter.name);

  catch(exception: EndorseError | SubmitError | CommitError | GatewayError, host: ArgumentsHost): void {
    const message = extractMessage(exception);
    const status = mapToHttpStatus(exception, message);

    this.logger.warn(
      `Fabric Gateway error: ${exception.constructor.name} - ${message} (mapped to HTTP ${status})`,
    );

    host.switchToHttp().getResponse<Response>().status(status).json({
      statusCode: status,
      error: exception.constructor.name,
      message,
    });
  }
}

function extractMessage(exception: EndorseError | SubmitError | CommitError | GatewayError): string {
  if ('details' in exception && exception.details.length > 0) {
    return exception.details[0].message;
  }
  return exception.message;
}

function mapToHttpStatus(
  exception: EndorseError | SubmitError | CommitError | GatewayError,
  message: string,
): number {
  if (exception instanceof CommitError) {
    // MVCC_READ_CONFLICT and similar non-VALID commit codes are a
    // concurrency conflict, not a permanent rejection - the same class
    // of retryable conflict certificate-cc's own counters are designed
    // around (see docs/BUILD_LOG.md's Phase 8 entry).
    return HttpStatus.CONFLICT;
  }

  if (/does not exist/.test(message)) {
    return HttpStatus.NOT_FOUND;
  }
  if (
    /is not the issuer of|is not an active institution|is not a registered institution|not a founding institution/.test(
      message,
    )
  ) {
    return HttpStatus.FORBIDDEN;
  }
  if (
    /already revoked|already registered|already a member|already voted|already-approved membership proposal exists/.test(
      message,
    )
  ) {
    return HttpStatus.CONFLICT;
  }
  if (/must not be empty|decision must be/.test(message)) {
    return HttpStatus.BAD_REQUEST;
  }

  // Transport-level gRPC failure (peer unreachable, timed out) rather
  // than a chaincode-level rejection - distinct failure class.
  const grpcCode = (exception as GatewayError).code;
  if (grpcCode === grpc_status.UNAVAILABLE) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }
  if (grpcCode === grpc_status.DEADLINE_EXCEEDED) {
    return HttpStatus.GATEWAY_TIMEOUT;
  }

  // A syntactically valid request rejected by chaincode domain logic we
  // don't have a specific mapping for yet.
  return HttpStatus.UNPROCESSABLE_ENTITY;
}

// Minimal subset of grpc.status codes referenced above, to avoid pulling
// in the full @grpc/grpc-js Status enum just for two values.
const grpc_status = {
  UNAVAILABLE: 14,
  DEADLINE_EXCEEDED: 4,
};
