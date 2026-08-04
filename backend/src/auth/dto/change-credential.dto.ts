import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ChangeCredentialDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentCredential!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  newCredential!: string;
}
