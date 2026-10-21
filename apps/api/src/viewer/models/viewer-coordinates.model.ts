import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ViewerCoordinatesTarget } from '../dto/viewer-coordinates.input';

@ObjectType()
export class ViewerCoordinatesGraph {
  @Field(() => String, { nullable: true })
  phone!: string | null;

  @Field(() => String, { nullable: true })
  addressLine!: string | null;

  @Field(() => String, { nullable: true })
  postalCode!: string | null;

  @Field(() => String, { nullable: true })
  city!: string | null;

  @Field(() => String, { nullable: true })
  birthCity!: string | null;

  @Field(() => String, { nullable: true })
  birthCityInseeCode!: string | null;

  @Field(() => String, { nullable: true })
  birthCountryCode!: string | null;
}

@ObjectType()
export class ViewerCoordinatesGapGraph {
  @Field(() => ViewerCoordinatesTarget)
  target!: ViewerCoordinatesTarget;

  @Field(() => ID, { nullable: true })
  targetId!: string | null;

  @Field(() => String)
  displayName!: string;

  /** Sous-ensemble de PHONE, ADDRESS, BIRTH_PLACE. */
  @Field(() => [String])
  missing!: string[];

  /** Le lieu de naissance est-il exigé pour cette fiche (adhérent) ? */
  @Field(() => Boolean)
  requiresBirthPlace!: boolean;

  @Field(() => ViewerCoordinatesGraph)
  current!: ViewerCoordinatesGraph;
}

@ObjectType()
export class ViewerCoordinatesStatusGraph {
  /** Coordonnées du compte payeur : source de la case « mêmes coordonnées ». */
  @Field(() => ViewerCoordinatesGraph)
  account!: ViewerCoordinatesGraph;

  @Field(() => Boolean)
  accountComplete!: boolean;

  /** Fiches incomplètes : compte puis, si un panier est donné, ses adhérents. */
  @Field(() => [ViewerCoordinatesGapGraph])
  gaps!: ViewerCoordinatesGapGraph[];
}
