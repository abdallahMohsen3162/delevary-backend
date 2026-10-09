import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsUUID,
  IsEnum,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { normalizePhone } from '../auth/auth.dto';
import { SaveLocationDto } from '../locations/location.dto';
import { Vehicle } from '../users/user.entity';
export class CreateOrderDto {
  @IsOptional() @IsUUID() clientRequestId?: string;
  @IsOptional() @IsString() @Length(0, 500) deliveryInstructions?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => SaveLocationDto)
  pickup?: SaveLocationDto;
  @IsString() @Length(2, 300) packageDescription!: string;
  @IsEnum(Vehicle) vehicleType!: Vehicle;
  @IsDefined()
  @ValidateNested()
  @Type(() => SaveLocationDto)
  destination!: SaveLocationDto;
  @IsString() @Length(2, 80) recipientName!: string;
  @Transform(({ value }) => normalizePhone(value))
  @Matches(/^\+201[0125]\d{8}$/)
  recipientPhone!: string;
}
