import * as fs from "fs";
import * as path from "path";

/**
 * 控制器约定检查（源码扫描，不连数据库）。
 *
 * 干什么：
 *   读 server/src 下所有 *.controller.ts 的源码文本，检查三件事有没有做到：
 *     1. 每个路由方法（@Get/@Post/...）上方是否写了 @ApiOperation（Swagger 说明）
 *     2. 需要登录的 controller 是否有 @ApiBearerAuth（公开接口用 @Public 标注后豁免）
 *     3. 静态接口是否用 DTO 接 @Body()，而不是裸 any
 *
 * 为什么用扫源码而不是 e2e：
 *   项目的硬性规则是「后端单测不能连数据库」。真正验证 401/403 需要起服务 + 建库，
 *   那属于 e2e（server/test/ 下单独跑）。这里做的是"写代码时是否漏了注解"的静态检查，
 *   tsc 查不出这类问题，但漏了会让 Swagger 文档重新变成"只有路径没有内容"。
 *
 * 注意：
 *   - 扫描依赖现有代码风格（装饰器 2 空格缩进），如果以后整体重排代码，先跑一遍这个测试再改。
 *   - 新增了"允许例外"的接口，要在下面的 EXEMPT_* 常量里写清原因，不要直接删断言。
 */

/** 源码根目录：当前文件在 src/common/ 下，往上一级就是 src/ */
const SRC_ROOT = path.join(__dirname, "..");

/** 只扫这些后缀的文件 */
const CONTROLLER_SUFFIX = ".controller.ts";

/** 路由装饰器的写法：两个空格缩进 + @Get/@Post/... + 左括号 */
const ROUTE_DECORATOR = /^ {2}@(Get|Post|Patch|Put|Delete)\(/;

/**
 * 允许"整个文件不需要 @ApiBearerAuth"的例外。
 * 判据是文件里有 @Public() 标注；健康检查就是这种公开接口。
 */
const PUBLIC_MARKER = "@Public(";

/**
 * 允许用 any / Record<string, any> 接 @Body() 的例外文件。
 * 原因：表格数据接口的字段是运行时配置出来的，无法静态建模；
 * 它靠 service 里的 editable 白名单 + 类型转换兜底，不靠 DTO。
 */
const DYNAMIC_BODY_FILES = new Set(["table-data.controller.ts"]);

/**
 * 递归列出目录下所有 controller 文件。
 *
 * 参数：
 *   dir - 要扫描的目录（绝对路径）
 * 返回：
 *   文件绝对路径数组
 */
function listControllerFiles(dir: string): string[] {
  const result: string[] = [];

  // 逐个看目录里的条目；readdirSync 带 withFileTypes 能直接判断是文件还是目录
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    // 子目录继续往下找（跳过 node_modules / dist 这些不该扫的）
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      result.push(...listControllerFiles(fullPath));
      continue;
    }

    // 只收 *.controller.ts
    if (entry.isFile() && entry.name.endsWith(CONTROLLER_SUFFIX)) {
      result.push(fullPath);
    }
  }

  return result;
}

/**
 * 取出某个路由装饰器"上方紧挨着"的装饰器块。
 *
 * 干什么：
 *   从路由那一行往上倒着读，收集连续的装饰器行，直到遇到方法签名 / 空行 / 注释为止。
 *   这样能判断「这条路由自己」有没有写 @ApiOperation，而不会误把上一个方法的注解算进来。
 *
 * 参数：
 *   lines       - 文件按行拆好的数组
 *   routeIndex  - 路由装饰器所在的行号（0 开始）
 * 返回：
 *   上方装饰器块的文本片段数组（不保证顺序，只用来做"包含"判断）
 */
function decoratorBlockAbove(lines: string[], routeIndex: number): string[] {
  const block: string[] = [];

  for (let i = routeIndex - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const trimmed = line.trim();

    // 空行说明装饰器块已经结束
    if (trimmed === "") break;

    // 装饰器本身（例如 @ApiOperation({...}) 的第一行）
    if (trimmed.startsWith("@")) {
      block.push(trimmed);
      continue;
    }

    // 装饰器参数折行：缩进 >= 4 个空格，属于上一个装饰器的参数
    if (/^ {4,}\S/.test(line)) {
      block.push(trimmed);
      continue;
    }

    // 多行装饰器的收尾行（例如 "  })"、"  })"、"  }],"）也属于装饰器块。
    // 不处理这种行会在 @ApiOperation({...}) 跨行时提前 break，误报"缺注解"。
    if (/^[)\]}]/.test(trimmed)) {
      block.push(trimmed);
      continue;
    }

    // 方法签名、注释等：装饰器块到此为止
    break;
  }

  return block;
}

/** 所有 controller 文件（测试多处复用，放在外层只算一次） */
const controllerFiles = listControllerFiles(SRC_ROOT);

describe("控制器约定（源码扫描）", () => {
  it("扫描器本身要能找到全部 controller，避免正则失效导致下面的用例空跑", () => {
    // 目前是 11 个 controller；以后新增会更多，这里只兜底"不能一个都没扫到"
    expect(controllerFiles.length).toBeGreaterThanOrEqual(11);
  });

  it("每个路由方法上方都必须有 @ApiOperation", () => {
    const missing: string[] = [];
    let routeCount = 0;

    for (const file of controllerFiles) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

      lines.forEach((line, index) => {
        if (!ROUTE_DECORATOR.test(line)) return;
        routeCount += 1;

        const block = decoratorBlockAbove(lines, index);
        if (!block.some((item) => item.startsWith("@ApiOperation("))) {
          // 报错信息带上文件和行号，方便直接跳过去补注解
          missing.push(`${path.relative(SRC_ROOT, file)}:${index + 1}`);
        }
      });
    }

    // 兜底：确认真的扫到了路由，否则说明正则没匹配上，用例会假通过
    expect(routeCount).toBeGreaterThanOrEqual(45);
    expect(missing).toEqual([]);
  });

  it("需要登录的 controller 必须有 @ApiBearerAuth（@Public 的公开接口豁免）", () => {
    const missing = controllerFiles
      .filter((file) => {
        const text = fs.readFileSync(file, "utf8");
        // 有 @Public 说明是公开接口，不需要 Bearer
        return !text.includes(PUBLIC_MARKER);
      })
      .filter((file) => !fs.readFileSync(file, "utf8").includes("@ApiBearerAuth("))
      .map((file) => path.relative(SRC_ROOT, file));

    expect(missing).toEqual([]);
  });

  it("静态接口必须用 DTO 接 @Body()，不能用 any（动态表格接口除外）", () => {
    const offenders: string[] = [];
    // 匹配 @Body() 后面紧跟 any 或 Record<string, any> 的写法
    const anyBody = /@Body\(\)\s*\w+\s*:\s*(any|Record<string,\s*any>)/;

    for (const file of controllerFiles) {
      if (DYNAMIC_BODY_FILES.has(path.basename(file))) continue;

      const text = fs.readFileSync(file, "utf8");
      if (anyBody.test(text)) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
