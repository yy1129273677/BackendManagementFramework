import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/http-exception.filter";
import { ResponseInterceptor } from "./common/response.interceptor";

/**
 * 后端启动入口。
 *
 * 干了这些事：
 *   1. 安全响应头 helmet
 *   2. 信任代理（限流要按真实客户端 IP 统计，见下面说明）
 *   3. 全局路由前缀 /api（前端所有请求都是 /api/xxx）
 *   4. 全局校验管道：请求体做类型转换，但不清洗多余字段（DTO 里没有的字段会被忽略）
 *   5. 全局响应拦截器：统一包成 { code, message, data }
 *   6. 全局异常过滤器：统一错误格式 + 中文提示
 *   7. Swagger 文档：/api/docs
 *   8. 监听 0.0.0.0，容器里也能被外部访问（只监听 127.0.0.1 的话 Docker 端口映射会失效）
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // 生产环境不打 SQL 之类的调试日志
    logger: ["error", "warn", "log"],
  });

  const configService = app.get(ConfigService);

  // 1. 安全响应头。
  //    CSP 故意关掉：这个服务返回的 HTML 只有 Swagger UI，它依赖内联脚本，开了 CSP 会导致文档白屏；
  //    真正的前端页面由 Nginx 托管（见 client/nginx.conf），CSP 应该在外层配，不在这里。
  //    其余响应头（X-Content-Type-Options、X-Frame-Options、Referrer-Policy 等）保留默认值。
  app.use(helmet({ contentSecurityPolicy: false }));

  // 2. 信任反向代理。
  //    线上请求链路是「浏览器 → Nginx(web 容器) → server 容器」，如果不开 trust proxy，
  //    Express 看到的客户端 IP 永远等于 Nginx 容器的内网 IP —— 限流会把所有用户算成同一个人，
  //    登录 5 次/分钟就变成「全站每分钟只能登录 5 次」。
  //    为什么只信任内网地址而不是 "1"：3001 端口是直接从公网访问后端的，
  //    如果无条件信任 X-Forwarded-For，别人伪造这个头就能绕过限流。
  app.set("trust proxy", "loopback, linklocal, uniquelocal");

  // 3. 统一 /api 前缀
  app.setGlobalPrefix("api");

  // 4. 跨域：开发时前端在 5173 端口，和后端 3000 不同源。
  //    生产环境必须显式配置 CORS_ORIGIN；没配就拒绝启动，避免带着 origin: true（接受任意来源）上线。
  const corsOrigin = configService.get<string>("CORS_ORIGIN");
  const isProduction = configService.get<string>("NODE_ENV") === "production";
  if (isProduction && !corsOrigin) {
    throw new Error("生产环境（NODE_ENV=production）必须设置 CORS_ORIGIN，例如 https://your-domain.com");
  }
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(",").map((item) => item.trim()) : true,
    credentials: true,
  });

  // 5. 请求体校验 / 类型转换
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      // 关掉白名单：本项目的 DTO 很少，字段由 service 显式挑选，
      // 开白名单反而容易把合法字段悄悄过滤掉，排查起来很痛苦
      whitelist: false,
    }),
  );

  // 6. 统一响应与错误格式
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // 7. Swagger 文档
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
