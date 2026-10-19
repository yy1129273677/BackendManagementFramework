import {assertIdentifier, isValidIdentifier, physicalTableName} from '../common/identifiers'

/**
 * 字段名/表名校验的单元测试。
 *
 * 为什么这块必须有测试：
 *   这是全系统唯一「把用户输入拼进 SQL 文本」的地方，
 *   一旦这里松了口子，就是 SQL 注入。所以校验函数必须被测试钉死。
 */
describe('identifiers 数据库标识符校验', () => {
    describe('isValidIdentifier', () => {
        it('接受正常的字段名', () => {
            expect(isValidIdentifier('user_name')).toBe(true)
            expect(isValidIdentifier('amount')).toBe(true)
            expect(isValidIdentifier('a1')).toBe(true)
            expect(isValidIdentifier('order_status_2')).toBe(true)
        })

        it('拒绝大写字母、数字开头、中文、空字符串', () => {
            expect(isValidIdentifier('UserName')).toBe(false)
            expect(isValidIdentifier('1name')).toBe(false)
            expect(isValidIdentifier('用户名')).toBe(false)
            expect(isValidIdentifier('')).toBe(false)
        })

        it('拒绝包含 SQL 语法字符的注入尝试', () => {
            expect(isValidIdentifier('a; drop table x')).toBe(false)
            expect(isValidIdentifier('a" OR 1=1 --')).toBe(false)
            expect(isValidIdentifier("a'--")).toBe(false)
            expect(isValidIdentifier('a b')).toBe(false)
            expect(isValidIdentifier('a--b')).toBe(false)
            expect(isValidIdentifier('a)')).toBe(false)
        })

        it('拒绝数据库关键字和我们保留的固定列名', () => {
            expect(isValidIdentifier('select')).toBe(false)
            expect(isValidIdentifier('table')).toBe(false)
            expect(isValidIdentifier('id')).toBe(false)
            expect(isValidIdentifier('created_at')).toBe(false)
        })

        it('拒绝超长名字（PostgreSQL 标识符上限是 63）', () => {
            expect(isValidIdentifier('a'.repeat(49))).toBe(false)
        })
    })

    describe('assertIdentifier', () => {
        it('合法名字原样返回', () => {
            expect(assertIdentifier('price')).toBe('price')
        })

        it('不合法名字抛出带中文说明的错误', () => {
            expect(() => assertIdentifier('select')).toThrow(/不合法/)
            expect(() => assertIdentifier('a;drop')).toThrow(/不合法/)
        })
    })

    describe('physicalTableName', () => {
        it('按 biz_ + tcid 小写生成表名', () => {
            expect(physicalTableName('TDEMOORDERS')).toBe('biz_tdemoorders')
            expect(physicalTableName('T7K2M9QXAB')).toBe('biz_t7k2m9qxab')
        })

        it('TCID 里混入非法字符时直接拒绝', () => {
            expect(() => physicalTableName('T;drop')).toThrow()
            expect(() => physicalTableName('')).toThrow()
        })
    })
})
