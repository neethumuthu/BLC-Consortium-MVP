import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { createPrivateKey } from 'crypto';
import * as grpc from '@grpc/grpc-js';
import { connect, Contract, Gateway, Identity, signers } from '@hyperledger/fabric-gateway';
import { readSoleKeystoreFile } from './fabric-identity.util';

// One long-lived connection per running instance, established once at
// startup and reused for every request — Fabric Gateway connections are
// explicitly meant to be long-lived, not reconnected per-request. Each
// running instance acts as exactly one organization, per its own env
// config (see env.validation.ts / .env.example).
@Injectable()
export class FabricGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FabricGatewayService.name);

  private grpcClient?: grpc.Client;
  private gateway?: Gateway;
  private institutionContract?: Contract;
  private certificateContract?: Contract;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const mspId = this.config.getOrThrow<string>('MSP_ID');
    const peerEndpoint = this.config.getOrThrow<string>('PEER_ENDPOINT');
    const rootCert = readFileSync(this.config.getOrThrow<string>('PEER_TLS_ROOTCERT_PATH'));

    this.grpcClient = new grpc.Client(peerEndpoint, grpc.credentials.createSsl(rootCert));

    const identity: Identity = {
      mspId,
      credentials: readFileSync(this.config.getOrThrow<string>('ADMIN_CERT_PATH')),
    };
    const privateKey = createPrivateKey(
      readSoleKeystoreFile(this.config.getOrThrow<string>('ADMIN_KEYSTORE_DIR')),
    );
    const signer = signers.newPrivateKeySigner(privateKey);

    this.gateway = connect({ client: this.grpcClient, identity, signer });

    const network = this.gateway.getNetwork(this.config.getOrThrow<string>('CHANNEL_NAME'));
    this.institutionContract = network.getContract(
      this.config.getOrThrow<string>('INSTITUTION_CC_NAME'),
    );
    this.certificateContract = network.getContract(
      this.config.getOrThrow<string>('CERTIFICATE_CC_NAME'),
    );

    this.logger.log(`Connected to ${peerEndpoint} as ${mspId}`);
  }

  onModuleDestroy(): void {
    this.gateway?.close();
    this.grpcClient?.close();
  }

  getInstitutionContract(): Contract {
    if (!this.institutionContract) {
      throw new Error('FabricGatewayService is not yet initialized');
    }
    return this.institutionContract;
  }

  getCertificateContract(): Contract {
    if (!this.certificateContract) {
      throw new Error('FabricGatewayService is not yet initialized');
    }
    return this.certificateContract;
  }
}
