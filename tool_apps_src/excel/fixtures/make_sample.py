# Makes fixtures/sample.xlsx for tool_apps_src/excel-tests.js (charts, tables, freeze panes, hidden sheets / rows / columns,
# merged cells, styles, conditional formatting). Needs openpyxl: python3 make_sample.py sample.xlsx
import sys
from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, PieChart, ScatterChart, AreaChart, Reference, Series
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, DataBarRule
out = sys.argv[1]
wb = Workbook()
ws = wb.active; ws.title = "Sales"
ws.append(["Month", "North", "South", "West"])
import math
for i, m in enumerate(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug"]):
    ws.append([m, 100+i*12, 80+ (i%3)*30, 60+i*i*3])
ws["F1"] = "Title merged"; ws.merge_cells("F1:H2")
ws["F1"].font = Font(bold=True, size=14, color="FFFFFF"); ws["F1"].fill = PatternFill("solid", fgColor="1F4E78")
ws["F1"].alignment = Alignment(horizontal="center", vertical="center")
ws["F4"] = 0.256; ws["F4"].number_format = "0.0%"
ws["F5"] = 1234567.891; ws["F5"].number_format = "#,##0.00"
ws["F6"] = "Boxed"; s = Side(style="thin", color="FF0000"); ws["F6"].border = Border(left=s, right=s, top=s, bottom=Side(style="thick", color="0000FF"))
ws["F7"] = "Italic red"; ws["F7"].font = Font(italic=True, color="C00000")
tab = Table(displayName="SalesTable", ref="A1:D9")
tab.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True, showColumnStripes=False)
ws.add_table(tab)
ws.freeze_panes = "B2"
ws.column_dimensions["A"].width = 14
ws.column_dimensions["E"].hidden = True
ws.row_dimensions[5].hidden = True
ws.conditional_formatting.add("C2:C9", CellIsRule(operator="greaterThan", formula=["100"], fill=PatternFill("solid", bgColor="FFC7CE"), font=Font(color="9C0006")))
ws.conditional_formatting.add("D2:D9", ColorScaleRule(start_type="min", start_color="F8696B", end_type="max", end_color="63BE7B"))
ws.conditional_formatting.add("B2:B9", DataBarRule(start_type="min", end_type="max", color="638EC6"))
c = BarChart(); c.type = "col"; c.title = "Sales by month"; c.y_axis.title = "Units"
c.add_data(Reference(ws, min_col=2, min_row=1, max_col=4, max_row=9), titles_from_data=True)
c.set_categories(Reference(ws, min_col=1, min_row=2, max_row=9))
ws.add_chart(c, "J2")
l = LineChart(); l.title = "Trend"; l.add_data(Reference(ws, min_col=2, min_row=1, max_col=3, max_row=9), titles_from_data=True); l.set_categories(Reference(ws, min_col=1, min_row=2, max_row=9))
ws.add_chart(l, "J18")
p = PieChart(); p.title = "North share"; p.add_data(Reference(ws, min_col=2, min_row=1, max_row=5), titles_from_data=True); p.set_categories(Reference(ws, min_col=1, min_row=2, max_row=5))
ws.add_chart(p, "R2")
ws2 = wb.create_sheet("Data2")
ws2.append(["x","y","z"])
for i in range(1, 15): ws2.append([i, i*i, 50 - i*2])
sc = ScatterChart(); sc.title = "Scatter"; sc.style = 13
xs = Reference(ws2, min_col=1, min_row=2, max_row=15)
for col in (2,3):
    s = Series(Reference(ws2, min_col=col, min_row=1, max_row=15), xs, title_from_data=True); s.marker.symbol = "circle"; sc.series.append(s)
ws2.add_chart(sc, "E2")
a = AreaChart(); a.title = "Area"; a.grouping = "stacked"; a.add_data(Reference(ws2, min_col=2, min_row=1, max_col=3, max_row=15), titles_from_data=True)
ws2.add_chart(a, "E20")
t2 = Table(displayName="T2", ref="A1:C15"); t2.tableStyleInfo = TableStyleInfo(name="TableStyleLight9", showRowStripes=True); ws2.add_table(t2)
ws2.freeze_panes = "A2"
h = wb.create_sheet("Secret"); h["A1"] = "hidden sheet"; h.sheet_state = "hidden"
vh = wb.create_sheet("VerySecret"); vh["A1"] = "very hidden"; vh.sheet_state = "veryHidden"
d = wb.create_sheet("Dark"); d.append(["Name","A","B"])
for i in range(10): d.append([f"r{i}", i, i*2])
t3 = Table(displayName="T3", ref="A1:C11"); t3.tableStyleInfo = TableStyleInfo(name="TableStyleDark2", showRowStripes=True, showFirstColumn=True); d.add_table(t3)
d.freeze_panes = "B3"
wb.save(out)
