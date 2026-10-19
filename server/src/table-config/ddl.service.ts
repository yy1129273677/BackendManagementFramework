import {Injectable, Logger} from '@nestjs/common'
import {assertIdentifier, physicalTableName} from '../common/identifiers'
import {PrismaService} from '../prisma/prisma.service'
import {sqlTypeFor, TableField} from './table-field.types'

/**
 * 物理表操作（DDL）。
 *
 * 干什么：
 *   把「表格配置里的字段」变成真实的数据库列：
 *   - 新建配置 → CREATE TABLE biz_<tcid> (...)
 *   - 配置里加字段 → ALTER TABLE ... ADD COLUMN ...
 *   - 删除配置 → DROP TABLE IF EXISTS ...
 *
 * 安全说明（重要）：
 *   PostgreSQL 不支持把表名/列名做成参数，只能拼进 SQL 文本（这是语言限制）。
 *   所以这里的表名、列名、列类型全部来自「白名单校验过的配置」：
 *     - 表名由 TCID 生成，形如 biz_xxx，必须过 assertIdentifier
 *     - 列名必须过 assertIdentifier（正则 + 关键字黑名单）
 *     - 列类型必须来自 SQL_TYPE_MAP（固定字符串，不来自用户输入）
 *   表格里的**数据**一律走 Prisma 参数化查询，绝不拼字符串。
 */
@Injectable()
export class DdlService {
    private readonly logger = new Logger('DDL')

    constructor(private readonly prisma: PrismaService) {
    }

    /** 建表：id / created_at / updated_at 是固定列，其余来自配置 */
    async createTable(tcid: string, fields: TableField[]): Promise<void> {
        const table = physicalTableName(tcid)
        const columns = fields.map((field) => this.columnDefinition(field)).join(',\n    ')

        const sql = `
            CREATE TABLE IF NOT EXISTS "${table}" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now()${columns ? ',\n    ' + columns : ''}
            )
        `
        await this.prisma.$executeRawUnsafe(sql)
        this.logger.log(`已创建物理表 ${table}（${fields.length} 个业务字段）`)
    }

    /**
     * 给已有表补列。
     *
     * 用途：超管在已有表格上加字段。
     * 注意：只会 ADD COLUMN，不会删除/改名/改类型——
     *       删列会丢数据、改类型可能失败并锁表，这两件事必须人工确认后手工执行（见 docs/design/06-failure.md）。
     */
    async addColumns(tcid: string, fields: TableField[]): Promise<string[]> {
        const table = physicalTableName(tcid)
        const existing = await this.listColumns(tcid)
        const added: string[] = []

        for (const field of fields) {
            if (existing.includes(field.name)) continue
            const sql = `ALTER TABLE "${table}" ADD COLUMN ${this.columnDefinition(field)}`
            await this.prisma.$executeRawUnsafe(sql)
            added.push(field.name)
        }

        if (added.length > 0) {
            this.logger.log(`物理表 ${table} 新增列：${added.join(', ')}`)
        }
        return added
    }

    /** 删表（危险操作：数据不可恢复） */
    async dropTable(tcid: string): Promise<void> {
        const table = physicalTableName(tcid)
        await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}"`)
        this.logger.warn(`已删除物理表 ${table}`)
    }

    /** 查询物理表当前的列名（用来判断哪些字段是新加的） */
    async listColumns(tcid: string): Promise<string[]> {
        const table = physicalTableName(tcid)
        const rows = await this.prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
            `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
            table,
        )
        return rows.map((row) => row.column_name)
    }

    /**
     * 生成一列的 DDL 片段。
     * 列名和类型都经过校验/白名单，唯一可能来自用户的是列名，已被 assertIdentifier 卡死。
     */
    private columnDefinition(field: TableField): string {
        const name = assertIdentifier(field.name)
        const type = sqlTypeFor(field.type)
        // 业务列一律允许为空：加字段时不会因为老数据没有值而失败；必填在接口层校验
        return `"${name}" ${type}`
    }
}
