import { Field, ID, InputType } from '@nestjs/graphql';
import { ArrayMinSize, IsUUID } from 'class-validator';

@InputType()
export class RespondSurveyInput {
  @Field(() => ID)
  @IsUUID()
  surveyId!: string;

  @Field(() => [ID])
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  optionIds!: string[];
}
