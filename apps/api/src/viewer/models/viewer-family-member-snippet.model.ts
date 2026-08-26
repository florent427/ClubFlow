import { Field, ID, ObjectType } from '@nestjs/graphql';
import { SignedPhotoField } from '../../media/signed-photo-field.decorator';

@ObjectType()
export class ViewerFamilyMemberSnippetGraph {
  @Field(() => ID)
  memberId!: string;

  @Field(() => String)
  firstName!: string;

  @Field(() => String)
  lastName!: string;

  @SignedPhotoField()
  photoUrl!: string | null;
}
