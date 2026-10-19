import { generateTcid, TCID_ALPHABET, TCID_LENGTH, isValidTcid } from "./tcid.generator";

/**
 * TCID 生成器测试。
 *
 * 关注点：
 *   - 格式必须固定（前端输入框、正则校验、表名生成都依赖它）
 *   - 不能包含容易看错的字符（0/1/I/O）
 *   - 大量生成时不能撞车
 */
describe("TCID 生成器", () => {
  it("长度固定为 11 位且以 T 开头", () => {
    const tcid = generateTcid();
    expect(tcid).toHaveLength(TCID_LENGTH);
    expect(tcid.startsWith("T")).toBe(true);
  });

  it("只使用去歧义字符集（不含 0、1）", () => {
    for (let index = 0; index < 200; index += 1) {
      const suffix = generateTcid().slice(1);
      for (const char of suffix) {
        expect(TCID_ALPHABET).toContain(char);
      }
      // 数字 0/1 永不出现，所以字母 O/I 不会和它们看混
      expect(suffix).not.toMatch(/[01]/);
    }
  });

  it("连续生成 2000 个不重复", () => {
    const set = new Set<string>();
    for (let index = 0; index < 2000; index += 1) {
      set.add(generateTcid());
    }
    expect(set.size).toBe(2000);
  });

  it("isValidTcid 能识别合法与非法格式", () => {
    expect(isValidTcid(generateTcid())).toBe(true);
    expect(isValidTcid("TDEMOORDERS")).toBe(true);
    expect(isValidTcid("TDEMOORDER")).toBe(false); // 长度不对
    expect(isValidTcid("XDEMOORDERS")).toBe(false); // 前缀不对
    expect(isValidTcid("Tdemoorders")).toBe(false); // 小写不合法
    expect(isValidTcid("TDEMOORDER0")).toBe(false); // 含被排除的数字 0
    expect(isValidTcid("")).toBe(false);
    expect(isValidTcid(undefined as any)).toBe(false);
  });
});
