import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
export class CoordinatesDto {
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude!: number;
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude!: number;
}
export class SaveLocationDto extends CoordinatesDto {
  @IsString() @Length(2, 300) addressText!: string;
  @IsOptional() @IsString() @Length(1, 60) label?: string;
}
export class MapImageDto extends CoordinatesDto {
  @Type(() => Number) @IsInt() @Min(3) @Max(19) zoom = 14;
}
export class MapSearchDto {
  @IsString() @Length(3, 200) q!: string;
}
export class MapTileDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(19) z!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(524287) x!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(524287) y!: number;
}
export class NearbyDto extends CoordinatesDto {
  @Type(() => Number) @IsInt() @Min(500) @Max(20_000) radius = 5000;
}
