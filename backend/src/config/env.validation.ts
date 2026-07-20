import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, Min, validateSync } from 'class-validator';
import { existsSync } from 'fs';

// Fail fast at boot, not three requests later with an opaque gRPC TLS
// error — every path-shaped value is checked against the real
// filesystem here, in addition to basic shape validation.
class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  MSP_ID!: string;

  @IsString()
  @IsNotEmpty()
  PEER_ENDPOINT!: string;

  @IsString()
  @IsNotEmpty()
  PEER_TLS_ROOTCERT_PATH!: string;

  @IsString()
  @IsNotEmpty()
  ADMIN_CERT_PATH!: string;

  @IsString()
  @IsNotEmpty()
  ADMIN_KEYSTORE_DIR!: string;

  @IsString()
  @IsNotEmpty()
  CHANNEL_NAME!: string;

  @IsString()
  @IsNotEmpty()
  INSTITUTION_CC_NAME!: string;

  @IsString()
  @IsNotEmpty()
  CERTIFICATE_CC_NAME!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  HTTP_PORT!: number;
}

// Env vars this instance requires that must point at an existing
// path on disk, checked beyond class-validator's plain string shape.
const PATH_FIELDS = [
  'PEER_TLS_ROOTCERT_PATH',
  'ADMIN_CERT_PATH',
  'ADMIN_KEYSTORE_DIR',
] as const;

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.toString()}`);
  }

  const missingPaths = PATH_FIELDS.filter((field) => !existsSync(validated[field]));
  if (missingPaths.length > 0) {
    throw new Error(
      `Environment configuration points at paths that do not exist on disk: ${missingPaths
        .map((field) => `${field}=${validated[field]}`)
        .join(', ')}`,
    );
  }

  return validated;
}
