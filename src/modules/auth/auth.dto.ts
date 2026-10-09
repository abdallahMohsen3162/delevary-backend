import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { DeliveryChannel } from './entities';
import { Vehicle } from '../users/user.entity';

export function normalizePhone(value: unknown) {
  if (typeof value !== 'string') return value;
  const normalized = value
    .replace(/[٠-٩۰-۹]/g, (digit) =>
      String(digit.charCodeAt(0) - (digit <= '٩' ? 1632 : 1776)),
    )
    .replace(/[\s()-]/g, '');
  const local = normalized.replace(/^(\+20|0020|20)/, '').replace(/^0/, '');
  return /^1[0125]\d{8}$/.test(local) ? `+20${local}` : normalized;
}
export class LoginDto {
  @Transform(({ value }: { value: unknown }) => normalizePhone(value))
  @Matches(/^\+201[0125]\d{8}$/)
  phone!: string;
  @IsString() @Length(10, 128) password!: string;
}
export class RegisterCustomerDto extends LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 80)
  fullName!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || undefined : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
export class RegisterRiderDto extends RegisterCustomerDto {
  @IsEnum(Vehicle) vehicleType!: Vehicle;
}
export class ChallengeIdDto {
  @IsUUID() challengeId!: string;
}
export class VerifyCodeDto extends ChallengeIdDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) => normalizePhone(value))
  @Matches(/^\+201[0125]\d{8}$/)
  phone!: string;
  @IsEnum(DeliveryChannel) channel!: DeliveryChannel;
}
export class ResetPasswordDto extends VerifyCodeDto {
  @IsString() @Length(10, 128) newPassword!: string;
}
