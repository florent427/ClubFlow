import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { LoginInput } from './dto/login.input';
import { LoginPayload } from './models/login-payload.model';

@Resolver()
export class AuthResolver {
  constructor(private readonly auth: AuthService) {}

  @Mutation(() => LoginPayload)
  login(@Args('input') input: LoginInput): Promise<LoginPayload> {
    return this.auth.login(input);
  }
}
