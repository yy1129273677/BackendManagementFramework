import {
  defaultOperations,
  defaultSearchOp,
  normalizeCustomActions,
  normalizeFields,
  normalizeOperations,
  sqlTypeFor,
} from "./table-field.types";

/**
 * 表格字段配置的规范化测试。
 *
 * 这块是「配置即建表」的入口：
 *   字段名会被当成数据库列名，所以校验不通过就必须立刻失败，
 *   绝不能带着非法字段名去建表。
 */
describe("table-field 字段配置规范化", () => {
  it("补全默认值", () => {
    const fields = normalizeFields([{ name: "order_no", label: "订单号", type: "string" }]);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      name: "order_no",
      label: "订单号",
      type: "string",
      visible: true,
      searchable: false,
      editable: true,
      required: false,
    });
  });

  it("字段名非法时抛错（阻断建表）", () => {
    expect(() => normalizeFields([{ name: "select", type: "string" }])).toThrow();
    expect(() => normalizeFields([{ name: "a;drop", type: "string" }])).toThrow();
    expect(() => normalizeFields([{ name: "OrderNo", type: "string" }])).toThrow();
  });

  it("类型不支持时抛错", () => {
    expect(() => normalizeFields([{ name: "a", type: "datetime2" }])).toThrow(/不支持/);
  });

  it("字段重复时抛错", () => {
    expect(() =>
      normalizeFields([
        { name: "a", type: "string" },
        { name: "a", type: "string" },
      ]),
    ).toThrow(/重复/);
  });

  it("空字段列表抛错", () => {
    expect(() => normalizeFields([])).toThrow();
    expect(() => normalizeFields(null)).toThrow();
  });

  it("字段类型映射到正确的数据库列类型", () => {
    expect(sqlTypeFor("string")).toBe("text");
    expect(sqlTypeFor("number")).toBe("numeric(18,2)");
    expect(sqlTypeFor("boolean")).toBe("boolean");
    expect(sqlTypeFor("datetime")).toBe("timestamptz");
    expect(sqlTypeFor("json")).toBe("jsonb");
  });

  it("默认搜索方式按字段类型给出", () => {
    expect(defaultSearchOp("string")).toBe("like");
    expect(defaultSearchOp("number")).toBe("between");
    expect(defaultSearchOp("boolean")).toBe("eq");
  });

  it("自定义按钮：value 非法字符会被拒绝", () => {
    expect(normalizeCustomActions([{ label: "导出", value: "export" }])).toEqual([
      expect.objectContaining({
        label: "导出",
        value: "export",
        type: "primary",
      }),
    ]);
    expect(() => normalizeCustomActions([{ label: "导出", value: "ex port" }])).toThrow(/不合法/);
    expect(() => normalizeCustomActions([{ label: "导出", value: "a;b" }])).toThrow(/不合法/);
  });

  it("自定义按钮：缺 label 或 value 的项被静默丢弃", () => {
    expect(normalizeCustomActions([{ label: "", value: "x" }, { label: "y" }])).toEqual([]);
    expect(normalizeCustomActions(undefined)).toEqual([]);
  });

  it("操作列配置有默认值且可覆盖", () => {
    expect(defaultOperations()).toMatchObject({
      create: true,
      update: true,
      delete: true,
    });
    const merged = normalizeOperations({
      create: false,
      deletePermission: "x:y",
    });
    expect(merged.create).toBe(false);
    expect(merged.update).toBe(true);
    expect(merged.deletePermission).toBe("x:y");
  });
});
