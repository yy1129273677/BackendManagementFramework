import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { hasPermission } from "../common/permissions";
import { JwtUser } from "../common/types";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRouteDto, UpdateRouteDto } from "./route.dto";

/** 路由路径合法格式：/ 开头，只允许字母、数字、-、_、/ */
const PATH_PATTERN = /^\/[A-Za-z0-9_\-/]*$/;
/** 自定义页面路径：相对 views 目录的 .vue 文件 */
const COMPONENT_PATTERN = /^[A-Za-z0-9_\-/]+\.vue$/;

/**
 * 路由（菜单）管理。
 *
 * 两种路由：
 *   CUSTOM —— 自己写的 vue 页面。超管只填「文件路径」，比如 examples/demo-table.vue，
 *             前端用 import.meta.glob 把它加载成页面。
 *   TABLE  —— 配置出来的表格。超管填一个 TCID，前端渲染成 <Table :tcid="TCID" />，
 *             整张表（搜索项、列、按钮）都由配置决定。
 *
 * 这就是「快速搭后台」的关键：加一个新页面的成本从「写代码 + 发版」降到「在后台点几下」。
 */
@Injectable()
export class RouteService {
  constructor(private readonly prisma: PrismaService) {}

  /** 当前子系统的全部路由（管理页用，能看到隐藏的） */
  async list(systemId: string) {
    const list = await this.prisma.route.findMany({
      where: { systemId },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    });
    return { list };
  }

  /**
   * 当前用户能看到的路由（前端登录后生成菜单用）。
   *
   * 过滤规则（按顺序）：
   *   1. visible = false 的不返回
   *   2. 超管不过滤
   *   3. accessType = ROLE 的菜单：用户必须有 `menu:<routeId>` 权限
   *      （这个权限码由「角色管理 → 权限树」勾选产生，不需要手填）
   *   4. 历史字段 permissionCode 如果配了，仍然要求具备该权限码（兼容老数据）
   */
  async myRoutes(user: JwtUser, systemId: string) {
    const all = await this.prisma.route.findMany({
      where: { systemId, visible: true },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    });

    const list = all.filter((route) => {
      if (user.isSuper) return true;

      // 新逻辑：按角色勾选的菜单权限
      if (route.accessType === "ROLE") {
        if (!hasPermission(user.permissions, false, `menu:${route.id}`)) return false;
      }

      // 兼容逻辑：老数据里手填的权限码
      if (route.permissionCode && !hasPermission(user.permissions, false, route.permissionCode)) {
        return false;
      }

      return true;
    });

    return { list };
  }

  /** 新建路由 */
  async create(systemId: string, dto: CreateRouteDto) {
    const payload = await this.normalize(systemId, dto, true);

    const exists = await this.prisma.route.findFirst({
      where: { systemId, path: payload.path },
    });
    if (exists) throw new ConflictException(`路径「${payload.path}」已被占用`);

    return this.prisma.route.create({ data: { ...payload, systemId } });
  }

  /** 修改路由 */
  async update(systemId: string, id: string, dto: UpdateRouteDto) {
    const route = await this.prisma.route.findFirst({
      where: { id, systemId },
    });
    if (!route) throw new NotFoundException("路由不存在");

    const payload = await this.normalize(systemId, { ...route, ...dto } as any, false);

    if (payload.path && payload.path !== route.path) {
      const exists = await this.prisma.route.findFirst({
        where: { systemId, path: payload.path, id: { not: id } },
      });
      if (exists) throw new ConflictException(`路径「${payload.path}」已被占用`);
    }

    return this.prisma.route.update({ where: { id }, data: payload });
  }

  /** 删除路由（有子路由时拒绝，避免出现孤儿菜单） */
  async remove(systemId: string, id: string) {
    const route = await this.prisma.route.findFirst({
      where: { id, systemId },
    });
    if (!route) throw new NotFoundException("路由不存在");

    const children = await this.prisma.route.count({
      where: { systemId, parentId: id },
    });
    if (children > 0) {
      throw new BadRequestException(`该路由下还有 ${children} 个子菜单，请先删除子菜单`);
    }

    await this.prisma.route.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * 校验并整理路由字段。
   *
   * 为什么要单独抽出来：
   *   新建和修改都要做同一套校验，写两份迟早会不一致。
   *   isCreate = false 时允许只传部分字段（PATCH 语义）。
   */
  private async normalize(systemId: string, dto: any, isCreate: boolean) {
    const title = (dto.title || "").trim();
    const path = (dto.path || "").trim();
    const type = (dto.type || "CUSTOM") as "CUSTOM" | "TABLE";

    if (isCreate && !title) throw new BadRequestException("请填写菜单名称");
    if (!PATH_PATTERN.test(path)) {
      throw new BadRequestException("路径不合法：必须以 / 开头，只能包含字母、数字、-、_、/");
    }
    if (type !== "CUSTOM" && type !== "TABLE") {
      throw new BadRequestException("路由类型只能是 CUSTOM 或 TABLE");
    }

    let componentPath = dto.componentPath?.trim() || null;
    let tcid = dto.tcid?.trim() || null;

    if (type === "CUSTOM") {
      if (isCreate && !componentPath) {
        throw new BadRequestException("自定义页面必须填写前端文件路径，例如 examples/demo-table.vue");
      }
      if (componentPath && !COMPONENT_PATTERN.test(componentPath)) {
        throw new BadRequestException("前端文件路径不合法：相对 src/views 的 .vue 文件，例如 examples/demo-table.vue");
      }
      tcid = null;
    } else {
      if (!tcid) throw new BadRequestException("表格页面必须绑定一个 TCID");
      const config = await this.prisma.tableConfig.findFirst({
        where: { tcid, systemId },
      });
      if (!config) throw new BadRequestException(`TCID「${tcid}」不存在或不属于当前子系统`);
      componentPath = null;
    }

    if (dto.parentId) {
      const parent = await this.prisma.route.findFirst({
        where: { id: dto.parentId, systemId },
      });
      if (!parent) throw new BadRequestException("父级菜单不存在");
    }

    // 访问控制：默认 PUBLIC（登录即可见）；ROLE 表示必须在角色权限树里勾选该菜单
    const accessType = String(dto.accessType || "PUBLIC").toUpperCase() === "ROLE" ? "ROLE" : "PUBLIC";

    // 注入给前端的 JSON 配置：允许传对象，也允许传 JSON 字符串（后台表单里是文本域）
    let config: any = null;
    const rawConfig = dto.config;
    if (rawConfig !== undefined && rawConfig !== null && rawConfig !== "") {
      if (typeof rawConfig === "string") {
        try {
          config = JSON.parse(rawConfig);
        } catch {
          throw new BadRequestException("JSON 配置不是合法的 JSON，请检查引号和逗号");
        }
      } else if (typeof rawConfig === "object") {
        config = rawConfig;
      } else {
        throw new BadRequestException("JSON 配置必须是对象、数组或 JSON 字符串");
      }

      if (JSON.stringify(config).length > 20000) {
        throw new BadRequestException("JSON 配置太大了（上限 20KB），请拆分");
      }
    }

    return {
      title,
      path,
      type,
      componentPath,
      tcid,
      parentId: dto.parentId || null,
      icon: dto.icon || null,
      sort: Number(dto.sort) || 0,
      visible: dto.visible === undefined ? true : Boolean(dto.visible),
      permissionCode: dto.permissionCode || null,
      accessType,
      config,
    };
  }
}
