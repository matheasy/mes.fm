/* MES Spreadsheet Viewer & Editor (mes.fm/excel): XML for what is made in the editor and saved into the .xlsx (installed into MESXLO,
   node tests in tool_apps_src/excel-tests.js):
   - tableXml: an Excel table part (header, banded rows, total row functions, style)
   - chartXml + drawingXml: a chart part (column, bar, line, area, pie, doughnut, scatter) and the drawing that places it on the sheet.
     The page draws a new chart by reading its own chartXml back with MESXLO.parseChart, so what you see is what is saved.
   - fontXml / fillXml / borderXml / alignXml: cell formats from a "look" ({b, i, u, s, color, sz, font, fill: {c}, bd: {l, r, t, b},
     ha, vaAlign, wrap}), used to append new cellXfs to styles.xml
   - cfXml + dxfXml: conditional formatting rules made here */
(function (root) {
	"use strict";
	function install(O) {
		var esc = O.escX, colName = O.colName;
		var NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart", NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main", NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
		var HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
		function a1(r, c, abs) { return abs ? "$" + colName(c) + "$" + (r + 1) : colName(c) + (r + 1); }
		function sheetRef(sheet, g) { var q = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(sheet) ? sheet : "'" + String(sheet).replace(/'/g, "''") + "'"; var a = a1(g.s.r, g.s.c, true), b = a1(g.e.r, g.e.c, true); return q + "!" + (a === b ? a : a + ":" + b); }

		/* ---------- tables ---------- */
		// t = {id, name, g, header, totals, style, rowStripes, colStripes, firstCol, lastCol, cols: [names], totalFns: [null | "sum" | "average" | "count" | "countNums" | "max" | "min" | "stdDev" | "var"], totalLabel: [text]}
		function tableXml(t) {
			var ref = a1(t.g.s.r, t.g.s.c) + ":" + a1(t.g.e.r, t.g.e.c), af = t.header ? a1(t.g.s.r, t.g.s.c) + ":" + a1(t.totals ? t.g.e.r - 1 : t.g.e.r, t.g.e.c) : null;
			var cols = t.cols.map(function (n, i) {
				var fn = t.totals && t.totalFns && t.totalFns[i], lab = t.totals && t.totalLabel && t.totalLabel[i];
				return '<tableColumn id="' + (i + 1) + '" name="' + esc(n) + '"' + (lab ? ' totalsRowLabel="' + esc(lab) + '"' : "") + (fn ? ' totalsRowFunction="' + fn + '"' : "") + "/>";
			});
			return HDR + '<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="' + t.id + '" name="' + esc(t.name) + '" displayName="' + esc(t.name) + '" ref="' + ref + '"' +
				(t.header ? "" : ' headerRowCount="0"') + (t.totals ? ' totalsRowCount="1"' : ' totalsRowShown="0"') + ">" +
				(af ? '<autoFilter ref="' + af + '"/>' : "") +
				'<tableColumns count="' + cols.length + '">' + cols.join("") + "</tableColumns>" +
				'<tableStyleInfo name="' + esc(t.style || "TableStyleMedium2") + '" showFirstColumn="' + (t.firstCol ? 1 : 0) + '" showLastColumn="' + (t.lastCol ? 1 : 0) + '" showRowStripes="' + (t.rowStripes === false ? 0 : 1) + '" showColumnStripes="' + (t.colStripes ? 1 : 0) + '"/></table>';
		}
		// unique, non-empty column names (Excel needs them to match the header cells)
		function tableColNames(texts) {
			var seen = {}, out = [];
			texts.forEach(function (t, i) {
				var n = String(t == null ? "" : t).replace(/[\r\n]+/g, " ").trim() || "Column" + (i + 1), base = n, k = 2;
				while (seen[n.toLowerCase()]) n = base + k++;
				seen[n.toLowerCase()] = 1; out.push(n);
			});
			return out;
		}

		/* ---------- charts ---------- */
		// m = {type: column|bar|line|area|pie|doughnut|scatter, stacked: bool, title, legend: "r"|"b"|null, sheet, series: [{name: {s, g} | text,
		//      cat: {g} (categories / x values), val: {g}}], labels: bool}
		function dataRef(tag, sheet, ref, num) {
			if (!ref) return "";
			if (typeof ref === "string") return "<c:" + tag + "><c:v>" + esc(ref) + "</c:v></c:" + tag + ">";
			var f = sheetRef(ref.sheet || sheet, ref.g);
			return "<c:" + tag + "><c:" + (num ? "numRef" : "strRef") + "><c:f>" + esc(f) + "</c:f></c:" + (num ? "numRef" : "strRef") + "></c:" + tag + ">";
		}
		function chartXml(m) {
			var t = m.type, kind = t === "column" || t === "bar" ? "barChart" : t === "line" ? "lineChart" : t === "area" ? "areaChart" : t === "pie" ? "pieChart" : t === "doughnut" ? "doughnutChart" : "scatterChart";
			var round = t === "pie" || t === "doughnut", sc = t === "scatter", ax1 = 50010, ax2 = 50020;
			var ser = m.series.map(function (s, i) {
				var x = "<c:ser><c:idx val=\"" + i + "\"/><c:order val=\"" + i + "\"/>" + (s.name ? (typeof s.name === "string" ? "<c:tx><c:v>" + esc(s.name) + "</c:v></c:tx>" : dataRef("tx", m.sheet, s.name, false)) : "");
				if (t === "line" || sc) x += sc && !m.lines ? '<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/></c:marker>' : '<c:marker><c:symbol val="none"/></c:marker>';
				if (t === "column" || t === "bar") x += '<c:invertIfNegative val="0"/>';
				if (m.labels) x += '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="' + (round ? 0 : 1) + '"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="' + (round ? 1 : 0) + '"/><c:showBubbleSize val="0"/></c:dLbls>';
				if (sc) x += dataRef("xVal", m.sheet, s.cat, true) + dataRef("yVal", m.sheet, s.val, true) + '<c:smooth val="0"/>';
				else x += dataRef("cat", m.sheet, s.cat, false) + dataRef("val", m.sheet, s.val, true) + (t === "line" ? '<c:smooth val="0"/>' : "");
				return x + "</c:ser>";
			}).join("");
			var grouping = m.stacked ? (m.stacked === "percent" ? "percentStacked" : "stacked") : (t === "line" || t === "area" ? "standard" : "clustered");
			var plot = "<c:" + kind + ">";
			if (kind === "barChart") plot += '<c:barDir val="' + (t === "bar" ? "bar" : "col") + '"/><c:grouping val="' + grouping + '"/>';
			else if (kind === "lineChart" || kind === "areaChart") plot += '<c:grouping val="' + grouping + '"/>';
			else if (sc) plot += '<c:scatterStyle val="lineMarker"/>';
			plot += '<c:varyColors val="' + (round ? 1 : 0) + '"/>' + ser;
			if (kind === "barChart") plot += '<c:gapWidth val="150"/>' + (m.stacked ? '<c:overlap val="100"/>' : "");
			if (kind === "lineChart") plot += '<c:marker val="1"/>';
			if (t === "pie") plot += '<c:firstSliceAng val="0"/>';
			if (t === "doughnut") plot += '<c:firstSliceAng val="0"/><c:holeSize val="50"/>';
			if (!round) plot += '<c:axId val="' + ax1 + '"/><c:axId val="' + ax2 + '"/>';
			plot += "</c:" + kind + ">";
			var axes = "";
			if (!round) {
				var catPos = t === "bar" ? "l" : "b", valPos = t === "bar" ? "b" : "l";
				var common = function (id, cross, pos, grid, isCat) { return '<c:axId val="' + id + '"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="' + pos + '"/>' + (grid ? "<c:majorGridlines/>" : "") + '<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="' + cross + '"/><c:crosses val="autoZero"/>' + (isCat ? '<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/>' : '<c:crossBetween val="' + (t === "area" ? "midCat" : "between") + '"/>'); };
				if (sc) axes = "<c:valAx>" + common(ax1, ax2, "b", false, false) + "</c:valAx><c:valAx>" + common(ax2, ax1, "l", true, false) + "</c:valAx>";
				else axes = "<c:catAx>" + common(ax1, ax2, catPos, false, true) + "</c:catAx><c:valAx>" + common(ax2, ax1, valPos, true, false) + "</c:valAx>";
			}
			var title = m.title ? '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="0"/></a:pPr><a:r><a:t>' + esc(m.title) + "</a:t></a:r></a:p></c:rich></c:tx><c:overlay val=\"0\"/></c:title>" : "";
			var legend = m.legend ? '<c:legend><c:legendPos val="' + m.legend + '"/><c:overlay val="0"/></c:legend>' : "";
			return HDR + '<c:chartSpace xmlns:c="' + NS_C + '" xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '"><c:roundedCorners val="0"/><c:chart>' + title +
				'<c:autoTitleDeleted val="' + (m.title ? 0 : 1) + '"/><c:plotArea><c:layout/>' + plot + axes + "</c:plotArea>" + legend + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>';
		}
		// charts = [{from: {c, co, r, ro}, to: {...} (Excel cells + offsets in pixels), name, rid}]
		function drawingXml(charts) {
			var pos = function (tag, p) { return "<xdr:" + tag + "><xdr:col>" + p.c + "</xdr:col><xdr:colOff>" + Math.round((p.co || 0) * 9525) + "</xdr:colOff><xdr:row>" + p.r + "</xdr:row><xdr:rowOff>" + Math.round((p.ro || 0) * 9525) + "</xdr:rowOff></xdr:" + tag + ">"; };
			return HDR + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="' + NS_A + '">' + charts.map(function (ch, i) {
				return '<xdr:twoCellAnchor editAs="oneCell">' + pos("from", ch.from) + pos("to", ch.to) + '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (i + 2) + '" name="' + esc(ch.name || "Chart " + (i + 1)) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="' + NS_C + '"><c:chart xmlns:c="' + NS_C + '" xmlns:r="' + NS_R + '" r:id="' + ch.rid + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
			}).join("") + "</xdr:wsDr>";
		}

		/* ---------- cell formats ---------- */
		function argb(h) { return "FF" + String(h || "000000").replace(/^#/, "").slice(-6).toUpperCase(); }
		// base = the font XML of the cell's current format (or null); look = what to change
		function fontXml(base, look) {
			var b = base || "<font><sz val=\"11\"/><color theme=\"1\"/><name val=\"Calibri\"/><family val=\"2\"/><scheme val=\"minor\"/></font>";
			var get = function (tag) { var m = new RegExp("<" + tag + "\\b[^>]*/>|<" + tag + "\\b[^>]*>[\\s\\S]*?</" + tag + ">").exec(b); return m ? m[0] : null; };
			var flag = function (tag, on, cur) { if (on === undefined) return cur ? "<" + tag + "/>" : ""; return on ? "<" + tag + "/>" : ""; };
			var has = function (tag) { var x = get(tag); return !!x && !/val="(0|false)"/.test(x); };
			var size = look.sz != null ? '<sz val="' + look.sz + '"/>' : (get("sz") || "");
			var col = look.color !== undefined ? (look.color ? '<color rgb="' + argb(look.color) + '"/>' : '<color theme="1"/>') : (get("color") || "");
			var name = look.font ? '<name val="' + esc(look.font) + '"/>' : (get("name") || "");
			var fam = look.font ? "" : (get("family") || ""), scheme = look.font ? "" : (get("scheme") || "");
			return "<font>" + flag("b", look.b, has("b")) + flag("i", look.i, has("i")) + flag("strike", look.s, has("strike")) + (look.u !== undefined ? (look.u ? "<u/>" : "") : (get("u") || "")) + size + col + name + fam + get_("charset", get) + scheme + "</font>";
		}
		function get_(t, get) { return get(t) || ""; }
		function fillXml(look) { if (!look.fill || !look.fill.c) return '<fill><patternFill patternType="none"/></fill>'; return '<fill><patternFill patternType="solid"><fgColor rgb="' + argb(look.fill.c) + '"/><bgColor indexed="64"/></patternFill></fill>'; }
		var BS = { 1: "thin", 2: "medium", 3: "thick" };
		function borderXml(bd) {
			bd = bd || {};
			var side = function (tag, e) { if (!e) return "<" + tag + "/>"; var st = e.st || BS[e.w] || "thin"; if (st === "double" && e.w === 3) st = "double"; return "<" + tag + ' style="' + st + '"><color rgb="' + argb(e.c || "000000") + '"/></' + tag + ">"; };
			return "<border>" + side("left", bd.l) + side("right", bd.r) + side("top", bd.t) + side("bottom", bd.b) + "<diagonal/></border>";
		}
		function alignXml(look) {
			var a = "";
			if (look.ha) a += ' horizontal="' + look.ha + '"';
			if (look.vaAlign) a += ' vertical="' + look.vaAlign + '"';
			if (look.wrap) a += ' wrapText="1"';
			if (look.indent) a += ' indent="' + look.indent + '"';
			if (look.rot) a += ' textRotation="' + look.rot + '"';
			return a ? "<alignment" + a + "/>" : "";
		}
		// a differential format (conditional formatting): font colour / bold / italic and a fill
		function dxfXml(look) {
			var f = "";
			if (look.b || look.i || look.u || look.color) f = "<font>" + (look.b ? "<b/>" : "") + (look.i ? "<i/>" : "") + (look.u ? "<u/>" : "") + (look.color ? '<color rgb="' + argb(look.color) + '"/>' : "") + "</font>";
			var fl = look.fill && look.fill.c ? '<fill><patternFill><bgColor rgb="' + argb(look.fill.c) + '"/></patternFill></fill>' : "";
			return "<dxf>" + f + fl + "</dxf>";
		}
		// rules = [{type, op, formulas, text, look, colors, color, cfvo, ranges}]; dxf0 = the dxfs already in styles.xml
		// -> {xml (for the sheet), dxfs: [xml], next}
		function cfXml(rules, dxf0, prio0) {
			var dxfs = [], out = [], prio = prio0 || 1;
			rules.forEach(function (R) {
				var sq = R.ranges.map(function (g) { var a = a1(g.s.r, g.s.c), b = a1(g.e.r, g.e.c); return a === b ? a : a + ":" + b; }).join(" ");
				var body = "", attrs = ' type="' + R.type + '" priority="' + (prio++) + '"';
				if (R.type === "colorScale") body = "<colorScale>" + (R.colors.length === 3 ? '<cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' : '<cfvo type="min"/><cfvo type="max"/>') + R.colors.map(function (c) { return '<color rgb="' + argb(c) + '"/>'; }).join("") + "</colorScale>";
				else if (R.type === "dataBar") body = '<dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="' + argb(R.color) + '"/></dataBar>';
				else {
					if (R.dxf) { attrs += ' dxfId="' + (dxf0 + dxfs.length) + '"'; dxfs.push(dxfXml(R.dxf)); }
					if (R.type === "cellIs") { attrs += ' operator="' + R.op + '"'; body = R.formulas.map(function (f) { return "<formula>" + esc(f) + "</formula>"; }).join(""); }
					else if (R.type === "containsText") { attrs += ' operator="containsText" text="' + esc(R.text) + '"'; var tl = a1(R.ranges[0].s.r, R.ranges[0].s.c); body = '<formula>NOT(ISERROR(SEARCH("' + esc(String(R.text).replace(/"/g, '""')) + '",' + tl + ")))</formula>"; }
					else if (R.type === "duplicateValues" || R.type === "uniqueValues") body = "";
					else if (R.type === "top10") { attrs += ' rank="' + (R.rank || 10) + '"' + (R.bottom ? ' bottom="1"' : "") + (R.percent ? ' percent="1"' : ""); }
					else if (R.type === "aboveAverage") { if (!R.above) attrs += ' aboveAverage="0"'; }
					else if (R.type === "expression") body = "<formula>" + esc(R.formulas[0]) + "</formula>";
				}
				out.push('<conditionalFormatting sqref="' + sq + '"><cfRule' + attrs + (body ? ">" + body + "</cfRule>" : "/>") + "</conditionalFormatting>");
			});
			return { xml: out.join(""), dxfs: dxfs, next: prio };
		}

		O.tableXml = tableXml; O.tableColNames = tableColNames; O.chartXml = chartXml; O.drawingXml = drawingXml; O.sheetRef = sheetRef;
		O.fontXml = fontXml; O.fillXml = fillXml; O.borderXml = borderXml; O.alignXml = alignXml; O.dxfXml = dxfXml; O.cfXml = cfXml;
		O.CT = { table: "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml", drawing: "application/vnd.openxmlformats-officedocument.drawing+xml", chart: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml" };
		O.REL = { table: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/table", drawing: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing", chart: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" };
	}
	if (typeof module === "object" && module.exports) module.exports = { install: install };
	else if (root.MESXLO) install(root.MESXLO);
})(typeof window !== "undefined" ? window : this);
