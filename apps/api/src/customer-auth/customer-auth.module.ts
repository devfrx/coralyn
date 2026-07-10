import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CustomerTokenService } from './customer-token.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('CUSTOMER_JWT_EXPIRES_IN') ?? '30m' },
      }),
    }),
  ],
  providers: [CustomerTokenService],
  exports: [CustomerTokenService],
})
export class CustomerAuthModule {}
