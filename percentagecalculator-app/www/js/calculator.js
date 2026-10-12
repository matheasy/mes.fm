$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			// text typed into an input -> number. Accepts 1,234.5 / 1.234,5 / 12,5 / $1 200 / 15% / -3; blank or junk -> NaN (no answer until the row is complete)
			parseNum: function (str) {
				var t = String(str == null ? '' : str).replace(/[\s$%\u00a0]/g, '');
				if (t === '' || t === '-' || t === '.' || t === ',') return NaN;
				var lastDot = t.lastIndexOf('.'), lastComma = t.lastIndexOf(',');
				if (lastDot >= 0 && lastComma >= 0) {                       // both: the later one is the decimal mark
					if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, '');
				} else if (lastComma >= 0) {                                 // only commas: 12,5 is a decimal, 1,234 / 1,234,567 are thousands
					t = (/^-?\d{1,3}(,\d{3})+$/.test(t)) ? t.replace(/,/g, '') : t.replace(',', '.');
				}
				return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
			},

			preciseAnswer: function(a) {
				var b = Math.abs(a);
				switch(true) {
					case b >= 10000000:
						a = CALCULATOR.convertToScientific(a);
		            	return a;
		            case b >= 1:
						// round half away from zero on the decimal digits we can trust (180.075 -> 180.08, not the binary-float 180.07)
						a = (Math.sign(a) * Math.round(Number(b.toPrecision(12) + 'e2')) / 100).toFixed(2);
		            	return a;	            	
		        	case b >= 0.000001:
		            	a = Number(a.toPrecision(2));
		            	return a;
		            case b == 0:
		            	return a.toFixed(2);
		        	default:
						a = CALCULATOR.convertToScientific(a);
						return a;
				}
			},

			convertToScientific: function(num) {
				num = num.toExponential(2);
				num = num.replace("e", "x10^");
				num = num.replace("+", "");
				num = num.split("^");
            	num = num[0]+num[1].sup();
            	return num;
			},

			calcAnswer1: function (inputs) {
				var input1 = inputs[0];
				var input2 = inputs[1];
				var answer = input1/input2*100;
				var a = inputs['answer'];
				var f = inputs['formula'];
				//.replace(/\$|\,/g, ""));

				if(isNaN(answer) || typeof answer === "undefined" || !isFinite(answer)){
				    a.html("");
					f.html("A / B * 100");
				} else {
					answer = CALCULATOR.preciseAnswer(answer);
					a.html(answer+"%");
					f.html(input1+" / " + input2 + " * 100 = " +answer + "%");
				}

			},

			calcAnswer2: function (inputs) {
				var input1 = inputs[0];
				var input2 = inputs[1];
				var answer = input1*input2/100;
				var a = inputs['answer'];
				var f = inputs['formula'];

				if(isNaN(answer) || typeof answer === "undefined" || !isFinite(answer)) {
				    a.html("");
				    f.html("A * B / 100");
				} else {
					answer = CALCULATOR.preciseAnswer(answer);
					a.html(answer);
					f.html(input1+" * " + input2 + " / 100 = " +answer);
				}
			},

			calcAnswer3: function (inputs) {
				var input1 = inputs[0];
				var input2 = inputs[1];
				var answer = input1/input2*100;
				var a = inputs['answer'];
				var f = inputs['formula'];

				if(isNaN(answer) || typeof answer === "undefined" || !isFinite(answer)) {
				    a.html("");
				    f.html("A / B * 100");
				} else {
					answer = CALCULATOR.preciseAnswer(answer);
					a.html(answer);
					f.html(input1+" / " + input2 + " * 100 = " +answer);
				}
			},

			calcAnswer4: function (inputs) {
				var input1 = inputs[0];
				var input2 = inputs[1];
				var answer = (input2-input1)/input1 * 100;
				var a = inputs['answer'];
				var f = inputs['formula'];

				if(isNaN(answer) || typeof answer === "undefined" || !isFinite(answer)) {
				    a.html("");
				    f.html("(B - A) / A * 100");
				} else {
					answer = CALCULATOR.preciseAnswer(answer);
					a.html(answer+"%");
					f.html("("+input2+" - " + input1 + ") / "+input1+" * 100 = " +answer + "%");
				}
			},

			// percentage difference between A and B (symmetric: relative to the average of the two)
			calcAnswerDiff: function (inputs) {
				var input1 = inputs[0];
				var input2 = inputs[1];
				var answer = Math.abs(input1-input2)/((input1+input2)/2)*100;
				var a = inputs['answer'];
				var f = inputs['formula'];

				if(isNaN(answer) || typeof answer === "undefined" || !isFinite(answer)) {
				    a.html("");
				    f.html("|A - B| / ((A + B) / 2) * 100");
				} else {
					answer = CALCULATOR.preciseAnswer(answer);
					a.html(answer+"%");
					f.html("|"+input1+" - "+input2+"| / (("+input1+" + "+input2+") / 2) * 100 = "+answer+"%");
				}
			},

			calcAnswer5: function (inputs) {
				var input1 = inputs[0];
				var input2 = inputs[1];
				var input3 = inputs[2];

				if(!input1)
					input1 = 0;

				var answer = (input1*input3+input2)/input3*100;
				var a = inputs['answer'];
				var f = inputs['formula'];

				if(isNaN(answer) || typeof answer === "undefined" || !isFinite(answer)) {
				    a.html("");
				    f.html("(A * C + B) / C * 100");
				} else {
					answer = CALCULATOR.preciseAnswer(answer);
					a.html(answer+"%");
					f.html("("+input1+" * "+input3+" + "+input2+") / "+input3+" * 100 = " +answer+"%");
				}
			},

			calcAnswer6: function (inputs) {
				var input1 = inputs[0];
				var input2 = inputs[1];
				var answer = input1*(input2/100);
				var a = inputs['answer'];
				var f = inputs['formula'];

				if(isNaN(answer) || typeof answer === "undefined" || !isFinite(answer)) {
				    a.html("");
				    f.html("A * B / 100");
				} else {
					answer = CALCULATOR.preciseAnswer(answer);
					a.html(answer);
					f.html(input1+" * "+input2+" / 100 = "+answer);
				}
			},

			calcAnswer7: function (inputs) {
				var input1 = inputs[0];
				var input2 = inputs[1];
				var answer = input1/(input2/100);
				var a = inputs['answer'];
				var f = inputs['formula'];

				if(isNaN(answer) || typeof answer === "undefined" || !isFinite(answer)) {
				    a.html("");
				    f.html("A / (B / 100)");
				} else {
					answer = CALCULATOR.preciseAnswer(answer);
					a.html(answer);
					f.html(input1+" / ("+input2+" / 100) = "+answer);
				}
			},

			calcAnswer8: function (inputs) {
				var input1 = inputs[0];
				var input2 = inputs[1];
				var answer = input1*(1+input2/100);
				var a = inputs['answer'];
				var f = inputs['formula'];

				if(isNaN(answer) || typeof answer === "undefined" || !isFinite(answer)) {
				    a.html("");
				    f.html("A * (1 + B / 100)");
				} else {
					answer = CALCULATOR.preciseAnswer(answer);
					a.html(answer);
					f.html(input1+" * (1 + "+input2+" / 100) = "+answer);
				}
			},

			calcAnswer9: function (inputs) {
				var input1 = inputs[0];
				var input2 = inputs[1];
				var answer = input1-input1*(input2/100);
				var a = inputs['answer'];
				var f = inputs['formula'];

				if(isNaN(answer) || typeof answer === "undefined" || !isFinite(answer)) {
				    a.html("");
				    f.html("A * ( 1 - B / 100)");
				} else {
					answer = CALCULATOR.preciseAnswer(answer);
					a.html(answer);
					f.html(input1+" * (1 - "+input2+" / 100) = "+answer);
				}
			},

			// equations in their canonical order (equation-1 ... equation-10), whatever order the user has arranged them in on the page
			canonicalEquations: function () {
				return $('.equation').get().sort(function (a, b) {
					return parseInt(a.id.replace('equation-', ''), 10) - parseInt(b.id.replace('equation-', ''), 10);
				});
			},

			// one row's answer from its inputs
			calcRow: function (row) {
				var $row = $(row), inputs = [];
				$row.find('.input').each(function () { inputs.push(CALCULATOR.parseNum($(this).val())); });
				inputs['answer'] = $row.find('.answer');
				inputs['formula'] = $row.find('.formula');
				var equation = parseInt($row.closest('.equation').attr('id').replace('equation-', ''), 10);
				// rows in page order: 1-4, 5 = percentage difference, then the old 5-9 (mixed fraction, more calculations) as 6-10
				switch (equation) {
					case 1: CALCULATOR.calcAnswer1(inputs); break;
					case 2: CALCULATOR.calcAnswer2(inputs); break;
					case 3: CALCULATOR.calcAnswer3(inputs); break;
					case 4: CALCULATOR.calcAnswer4(inputs); break;
					case 5: CALCULATOR.calcAnswerDiff(inputs); break;
					case 6: CALCULATOR.calcAnswer5(inputs); break;
					case 7: CALCULATOR.calcAnswer6(inputs); break;
					case 8: CALCULATOR.calcAnswer7(inputs); break;
					case 9: CALCULATOR.calcAnswer8(inputs); break;
					case 10: CALCULATOR.calcAnswer9(inputs); break;
				}
			},
			calcAll: function () { $('.input-row').each(function () { CALCULATOR.calcRow(this); }); },

			/* ---- saved values + share links (no server: the whole state travels in the link) ---- */
			STORE: 'mes-percentagecalculator:v1',
			// every equation's rows of raw input text, canonical order: [[ [a, b], [a2, b2] ], ...]; trailing empty rows are dropped
			collect: function () {
				return $(CALCULATOR.canonicalEquations()).map(function () {
					var rows = $(this).find('.input-row').map(function () { return [$(this).find('.input').map(function () { return $(this).val(); }).get()]; }).get();
					while (rows.length > 1 && rows[rows.length - 1].join('') === '') rows.pop();
					return [rows];
				}).get();
			},
			isEmpty: function (data) { return !data.some(function (rows) { return rows.some(function (r) { return r.join('') !== ''; }); }); },
			save: function () {
				try {
					var d = CALCULATOR.collect();
					if (CALCULATOR.isEmpty(d)) localStorage.removeItem(CALCULATOR.STORE); else localStorage.setItem(CALCULATOR.STORE, JSON.stringify(d));
				} catch (e) {}
			},
			// put saved / shared values back: add rows with the + button, fill the inputs, compute every row
			apply: function (data) {
				if (!Array.isArray(data)) return false;
				if (data.length === 9) data.splice(4, 0, [["", ""]]);        // links saved before the percentage-difference row was added
				var eqs = CALCULATOR.canonicalEquations();
				for (var i = 0; i < eqs.length && i < data.length; i++) {
					var rows = Array.isArray(data[i]) ? data[i] : [];
					var have = $(eqs[i]).find('.input-row').length;
					for (var x = have; x < rows.length && x < 30; x++) $(eqs[i]).find('.plus-sign-button')[0].click();
					$(eqs[i]).find('.input-row').each(function (r) {
						var vals = Array.isArray(rows[r]) ? rows[r] : [];
						$(this).find('.input').each(function (k) { $(this).val(vals[k] == null ? '' : String(vals[k])); });
					});
				}
				if (window.PCLayout) window.PCLayout.expandAll();             // so the values are visible
				CALCULATOR.calcAll();
				return true;
			},
			LABELS: 'mes-percentagecalculator:labels',     // { "1": "Personal taxes", ... } (equation number -> text)
			SAVES: 'mes-percentagecalculator:saves',       // { name: { d: <rows of raw input text>, l: <labels>, ts } }
			LSHOW: 'mes-percentagecalculator:labels-shown',
			readJ: function (k, fb) { try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } },
			writeJ: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
			labels: {},
			getLabel: function (eqId) { return (CALCULATOR.labels[String(eqId).replace('equation-', '')] || '').trim(); },
			setLabels: function (l) {
				CALCULATOR.labels = {};
				for (var k in (l || {})) if (/^\d+$/.test(k) && typeof l[k] === 'string' && l[k].trim()) CALCULATOR.labels[k] = l[k].slice(0, 40);
				CALCULATOR.writeJ(CALCULATOR.LABELS, CALCULATOR.labels);
				$('.calc-label-field input').each(function () { $(this).val(CALCULATOR.labels[$(this).attr('data-eq')] || ''); });
				if (window.PCLayout && window.PCLayout.refreshSummaries) window.PCLayout.refreshSummaries();
			},
			b64e: function (s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
			b64d: function (s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); },
			shareLink: function () { var l = CALCULATOR.labels, has = Object.keys(l).some(function (k) { return l[k]; }), d = CALCULATOR.collect(); return window.location.origin + '/percentagecalculator?s=1' + CALCULATOR.b64e(JSON.stringify(has ? { d: d, l: l } : d)); },
			decodeLink: function (s) { try { if (String(s).charAt(0) !== '1') return null; var d = JSON.parse(CALCULATOR.b64d(String(s).slice(1))); if (Array.isArray(d)) return { d: d, l: {} }; return d && Array.isArray(d.d) ? { d: d.d, l: d.l || {} } : null; } catch (e) { return null; } },

			toast: function (msg, undo) {
				var t = document.getElementById('pc-toast');
				if (!t) {
					t = document.createElement('div'); t.id = 'pc-toast'; t.setAttribute('role', 'status');
					t.style.cssText = 'position:fixed;left:50%;top:4.2em;transform:translateX(-50%);max-width:92vw;text-align:center;background:#222;color:#fff;border:2px solid #fff;box-shadow:0 0.3em 1em rgba(0,0,0,0.45);padding:0.7em 1.2em;border-radius:0.5em;z-index:99999;font-size:1.05em;font-weight:700;opacity:0;transition:opacity .2s;pointer-events:none;';
					document.body.appendChild(t);
				}
				t.textContent = msg; t.style.opacity = '1'; t.style.pointerEvents = undo ? 'auto' : 'none'; t.style.cursor = undo ? 'pointer' : '';
				t.onclick = undo ? function () { undo(); t.style.opacity = '0'; t.style.pointerEvents = 'none'; } : null;
				clearTimeout(CALCULATOR._tt); CALCULATOR._tt = setTimeout(function () { t.style.opacity = '0'; t.style.pointerEvents = 'none'; }, undo ? 6000 : 2600);
			},
			copyText: function (text, msg) {
				function fb() { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); CALCULATOR.toast(ok ? msg : 'Copy failed'); }
				if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { CALCULATOR.toast(msg); }, fb); else fb();
			},

			// links made before 2026-10-06 stored the values on the server: /percentagecalculator/s/<id>
			initializeCustomCalculation: function () {
				var q = new URLSearchParams(window.location.search), match = window.location.pathname.match(/^\/percentagecalculator\/s\/([A-Za-z0-9]+)\/?$/);
				if (q.get('s')) {
					var d = CALCULATOR.decodeLink(q.get('s'));
					if (d && CALCULATOR.apply(d.d)) { if (Object.keys(d.l).length) { CALCULATOR.setLabels(d.l); CALCULATOR.showLabels(true); } CALCULATOR.save(); CALCULATOR.toast('Shared calculations loaded'); }
					history.replaceState(null, '', window.location.pathname);
					return true;
				}
				if (match) {
					$.ajax({ url: '/api/share', type: 'GET', data: ({ calc: 'pc', id: match[1] }) })
						.done(function (data) { if (data) { CALCULATOR.apply((typeof data === 'string') ? JSON.parse(data) : data); CALCULATOR.save(); history.replaceState(null, '', '/percentagecalculator'); } })
						.fail(function () { /* bad/expired id: leave the calculator as it is */ });
					return true;
				}
				return false;
			},
			restore: function () {
				try { var d = JSON.parse(localStorage.getItem(CALCULATOR.STORE) || 'null'); if (d) CALCULATOR.apply(d); } catch (e) {}
			},
			showLabels: function (on) {
				document.body.classList.toggle('pc-show-labels', !!on);
				CALCULATOR.writeJ(CALCULATOR.LSHOW, on ? 1 : 0);
				$('#pc-labels').attr('aria-pressed', on ? 'true' : 'false').text(on ? 'Hide labels' : 'Labels');
			},
			// named saves: several scenarios side by side (taxes, a discount, a tip...), each with its labels
			renderSaves: function () {
				var $strip = $('#pc-saved-strip').empty(), all = CALCULATOR.readJ(CALCULATOR.SAVES, {});
				Object.keys(all).forEach(function (name) {
					var $chip = $('<span class="pc-chip"></span>');
					$('<button type="button" class="pc-chip-open"></button>').text(name).attr('title', "Open '" + name + "'").appendTo($chip).on('click', function () {
						var e = CALCULATOR.readJ(CALCULATOR.SAVES, {})[name]; if (!e) return;
						CALCULATOR.clearRows();
						CALCULATOR.setLabels(e.l || {}); if (Object.keys(e.l || {}).length) CALCULATOR.showLabels(true);
						CALCULATOR.apply(e.d); CALCULATOR.save(); CALCULATOR.toast("Opened '" + name + "'");
					});
					$('<button type="button" class="pc-chip-del">&times;</button>').attr({ title: "Delete '" + name + "'", 'aria-label': "Delete saved calculation " + name }).appendTo($chip).on('click', function () {
						var cur = CALCULATOR.readJ(CALCULATOR.SAVES, {}), snap = cur[name]; delete cur[name]; CALCULATOR.writeJ(CALCULATOR.SAVES, cur); CALCULATOR.renderSaves();
						CALCULATOR.toast("Deleted '" + name + "' (click here to undo)", function () { var c2 = CALCULATOR.readJ(CALCULATOR.SAVES, {}); c2[name] = snap; CALCULATOR.writeJ(CALCULATOR.SAVES, c2); CALCULATOR.renderSaves(); });
					});
					$strip.append($chip);
				});
			},
			saveCurrent: function () {
				if (CALCULATOR.isEmpty(CALCULATOR.collect())) { CALCULATOR.toast('Type some numbers into a calculation first, then press Save'); return; }
				var raw = window.prompt('Name this saved calculation (up to 20 characters):', ''); if (raw == null) return;
				var name = raw.trim().slice(0, 20); if (!name) return;
				var all = CALCULATOR.readJ(CALCULATOR.SAVES, {});
				if (all[name] && !window.confirm("Replace the existing '" + name + "'?")) return;
				all[name] = { d: CALCULATOR.collect(), l: CALCULATOR.labels, ts: Date.now() };
				CALCULATOR.writeJ(CALCULATOR.SAVES, all); CALCULATOR.renderSaves(); CALCULATOR.toast("Saved '" + name + "'");
			},
			clearRows: function () {
				$('.equation').each(function () { $(this).find('.input-row').not(':first').remove(); });
				$('.input').val(''); $('.answer').html('');
			},
			clearAll: function () {
				var snap = CALCULATOR.collect();
				$('.equation').each(function () { $(this).find('.input-row').not(':first').remove(); });
				$('.input').val(''); $('.answer').html('');
				$('.formula').each(function () { $(this).html($(this).closest('.box-container').data('f') || ''); });
				CALCULATOR.calcAll(); CALCULATOR.save();
				CALCULATOR.toast('Cleared');
			}
		}
	})();

	// keep digits and the characters people really type into a number: . , - % $ and spaces
	$(document).on('keypress', '.input', function (e) {
		var c = e.which; if (c < 32 || e.ctrlKey || e.metaKey || e.altKey) return true;
		return /[0-9.,\-%$ ]/.test(String.fromCharCode(c));
	});
	// one delegated handler for every row (rows added with + need no re-binding)
	$(document).on('input keyup paste propertychange', '.input', function () {
		var row = $(this).closest('.input-row')[0]; if (!row) return;
		CALCULATOR.calcRow(row);
		clearTimeout(CALCULATOR._st); CALCULATOR._st = setTimeout(CALCULATOR.save, 250);
	});

	$(document).on('click', '.question-mark-button', function () {
		// the "?" sits inside the row's .eq-text wrapper, so the formula box is a sibling of the wrapper, not of the button
		$(this).closest(".input-row").children(".box-container").toggleClass("hide");
		$(this).toggleClass("selected");
	});
	$(document).on('click', '.button-icon--mixed-fraction', function () {
		$(this).closest('div[class^="mixed-fraction-container"]').nextAll(".box-container").toggleClass("hide");
		$(this).toggleClass("selected");
	});

	// "+" adds another row of the same calculation, the new row's "x" removes it again
	$(document).on('click', '.plus-sign-button:not(.x-sign-button)', function () {
		var $row = $(this).closest('div[class^="input-row"]'), $eq = $row.closest('.equation');
		var $new = $row.clone();
		$new.find('.input').val(''); $new.find('.answer').html('');
		var f = $new.find('.formula'); f.html($row.closest('.equation').find('.input-row').first().find('.formula').data('f') || f.html());
		$new.find('.box-container').addClass('hide'); $new.find('.question-mark-button, .button-icon--mixed-fraction').removeClass('selected');
		$new.appendTo($eq);
		$eq.find('.plus-sign-button').last().html('x').addClass('x-sign-button').attr('title', 'Remove this row').attr('aria-label', 'Remove this row');
		CALCULATOR.calcRow($new[0]); CALCULATOR.save();
	});
	$(document).on('click', '.x-sign-button', function () { $(this).closest('.input-row').remove(); CALCULATOR.save(); });

	// click an answer to copy it
	$(document).on('click', '.answer', function () {
		var t = $(this).text().replace(/ /g, ' ').trim(); if (!t) return;
		CALCULATOR.copyText(t, 'Copied ' + t);
	});

	// share: no server any more, the link itself holds the numbers; the box shows it and the scissors copy it
	$("#share-calc-button").click(function () {
		var d = CALCULATOR.collect();
		if (CALCULATOR.isEmpty(d)) { $("#url-to-share").val("https://mes.fm/percentagecalculator"); }
		else $("#url-to-share").val(CALCULATOR.shareLink());
		if ($("#share-calc-url-container").hasClass("hide")) {
			$("#share-calc-url-container").fadeIn(500).removeClass("hide").css("display", "inline-block");
		}
		$(this).html("Update Calculations");
		if (!CALCULATOR.isEmpty(d)) CALCULATOR.copyText($("#url-to-share").val(), 'Link copied');
	});
	$("#copy-link-button").click(function () { CALCULATOR.copyText($("#url-to-share").val(), 'Link copied'); });

	// accessibility + phone keyboards
	$('.input').attr('inputmode', 'decimal');
	$('.answer').attr({ 'aria-live': 'polite', title: 'Click to copy' });
	$('.formula').each(function () { $(this).closest('.box-container').data('f', $(this).text()); $(this).data('f', $(this).text()); });

	/* ---- Layout: collapse / expand and reorder calculations (saved per browser) ---- */
	window.PCLayout = (function () {
		var KEY = 'pcLayout';
		var first = document.getElementById('equation-1');
		if (!first) return { expandAll: function () {} };
		var parent = first.parentNode;
		var DEFAULT = $('.equation').get().map(function (e) { return e.id; });
		var state = { order: DEFAULT.slice(), collapsed: [] };

		try {
			var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
			if (saved && saved.order && saved.order.length === DEFAULT.length && DEFAULT.every(function (id) { return saved.order.indexOf(id) > -1; })) {
				state.order = saved.order;
			}
			if (saved && saved.collapsed) state.collapsed = saved.collapsed.filter(function (id) { return DEFAULT.indexOf(id) > -1; });
		} catch (e) {}

		function save() {
			try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
		}

		function label(eq) {
			var box = eq.querySelector('.eq-text');
			if (!box) return 'Percentage of the mixed fraction';
			var out = '';
			box.childNodes.forEach(function (n) {
				if (n.nodeType === 3) out += n.textContent;
				else if (n.tagName === 'INPUT') out += '__';
				else if (!n.classList.contains('button-icon')) out += n.textContent;
			});
			out = out.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
			var tag = CALCULATOR.getLabel(eq.id);
			return tag ? tag + ': ' + out : out;
		}

		var svg = function (d) { return '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; };
		// drag handle: two columns of three dots
		var GRIP = '<svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true"><g fill="currentColor"><circle cx="4" cy="2.5" r="1.25"/><circle cx="8" cy="2.5" r="1.25"/><circle cx="4" cy="6" r="1.25"/><circle cx="8" cy="6" r="1.25"/><circle cx="4" cy="9.5" r="1.25"/><circle cx="8" cy="9.5" r="1.25"/></g></svg>';
		// "fold" icon: one chevron, up while the calculation is open (click to collapse) and down once it is collapsed
		var FOLD_IN = svg('M2 8l4-4 4 4'), FOLD_OUT = svg('M2 4l4 4 4-4');

		function el(id) { return document.getElementById(id); }

		function build(eq) {
			var bar = document.createElement('div');
			bar.className = 'pc-eq-tools pc-move';
			bar.innerHTML = '<button type="button" class="pc-tool pc-grip" title="Drag to reorder" aria-label="Reorder this calculation: drag, or use the up and down arrow keys">' + GRIP + '</button>';
			var fold = document.createElement('div');
			fold.className = 'pc-eq-tools pc-fold';
			fold.innerHTML = '<button type="button" class="pc-tool pc-toggle"></button>';
			eq.insertBefore(fold, eq.firstChild);
			eq.insertBefore(bar, eq.firstChild);
			var sum = document.createElement('button');
			sum.type = 'button';
			sum.className = 'pc-summary';
			sum.setAttribute('aria-label', 'Expand: ' + label(eq));
			sum.innerHTML = '<span class="pc-summary-text"></span>';
			sum.querySelector('.pc-summary-text').textContent = label(eq);
			eq.insertBefore(sum, fold.nextSibling);
			var grip = bar.querySelector('.pc-grip');
			grip.addEventListener('pointerdown', function (e) { startDrag(eq, grip, e); });
			grip.addEventListener('keydown', function (e) {
				if (e.key === 'ArrowUp') { e.preventDefault(); move(eq.id, -1, '.pc-grip'); }
				else if (e.key === 'ArrowDown') { e.preventDefault(); move(eq.id, 1, '.pc-grip'); }
			});
			fold.querySelector('.pc-toggle').addEventListener('click', function () { setCollapsed(eq.id, !isCollapsed(eq.id)); });
			sum.addEventListener('click', function () { setCollapsed(eq.id, false); });
		}

		function isCollapsed(id) { return state.collapsed.indexOf(id) > -1; }

		function paint() {
			// find a stable node after the block of equations to insert before
			var eqs = DEFAULT.map(el);
			var after = eqs.reduce(function (a, e) { return a.compareDocumentPosition(e) & 4 ? e : a; }, eqs[0]).nextSibling;
			state.order.forEach(function (id) { parent.insertBefore(el(id), after); });
			state.order.forEach(function (id, i) {
				var eq = el(id), c = isCollapsed(id);
				eq.classList.toggle('pc-collapsed', c);
				var t = eq.querySelector('.pc-toggle');
				t.innerHTML = c ? FOLD_OUT : FOLD_IN;
				t.title = c ? 'Expand' : 'Collapse';
				t.setAttribute('aria-label', (c ? 'Expand' : 'Collapse') + ' this calculation');
				t.setAttribute('aria-expanded', c ? 'false' : 'true');
			});
			var all = state.collapsed.length === DEFAULT.length;
			var b = document.getElementById('pc-collapse-all');
			if (b) b.textContent = all ? 'Expand all' : 'Collapse all';
			var r = document.getElementById('pc-reset');
			if (r) r.style.display = (state.order.join() === DEFAULT.join() && !state.collapsed.length) ? 'none' : '';
		}

		// Smooth re-ordering (FLIP): note where every card is, re-order the DOM, then slide each card from where it
		// was to where it now is. A card passed in `skip` (the one being dragged) is positioned by the drag instead.
		var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		function layoutTop(n) { var t = 0; while (n) { t += n.offsetTop; n = n.offsetParent; } return t; }   // ignores transforms
		function animatedPaint(skip) {
			if (reduceMotion) { paint(); return; }
			var cards = DEFAULT.map(el).filter(function (c) { return c !== skip; });
			var first = cards.map(function (c) { return c.getBoundingClientRect().top; });
			paint();
			cards.forEach(function (c) { c.style.transition = 'none'; c.style.transform = ''; });
			var moves = [];
			cards.forEach(function (c, i) {
				var d = first[i] - c.getBoundingClientRect().top;
				if (Math.abs(d) > 1) { c.style.transform = 'translateY(' + d + 'px)'; moves.push(c); }
			});
			if (!moves.length) return;
			void parent.offsetHeight;   // commit the start positions
			moves.forEach(function (c) {
				c.style.transition = 'transform 220ms cubic-bezier(.2,.8,.3,1)';
				c.style.transform = '';
				c.addEventListener('transitionend', function f(ev) { if (ev.target !== c) return; c.removeEventListener('transitionend', f); c.style.transition = ''; });
			});
		}

		function move(id, dir, focusSel) {
			var i = state.order.indexOf(id), j = i + dir;
			if (j < 0 || j >= state.order.length) return;
			state.order.splice(i, 1);
			state.order.splice(j, 0, id);
			save(); animatedPaint();
			var b = el(id).querySelector(focusSel);
			if (b && !b.disabled) b.focus(); else el(id).querySelector('.pc-toggle').focus();
		}

		// Drag a calculation by its handle (mouse, touch or pen). The card follows the pointer: whichever
		// slot the pointer is over, the card takes, and the order is saved when it is released.
		function startDrag(eq, grip, e) {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			e.preventDefault();
			var pid = e.pointerId, lastY = e.clientY, raf = 0, active = true;
			// the card is lifted and follows the pointer; where it was grabbed stays under the finger
			var grab = e.clientY - eq.getBoundingClientRect().top;
			eq.style.transition = 'none'; eq.style.zIndex = 30;
			eq.classList.add('pc-dragging');
			parent.classList.add('pc-sorting');
			follow();

			function follow() {
				var dy = (lastY - grab) - (layoutTop(eq) - window.pageYOffset);
				eq.style.transform = 'translateY(' + dy + 'px) scale(1.015)';
			}

			function place() {
				var others = state.order.filter(function (id) { return id !== eq.id; });
				var idx = 0, y = lastY + window.pageYOffset;
				others.forEach(function (id) {
					var o = el(id);   // untransformed layout, so cards still gliding don't confuse the slot choice
					if (y > layoutTop(o) + o.offsetHeight / 2) idx++;
				});
				var next = others.slice();
				next.splice(idx, 0, eq.id);
				if (next.join() !== state.order.join()) { state.order = next; animatedPaint(eq); }
				follow();
			}
			function tick() {
				if (!active) return;
				var edge = 70, speed = 0;
				if (lastY < edge) speed = -Math.ceil((edge - lastY) / 5);
				else if (lastY > window.innerHeight - edge) speed = Math.ceil((lastY - (window.innerHeight - edge)) / 5);
				if (speed) { window.scrollBy(0, speed); place(); } else follow();
				raf = requestAnimationFrame(tick);
			}
			// Listen on the window, not the handle: re-ordering re-inserts the dragged card into the page, and the
			// browser drops pointer capture from an element that is moved, which ended the drag after one slot.
			function onMove(ev) { if (ev.pointerId !== pid) return; lastY = ev.clientY; place(); }
			function end(ev) {
				if (!active || (ev && ev.pointerId !== undefined && ev.pointerId !== pid)) return;
				active = false;
				cancelAnimationFrame(raf);
				window.removeEventListener('pointermove', onMove, true);
				window.removeEventListener('pointerup', end, true);
				window.removeEventListener('pointercancel', end, true);
				window.removeEventListener('blur', end);
				eq.classList.remove('pc-dragging');
				parent.classList.remove('pc-sorting');
				save(); paint();
				// settle: ease the card from where it was let go into its slot
				if (reduceMotion) { eq.style.transition = ''; eq.style.transform = ''; eq.style.zIndex = ''; }
				else {
					void eq.offsetHeight;
					eq.style.transition = 'transform 200ms cubic-bezier(.2,.8,.3,1)'; eq.style.transform = '';
					var fin = function () { eq.removeEventListener('transitionend', fin); eq.style.transition = ''; eq.style.zIndex = ''; };
					eq.addEventListener('transitionend', fin); setTimeout(fin, 300);
				}
			}
			window.addEventListener('pointermove', onMove, true);
			window.addEventListener('pointerup', end, true);
			window.addEventListener('pointercancel', end, true);
			window.addEventListener('blur', end);
			raf = requestAnimationFrame(tick);
		}

		function setCollapsed(id, c) {
			var i = state.collapsed.indexOf(id);
			if (c && i < 0) state.collapsed.push(id);
			if (!c && i > -1) state.collapsed.splice(i, 1);
			save(); paint();
			var eq = el(id);
			var f = c ? eq.querySelector('.pc-summary') : eq.querySelector('.pc-toggle');
			if (f) f.focus();
		}

		// toolbar
		var bar = document.createElement('div');
		bar.className = 'pc-toolbar';
		bar.innerHTML = '<button type="button" id="pc-clear" class="pc-link" title="Empty every calculation">Clear all</button><button type="button" id="pc-custom" class="pc-link" aria-pressed="false">Custom layout</button><button type="button" id="pc-reset" class="pc-link" style="display:none">Reset layout</button><button type="button" id="pc-collapse-all" class="pc-link">Collapse all</button>';
		parent.insertBefore(bar, first);
		// the move arrows and fold chevrons are hidden until "Custom layout" is clicked; the link then reads "Hide icons"
		document.getElementById('pc-clear').addEventListener('click', function () { CALCULATOR.clearAll(); });
		document.getElementById('pc-custom').addEventListener('click', function () {
			var on = !parent.classList.contains('pc-customizing');
			parent.classList.toggle('pc-customizing', on);
			this.textContent = on ? 'Hide icons' : 'Custom layout';
			this.setAttribute('aria-pressed', on ? 'true' : 'false');
		});
		document.getElementById('pc-collapse-all').addEventListener('click', function () {
			state.collapsed = state.collapsed.length === DEFAULT.length ? [] : DEFAULT.slice();
			save(); paint();
		});
		document.getElementById('pc-reset').addEventListener('click', function () {
			state = { order: DEFAULT.slice(), collapsed: [] };
			save(); paint();
		});

		DEFAULT.forEach(function (id) { build(el(id)); });
		paint();

		return {
			expandAll: function () { state.collapsed = []; paint(); },
			refreshSummaries: function () {
				DEFAULT.forEach(function (id) {
					var eq = el(id), t = eq.querySelector('.pc-summary-text'), sum = eq.querySelector('.pc-summary');
					if (t) { t.textContent = label(eq); if (sum) sum.setAttribute('aria-label', 'Expand: ' + label(eq)); }
				});
			}
		};
	})();


	/* ---- Labels and Save (as in the app): the toolbar buttons, a label field per calculation, the strip of saved scenarios ---- */
	(function () {
		var bar = document.querySelector('.pc-toolbar'), main = document.getElementById('main-content');
		if (!bar || !main) return;
		CALCULATOR.labels = CALCULATOR.readJ(CALCULATOR.LABELS, {});
		$('.equation').each(function () {
			var key = this.id.replace('equation-', ''), $f = $('<div class="calc-label-field"></div>'), $i = $('<input type="text" maxlength="40" autocomplete="off">');
			$i.attr({ 'data-eq': key, placeholder: 'Label: e.g. Personal taxes, Business, Discount', 'aria-label': 'Label for calculation ' + key }).val(CALCULATOR.labels[key] || '');
			$i.on('input', function () { var l = $.extend({}, CALCULATOR.labels); l[key] = this.value; CALCULATOR.labels = l; CALCULATOR.writeJ(CALCULATOR.LABELS, l); if (window.PCLayout) window.PCLayout.refreshSummaries(); });
			$f.append($i); var first = $(this).find('.input-row').first(); if (first.length) $f.insertBefore(first); else $(this).append($f);
		});
		var $labels = $('<button type="button" id="pc-labels" class="pc-link" aria-pressed="false">Labels</button>').on('click', function () { CALCULATOR.showLabels(!document.body.classList.contains('pc-show-labels')); });
		var $save = $('<button type="button" id="pc-save" class="pc-link" title="Keep the current numbers under a name">Save</button>').on('click', CALCULATOR.saveCurrent);
		$(bar).prepend($save).prepend($labels);
		$('<div id="pc-saved-strip" class="pc-saved-strip" aria-label="Saved calculations"></div>').insertAfter(bar);
		CALCULATOR.showLabels(CALCULATOR.readJ(CALCULATOR.LSHOW, 0) == 1);
		CALCULATOR.renderSaves();
		if (window.PCLayout) window.PCLayout.refreshSummaries();
	})();

	// restore the saved values (or open a shared link) once the layout controls exist
	if (!CALCULATOR.initializeCustomCalculation()) CALCULATOR.restore();

});
