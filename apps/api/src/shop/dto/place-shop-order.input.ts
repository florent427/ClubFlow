import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

@InputType()
export class PlaceShopOrderLineInput {
  @Field(() => ID)
  @IsUUID()
  productId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  quantity!: number;
}

@InputType()
export class PlaceShopOrderInput {
  @Field(() => [PlaceShopOrderLineInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PlaceShopOrderLineInput)
  lines!: PlaceShopOrderLineInput[];

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
