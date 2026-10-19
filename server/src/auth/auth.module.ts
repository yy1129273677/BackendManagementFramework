import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

/**
 * 认证模块。
 * JWT 模块用 registerAsync 是为了能读到 ConfigModule 里的 .env 配置。
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET") || "bmf-dev-secret",
        // expiresIn 的类型是 number | StringValue（"8h" 这种字面量类型），
        // 从 env 读出来只是普通 string，所以这里显式断言，避免类型报错
        signOptions: {
          expiresIn: (config.get<string>("JWT_EXPIRES_IN") || "8h") as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
