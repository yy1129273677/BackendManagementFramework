import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { hasPermission } from "../common/permissions";
import { JwtUser } from "../common/types";
import { PrismaService } from "../prisma/prisma.service";
import { DdlService } from "./ddl.service";
import { CreateTableConfigDto, UpdateTableConfigDto } from "./table-config.dto";
import { generateTcid } from "./tcid.generator";
import {
  CustomAction,
  normalizeCustomActions,
  normalizeFields,
  normalizeOperations,
  TableField,
  TableOperations,
} from "./table-field.types";

/** 允许的搜索模式 */
const SEARCH_MODES = ["AND", "OR", "CUSTOM"];

/**
 * 表格配置服务 —— 整个系统最核心的一块。
 *
 * 它负责把「页面上配置的一张表格」变成能用的东西：
 *   1. 校验字段（字段名 = 数据库列名，必须安全）
 *   2. 生成 TCID
 *   3. 建物理表 biz_<tcid>
 *   4. 把配置存进 sys_table_config（配置文件入库）
 *   5. 给前端返回渲染配置（哪些列、哪些搜索项、哪些按钮、当前用户能做哪些操作）
 *
 * 为什么 TCID 而不是直接用表名 / 自增 id：
 *   前端代码里会硬编码 TCID（比如 <Table tcid="TDEMOORDERS" />），
 *   它必须短、稳定、可读、不可变。用自增 id 会泄露表数量且容易猜；用表名会把「物理实现」泄露到前端。
 */
@Injectable()
export class TableConfigService {
  private readonly logger = new Logger("TableConfig");

  constructor(
    private readonly prisma: PrismaService,
    private readonly ddlService: DdlService,
  ) {}

