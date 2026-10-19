import {hasAllPermissions, hasPermission} from './permissions'

/**
 * 权限判定的单元测试。
 * 这套规则前后端共用（前端也按同样的语义决定菜单和按钮显不显示），
 * 所以边界必须测清楚。
 */
describe('permissions 权限判定', () => {
    describe('hasPermission', () => {
        it('超管永远有权限，哪怕权限数组是空的', () => {
            expect(hasPermission([], true, 'system:manage')).toBe(true)
            expect(hasPermission(undefined, true, 'data:delete')).toBe(true)
        })

        it('普通用户按权限码数组判断', () => {
            expect(hasPermission(['data:read'], false, 'data:read')).toBe(true)
            expect(hasPermission(['data:read'], false, 'data:delete')).toBe(false)
        })

        it('通配符 * 代表全部权限', () => {
            expect(hasPermission(['*'], false, 'table:create')).toBe(true)
        })

        it('空权限需求视为通过（接口没声明权限 = 登录即可）', () => {
            expect(hasPermission([], false, '')).toBe(true)
        })
    })

    describe('hasAllPermissions', () => {
        it('要求全部具备', () => {
            expect(hasAllPermissions(['a', 'b'], false, ['a', 'b'])).toBe(true)
            expect(hasAllPermissions(['a'], false, ['a', 'b'])).toBe(false)
        })

        it('没有声明需求时直接通过', () => {
            expect(hasAllPermissions([], false, [])).toBe(true)
            expect(hasAllPermissions([], false, undefined)).toBe(true)
        })

        it('超管跳过全部检查', () => {
            expect(hasAllPermissions([], true, ['x', 'y'])).toBe(true)
        })
    })
})
