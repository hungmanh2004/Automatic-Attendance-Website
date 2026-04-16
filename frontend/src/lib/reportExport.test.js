import { afterEach, describe, expect, it, vi } from "vitest";

import { exportCsvFile, exportExcelFile } from "./reportExport";

describe("reportExport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("downloads CSV files with the requested filename", () => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:csv"),
      revokeObjectURL: vi.fn(),
    });

    const anchor = {
      click: vi.fn(),
      href: "",
      download: "",
    };
    const createElement = vi.spyOn(document, "createElement").mockReturnValue(anchor);

    exportCsvFile("attendance.csv", [["Mã", "Tên"], ["EMP-001", "Nguy?n Van A"]]);

    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain("text/csv");
    expect(createElement).toHaveBeenCalledWith("a");
    expect(anchor.download).toBe("attendance.csv");
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:csv");
  });

  it("downloads Excel-compatible files with the requested filename", () => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:xls"),
      revokeObjectURL: vi.fn(),
    });

    const anchor = {
      click: vi.fn(),
      href: "",
      download: "",
    };
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    exportExcelFile("attendance.xls", [["Mã", "Tên"], ["EMP-001", "Nguy?n Van A"]], "Attendance");

    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain("application/vnd.ms-excel");
    expect(anchor.download).toBe("attendance.xls");
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:xls");
  });
});
