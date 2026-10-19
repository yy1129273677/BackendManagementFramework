import { escapeLike, parseSearchPayload, toSql } from "./search-builder";
import { TableField } from "../table-config/table-field.types";

/**
 * 搜索 DSL 的单元测试。
 *
 * 这是全系统第二处安全关键代码：
 *   前端传啥都不能变成原始 SQL 片段，只能变成「字段 + 运算符 + 参数」。
 *   这里重点测三件事：
 *     1. 非法输入被拒绝（字段不在配置、运算符不认识、类型不匹配）
 *     2. 空条件被正确忽略（不要生成 WHERE 1=1 这种噪音）
 *     3. 值永远进参数位，而不是拼进 SQL 文本
 */
const fields: TableField[] = [
  {
    name: "order_no",
    label: "订单号",
    type: "string",
    searchable: true,
    searchOp: "like",
  },
  {
    name: "amount",
    label: "金额",
    type: "number",
    searchable: true,
    searchOp: "between",
  },
  {
    name: "status",
    label: "状态",
    type: "string",
    searchable: true,
    searchOp: "eq",
  },
  {
    name: "is_paid",
    label: "是否付款",
    type: "boolean",
    searchable: true,
    searchOp: "eq",
  },
  { name: "secret_note", label: "内部备注", type: "string", searchable: false },
];

/** 从 Prisma.Sql 里取出 SQL 模板文本和参数（不同版本字段名略有差异，这里做兼容） */
function inspect(sql: any): { text: string; values: any[] } {
  const strings: string[] = sql?.strings || [];
  const text = strings.length > 0 ? strings.join("?") : String(sql?.text || "");
  return { text, values: sql?.values || [] };
}

describe("search-builder 搜索条件解析", () => {
  it("空条件返回 null（不加 WHERE）", () => {
    expect(parseSearchPayload(null, fields, "AND")).toBeNull();
    expect(parseSearchPayload({ conditions: [] }, fields, "AND")).toBeNull();
    expect(parseSearchPayload({ conditions: [{ field: "status", op: "eq", value: "" }] }, fields, "AND")).toBeNull();
  });

  it("AND 模式：多条条件合成一个 AND 组", () => {
    const parsed = parseSearchPayload(
      {
        conditions: [
          { field: "status", op: "eq", value: "paid" },
          { field: "amount", op: "gt", value: "100" },
        ],
      },
      fields,
      "AND",
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.logic).toBe("AND");
    expect(parsed!.children).toHaveLength(2);
    expect((parsed!.children[0] as any).values).toEqual(["paid"]);
    expect((parsed!.children[1] as any).values).toEqual([100]);
  });

  it("OR 模式：逻辑改成 OR", () => {
    const parsed = parseSearchPayload(
      {
        conditions: [
          { field: "status", op: "eq", value: "a" },
          { field: "status", op: "eq", value: "b" },
        ],
      },
      fields,
      "OR",
    );
    expect(parsed!.logic).toBe("OR");
  });

  it("CUSTOM 模式：支持嵌套条件组和 NOT", () => {
    const parsed = parseSearchPayload(
      {
        mode: "CUSTOM",
        group: {
          logic: "OR",
          conditions: [{ field: "status", op: "eq", value: "paid" }],
          groups: [
            {
              logic: "AND",
              not: true,
              conditions: [{ field: "amount", op: "lt", value: 10 }],
            },
          ],
        },
      },
      fields,
      "CUSTOM",
    );
    expect(parsed!.logic).toBe("OR");
    expect(parsed!.children).toHaveLength(2);
    const nested = parsed!.children[1] as any;
    expect(nested.not).toBe(true);
    expect(nested.logic).toBe("AND");
  });

  it("拒绝不在配置里的字段", () => {
    expect(() =>
      parseSearchPayload({ conditions: [{ field: "password", op: "eq", value: "x" }] }, fields, "AND"),
    ).toThrow(/不在表格配置里/);
  });

  it("拒绝未开启搜索的字段", () => {
    expect(() =>
      parseSearchPayload({ conditions: [{ field: "secret_note", op: "eq", value: "x" }] }, fields, "AND"),
    ).toThrow(/未开启搜索/);
  });

  it("拒绝不认识的运算符", () => {
    expect(() =>
      parseSearchPayload({ conditions: [{ field: "status", op: "drop", value: "x" }] }, fields, "AND"),
    ).toThrow(/不支持/);
  });

  it("拒绝在数字字段上做模糊搜索", () => {
    expect(() =>
      parseSearchPayload({ conditions: [{ field: "amount", op: "like", value: "1" }] }, fields, "AND"),
    ).toThrow(/不支持模糊搜索/);
  });

  it("区间搜索必须给两个值", () => {
    expect(() =>
      parseSearchPayload({ conditions: [{ field: "amount", op: "between", value: [1] }] }, fields, "AND"),
    ).toThrow(/两个值/);
  });

  it("in 支持逗号分隔字符串", () => {
    const parsed = parseSearchPayload(
      { conditions: [{ field: "status", op: "in", value: "paid,shipped" }] },
      fields,
      "AND",
    );
    expect((parsed!.children[0] as any).values).toEqual(["paid", "shipped"]);
  });

  it("布尔字段能正确转换 true/false", () => {
    const parsed = parseSearchPayload({ conditions: [{ field: "is_paid", op: "eq", value: "true" }] }, fields, "AND");
    expect((parsed!.children[0] as any).values).toEqual([true]);
  });
});

describe("search-builder 生成 SQL 片段", () => {
  it("列名被双引号包裹，值进入参数位", () => {
    const parsed = parseSearchPayload({ conditions: [{ field: "status", op: "eq", value: "paid" }] }, fields, "AND")!;
    const { text, values } = inspect(toSql(parsed));
    expect(text).toContain('"status"');
    expect(text).toContain("=");
    expect(text).not.toContain("paid");
    expect(values).toContain("paid");
  });

  it("模糊搜索自动加 % 并转义 LIKE 通配符", () => {
    const parsed = parseSearchPayload(
      { conditions: [{ field: "order_no", op: "like", value: "100%" }] },
      fields,
      "AND",
    )!;
    const { values } = inspect(toSql(parsed));
    expect(values[0]).toBe("%100\\%%");
  });

  it("注入字符串只会变成普通参数值", () => {
    const evil = "' OR 1=1 --";
    const parsed = parseSearchPayload({ conditions: [{ field: "status", op: "eq", value: evil }] }, fields, "AND")!;
    const { text, values } = inspect(toSql(parsed));
    expect(text).not.toContain("OR 1=1");
    expect(values).toContain(evil);
  });

  it("in 运算符生成 IN (...) 且每个值都是独立参数", () => {
    const parsed = parseSearchPayload(
      { conditions: [{ field: "status", op: "in", value: ["a", "b"] }] },
      fields,
      "AND",
    )!;
    const { values } = inspect(toSql(parsed));
    expect(values).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("NOT 组会生成 NOT (...) 包裹", () => {
    const parsed = parseSearchPayload(
      {
        mode: "CUSTOM",
        group: {
          logic: "AND",
          not: true,
          conditions: [{ field: "status", op: "eq", value: "x" }],
        },
      },
      fields,
      "CUSTOM",
    )!;
    const { text } = inspect(toSql(parsed));
    expect(text).toContain("NOT (");
  });
});

describe("escapeLike", () => {
  it("转义反斜杠、百分号和下划线", () => {
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
    expect(escapeLike("普通文本")).toBe("普通文本");
  });
});
