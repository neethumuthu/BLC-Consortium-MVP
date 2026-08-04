import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CredentialStoreService } from './credential-store.service';
import { ChangeCredentialDto } from './dto/change-credential.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly credentialStore: CredentialStoreService) {}

  @Post('credential')
  @ApiOperation({ summary: "Change this instance's shared API credential" })
  @ApiResponse({ status: 200, description: 'Credential updated' })
  @ApiResponse({ status: 401, description: 'Current credential is incorrect' })
  changeCredential(@Body() dto: ChangeCredentialDto): { message: string } {
    if (dto.currentCredential !== this.credentialStore.getCurrent()) {
      throw new UnauthorizedException('Current credential is incorrect');
    }

    this.credentialStore.setCredential(dto.newCredential);
    return { message: 'Credential updated' };
  }
}
