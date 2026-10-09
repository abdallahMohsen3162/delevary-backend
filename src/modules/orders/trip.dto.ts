import { Type, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { CoordinatesDto } from '../locations/location.dto';
export class HistoryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional()
  @IsIn([
    'DRAFT',
    'OPEN',
    'ASSIGNED',
    'ARRIVING_PICKUP',
    'AT_PICKUP',
    'PICKED_UP',
    'IN_TRANSIT',
    'AT_DESTINATION',
    'DELIVERED',
    'CANCELLED',
    'FAILED',
  ])
  status?: string;
}
export class ActionDto {
  @IsInt() @Min(1) version!: number;
  @IsOptional() @IsString() @Length(2, 300) reason?: string;
}
export class OfferDto {
  @IsInt() @Min(100) @Max(10000000) amountPiasters!: number;
  @IsOptional() @IsString() @Length(0, 300) reason?: string;
}
export class ChatDto {
  @IsUUID() clientMessageId!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 2000)
  body!: string;
}
export class TrackingDto extends CoordinatesDto {
  @IsUUID() updateId!: string;
  @IsInt() @Min(1) sequence!: number;
  @IsNumber() @Min(0) @Max(200) accuracy!: number;
  @IsISO8601() recordedAt!: string;
}
