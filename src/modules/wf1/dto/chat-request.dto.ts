import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { ChannelSource } from '../domain/source';

export class ChatRequestDto {
  @IsEnum(['web', 'whatsapp'])
  source!: ChannelSource;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  userId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  conversationId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  accessToken?: string;

  @IsOptional()
  @IsEnum(['ARS', 'USD'])
  currency?: 'ARS' | 'USD';

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}-[A-Z]{2}$/)
  locale?: string;
}
