import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/http-exception.filter";
import { ResponseInterceptor } from "./common/response.interceptor";

/**
 * 后端启动入口。
 *
 * 干了这些事：
 *   1. 全局路由前缀 /api（前端所有请求都是 /api/xxx）
 *   2. 全局校验管道：请求体做类型转换，但不清洗多余字段（DTO 里没有的字段会被忽略）
 *   3. 全局响应拦截器：统一包成 { code, message, data }
 *   4. 全局异常过滤器：统一错误格式 + 中文提示
 *   5. Swagger 文档：/api/docs
 *   6. 监听 0.0.0.0，容器里也能被外部访问（只监听 127.0.0.1 的话 Docker 端口映射会失效）
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // 生产环境不打 SQL 之类的调试日志
    logger: ["error", "warn", "log"],
  });

  const configService = app.get(ConfigService);

  // 1. 统一 /api 前缀
  app.setGlobalPrefix("api");

  // 2. 跨域：开发时前端在 5173 端口，和后端 3000 不同源
  const corsOrigin = configService.get<string>("CORS_ORIGIN");
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(",").map((item) => item.trim()) : true,
    credentials: true,
  });

  // 3. 请求体校验 / 类型转换
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      // 关掉白名单：本项目的 DTO 很少，字段由 service 显式挑选，
      // 开白名单反而容易把合法字段悄悄过滤掉，排查起来很痛苦
      whitelist: false,
    }),
  );

  // 4. 统一响应与错误格式
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // 5. Swagger 文档
  const swaggerConfig = new DocumentBuilder()
    .setTitle("后台管理框架 API")
    .setDescription(
      "多租户、配置驱动的后台管理系统。\n\n" +
        "认证方式：先调 /api/auth/login 拿 token，再点右上角 Authorize 填入 token。\n" +
        "超管账号见 server/.env 里的 SUPER_ADMIN_*，登录后可用请求头 X-System-Code 切换子系统。",
    )
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number(configService.get<string>("PORT") || 3000);
  await app.listen(port, "0.0.0.0");

  Logger.log(`后端已启动：http://127.0.0.1:${port}/api`, "Bootstrap");
  Logger.log(`接口文档：  http://127.0.0.1:${port}/api/docs`, "Bootstrap");
}

bootstrap();