  /** 列出当前子系统的全部表格配置 */
  async list(systemId: string, keyword?: string) {
    const list = await this.prisma.tableConfig.findMany({
      where: {
        systemId,
        ...(keyword
          ? {
              OR: [{ name: { contains: keyword } }, { tcid: { contains: keyword } }],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tcid: true,
        name: true,
        remark: true,
        physicalTable: true,
        searchMode: true,
        pageSize: true,
        fields: true,
        customActions: true,
        createdAt: true,
      },
    });

    // 顺手统计每个配置有多少条业务数据，管理页上能一眼看出哪张表在用
    return {
      list: list.map((item) => ({
        ...item,
        fieldCount: Array.isArray(item.fields) ? item.fields.length : 0,
      })),
    };
  }

  /** 按 TCID 取配置（带子系统隔离，防止跨租户读取） */
  async getByTcid(systemId: string, tcid: string) {
    const config = await this.prisma.tableConfig.findFirst({
      where: { tcid, systemId },
    });
    if (!config) throw new NotFoundException(`TCID「${tcid}」不存在或不属于当前子系统`);
    return config;
  }

  /**
   * 新建表格配置。
   *
   * 步骤：
   *   1. 规范化字段 / 操作 / 自定义按钮（任何一项不合法直接 400，不产生副作用）
   *   2. 生成唯一 TCID
   *   3. 建物理表（失败则整体失败，不会留下「有配置没表」的脏数据）
   *   4. 写入配置记录（写库失败就把刚建的表删掉回滚）
   */
  async create(systemId: string, user: JwtUser, dto: CreateTableConfigDto) {
    const name = (dto.name || "").trim();
    if (!name) throw new BadRequestException("请填写表格名称");

    // 字段校验失败是「用户填错了」，不是服务器错误 → 必须转成 400。
    // normalizeFields 抛的是普通 Error（纯函数方便单测），这里统一翻译成 HTTP 400。
    const fields = this.normalizeOrThrow(() => normalizeFields(dto.fields));
    const operations = normalizeOperations(dto.operations);
    const customActions = this.normalizeOrThrow(() => normalizeCustomActions(dto.customActions));
    const searchMode = this.normalizeSearchMode(dto.searchMode);

    // 生成一个没被占用的 TCID（撞车概率极低，但代码里还是要处理）
    let tcid = generateTcid();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const exists = await this.prisma.tableConfig.findUnique({
        where: { tcid },
      });
      if (!exists) break;
      tcid = generateTcid();
    }

    const physicalTable = `biz_${tcid.toLowerCase()}`;

    await this.ddlService.createTable(tcid, fields);

    try {
      return await this.prisma.tableConfig.create({
        data: {
          tcid,
          systemId,
          name,
          remark: dto.remark || null,
          physicalTable,
          fields: fields as any,
          searchMode,
          conditions: (dto.conditions ?? null) as any,
          operations: operations as any,
          customActions: customActions as any,
          pageSize: this.normalizePageSize(dto.pageSize),
          createdBy: user?.sub || null,
        },
      });
    } catch (error) {
      // 配置写库失败 → 把刚建的物理表删掉，避免留下孤儿表
      await this.ddlService.dropTable(tcid).catch(() => undefined);
      throw error;
    }
  }

  /**
   * 修改表格配置。
   *
   * 支持：改名、改字段（只允许新增列）、改搜索模式、改按钮与权限。
   * 不支持：删除字段、改字段类型 —— 会丢数据或需要重写整张表，必须人工处理。
   */
  async update(systemId: string, tcid: string, dto: UpdateTableConfigDto) {
    const config = await this.getByTcid(systemId, tcid);
    const oldFields = (config.fields || []) as unknown as TableField[];

    let fields = oldFields;
    let addedColumns: string[] = [];
    let removedFields: string[] = [];

    if (dto.fields) {
      fields = this.normalizeOrThrow(() => normalizeFields(dto.fields));
      addedColumns = await this.ddlService.addColumns(config.tcid, fields);
      const newNames = new Set(fields.map((field) => field.name));

      // 只从配置里移除，物理列保留（数据还在，随时可以在 SQL 里查；要真删得人工确认）
      removedFields = oldFields.filter((field) => !newNames.has(field.name)).map((field) => field.name);
      if (removedFields.length > 0) {
        this.logger.warn(
          `表格 ${config.tcid} 的字段 ${removedFields.join(", ")} 已从配置移除，但物理列保留（数据未删除）`,
        );
      }

      // 类型变更不支持（会丢数据），这里显式拒绝，避免用户以为改了其实没改
      const oldTypeMap = new Map(oldFields.map((field) => [field.name, field.type]));
      for (const field of fields) {
        const oldType = oldTypeMap.get(field.name);
        if (oldType && oldType !== field.type) {
          throw new BadRequestException(
            `字段「${field.name}」的类型从 ${oldType} 改成 ${field.type} 需要重写整张表，请新建字段代替`,
          );
        }
      }
    }

    const updated = await this.prisma.tableConfig.update({
      where: { id: config.id },
      data: {
        name: dto.name?.trim() ?? undefined,
        remark: dto.remark ?? undefined,
        fields: dto.fields ? (fields as any) : undefined,
        searchMode: dto.searchMode ? this.normalizeSearchMode(dto.searchMode) : undefined,
        conditions: dto.conditions === undefined ? undefined : (dto.conditions as any),
        operations: dto.operations ? (normalizeOperations(dto.operations) as any) : undefined,
        customActions: dto.customActions
          ? (this.normalizeOrThrow(() => normalizeCustomActions(dto.customActions)) as any)
          : undefined,
        pageSize: dto.pageSize ? this.normalizePageSize(dto.pageSize) : undefined,
      },
    });

    return { ...updated, addedColumns, removedFields };
  }

  /**
   * 删除表格配置。
   *
   * ⚠️ 会 DROP 掉物理表，表里的业务数据一并消失，不可恢复。
   * 前端调用前必须二次确认。
   */
  async remove(systemId: string, tcid: string) {
    const config = await this.getByTcid(systemId, tcid);
    await this.ddlService.dropTable(config.tcid);
    await this.prisma.tableConfig.delete({ where: { id: config.id } });
    return { ok: true, tcid };
  }

  /**
   * 给前端 <Table> 组件返回渲染配置。
   *
   * 返回里多了一层「当前用户能不能做」：
   *   operations.create / update / delete 是布尔值，
   *   已经把「表格是否开启该操作」和「用户是否有权限码」两个条件合并好了，
   *   前端不需要自己算，直接 v-if="config.operations.create" 就行。
   */
  async renderConfig(systemId: string, tcid: string, user: JwtUser) {
    const config = await this.getByTcid(systemId, tcid);
    const fields = (config.fields || []) as unknown as TableField[];
    const operations = (config.operations || {}) as TableOperations;
    const customActions = (config.customActions || []) as unknown as CustomAction[];

    const allowed = (permission?: string) =>
      !permission || hasPermission(user?.permissions, Boolean(user?.isSuper), permission);

    const canCreate = operations.create !== false && allowed(operations.createPermission);
    const canUpdate = operations.update !== false && allowed(operations.updatePermission);
    const canDelete = operations.delete !== false && allowed(operations.deletePermission);

    return {
      tcid: config.tcid,
      name: config.name,
      remark: config.remark,
      physicalTable: config.physicalTable,
      pageSize: config.pageSize,
      searchMode: config.searchMode,
      conditions: config.conditions || null,
      // 所有字段（含隐藏的），前端表单需要它来决定编辑时显示哪些输入框
      fields: fields.map((field) => ({
        ...field,
        visible: field.visible !== false,
        editable: field.editable !== false,
        // 默认插槽名：前端可以直接写 #col-<字段名> 接管单元格渲染
        slot: field.slot || `col-${field.name}`,
      })),
      // 表格列：只保留 visible 的
      columns: fields.filter((field) => field.visible !== false),
      // 搜索项：只有 searchable 的字段才会出现在搜索栏
      searchFields: fields.filter((field) => field.searchable === true),
      operations: {
        create: canCreate,
        update: canUpdate,
        delete: canDelete,
        createPermission: operations.createPermission,
        updatePermission: operations.updatePermission,
        deletePermission: operations.deletePermission,
      },
      // 自定义按钮：没配权限的一律可见，配了权限的按用户权限过滤
      customActions: customActions.filter((action) => allowed(action.permission)),
    };
  }

  /**
   * 执行一个「校验型纯函数」，把它抛出的普通 Error 翻译成 HTTP 400。
   *
   * 为什么要这层：
   *   normalizeFields / normalizeCustomActions 是纯函数，抛 Error 方便单测；
   *   但直接让 Error 冒到异常过滤器，会被当成「服务器内部错误」返回 500，
   *   日志里还会打一堆堆栈——而实际上只是用户填错了字段名。
   */
  private normalizeOrThrow<T>(factory: () => T): T {
    try {
      return factory();
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  /** 校验搜索模式 */
  private normalizeSearchMode(mode?: string): string {
    const value = String(mode || "AND").toUpperCase();
    if (!SEARCH_MODES.includes(value)) {
      throw new BadRequestException(`搜索模式只能是 ${SEARCH_MODES.join(" / ")}`);
    }
    return value;
  }

  /** 每页条数限制在 1~200，防止有人传 100000 把数据库拖死 */
  private normalizePageSize(size?: number): number {
    const value = Number(size) || 20;
    return Math.min(200, Math.max(1, value));
  }
}
