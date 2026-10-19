/**
 * 数据库标识符（表名 / 列名）安全校验。
 *
 * 干什么：
 *   本系统的表格是「配置即建表」—— 超管在页面上加一个字段，后端就真的对数据库
 *   执行一次 ALTER TABLE ADD COLUMN。这意味着表名和列名会进入 SQL 语句，
 *   如果直接拼接用户输入，就是教科书级的 SQL 注入。
 *   所以所有标识符必须先过这里：只放行「小写字母开头 + 小写字母/数字/下划线」。
 *
 * 注意：
 *   - 校验只允许标识符，不允许引号、分号、空格、注释符号
 *   - 关键字黑名单挡住 select / drop / table 这类容易混淆的名字
 *   - 值（表格里的数据）一律走参数化查询，不经过这里
 */

/** 标识符最大长度（PostgreSQL 上限是 63，留点余量） */
const MAX_IDENTIFIER_LENGTH = 48

/** 标识符必须满足的正则：小写字母开头，只含小写字母、数字、下划线 */
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{0,47}$/

/**
 * 保留字黑名单。
 * 目的不是穷举 PostgreSQL 全部关键字，而是挡住「最容易造成误导和破坏」的那些，
 * 以及我们自己保留的固定列名（id / created_at / updated_at）。
 */
const RESERVED_WORDS = new Set([
    'select', 'insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate',
    'table', 'index', 'view', 'schema', 'database', 'grant', 'revoke', 'union',
    'where', 'from', 'into', 'values', 'set', 'join', 'on', 'and', 'or', 'not',
    'id', 'created_at', 'updated_at', 'pg_catalog', 'information_schema',
])

/**
 * 判断一个字符串能不能安全地当作数据库标识符（列名）。
 *
 * 参数：
 *   name - 待校验的字段名，比如 "user_name"
 *
 * 返回：
 *   合法返回 true
 *
 * 注意：
 *   空字符串、大写字母、中文、带引号的名字都会返回 false。
 *   字段名请在前端就规范成小写英文加下划线。
 */
export function isValidIdentifier(name: string): boolean {
    if (typeof name !== 'string') return false
    if (name.length === 0 || name.length > MAX_IDENTIFIER_LENGTH) return false
    if (!IDENTIFIER_PATTERN.test(name)) return false
    if (RESERVED_WORDS.has(name)) return false
    return true
}

/**
 * 校验并返回列名，不合法直接抛错。
 *
 * 参数：
 *   name - 字段名
 *
 * 返回：
 *   原样返回（方便链式写代码）
 *
 * 异常：
 *   不合法时抛出带中文说明的 Error，交给上层转成 400
 */
export function assertIdentifier(name: string): string {
    if (!isValidIdentifier(name)) {
        throw new Error(
            `字段名「${name}」不合法：只能用小写字母开头，包含小写字母、数字、下划线，且不能是数据库关键字（如 id、select、table）`,
        )
    }
    return name
}

/**
 * 由 TCID 生成物理表名。
 *
 * 干什么：
 *   一个 TCID 对应一张真实数据库表，命名规则固定为 biz_ + tcid 小写。
 *   比如 TCID = "TDEMOORDERS" → 表名 "biz_tdemoorders"。
 *
 * 注意：
 *   先校验 TCID 本身（只允许字母数字），否则空串会拼出 "biz_" 这种
 *   看起来「像合法标识符但其实是残废表名」的东西。
 */
export function physicalTableName(tcid: string): string {
    const raw = String(tcid || '').trim()
    if (!/^[A-Za-z0-9]{1,32}$/.test(raw)) {
        throw new Error(`TCID「${tcid}」无法转成合法的数据库表名`)
    }

    const table = `biz_${raw.toLowerCase()}`
    if (!isValidIdentifier(table)) {
        throw new Error(`TCID「${tcid}」无法转成合法的数据库表名`)
    }
    return table
}
