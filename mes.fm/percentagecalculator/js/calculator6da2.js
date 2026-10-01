$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			createNewUrl: true,
			oldShareUrl: '',

			preciseAnswer: function(a) {
				var b = Math.abs(a);
				switch(true) {
					case b >= 10000000:
						a = CALCULATOR.convertToScientific(a);
		            	return a;
		            case b >= 1:
						a = a.toFixed(2);
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

			shareUrl: function () {

				if(!CALCULATOR.createNewUrl) return false;

				var inputs = [];
				var inputRow = [];
				var equation = [];
				var emptyEquation = true;

				$(CALCULATOR.canonicalEquations()).each(function(index1) {
					$(this).find('.input-row').each(function(index2) {
						$(this).find('.input').each(function(index3) {
							if($(this).val() == '')
								inputs[index3] = '';
							else {
								inputs[index3] = $(this).val().replace(/[^0-9\.]/g, '');
								if(emptyEquation)
									emptyEquation = false;
							}
								
						});
						inputRow.push(inputs);
						inputs = [];
					});
					equation.push(inputRow);
					inputRow = [];
				});

				if(emptyEquation) {
					$("#url-to-share").val("https://mes.fm/percentagecalculator");
					return false;
				}

				CALCULATOR.createUrl(equation);
				CALCULATOR.createNewUrl = false;
			},

			createUrl: function(data) {

				$("#url-to-share").val("Loading...");

				// php/createShareUrl.php used to write to a MySQL table (sharecalcdb.pc)
				// that doesn't exist on static hosting -- mes.fm/api/share.js replaces
				// it with an Upstash Redis-backed serverless function (same Redis
				// mes.fm/api's own pageview tracking already uses; ?calc=pc namespaces
				// the key). Share links are now mes.fm/percentagecalculator/s/<id>.
				$.ajax({
					url:'/api/share?calc=pc',
					type:'POST',
					contentType:'application/json',
					data: JSON.stringify({calc:'pc', data:data})
				})
					.done(
						function(response) {
							var url = window.location.origin + '/percentagecalculator/s/' + response.id;
							$("#url-to-share").val(url);
							CALCULATOR.oldShareUrl = url;
						})
					.fail(
						function() {
							$("#url-to-share").val("Sharing is temporarily unavailable.");
						});
			},

			initializeCustomCalculation: function() {

				var match = window.location.pathname.match(/^\/percentagecalculator\/s\/([A-Za-z0-9]+)\/?$/);

				if(!match)
					return false;

				var id = match[1];

				$.ajax({
					url:'/api/share',
					type:'GET',
					data:({calc:'pc', id:id})
				})
				.done(
					function(data) {

						if(!data) {
							return false;
						}

						var decodedDataArray = (typeof data === 'string') ? JSON.parse(data) : data;

						// links saved before the percentage-difference row was added (row 5) hold 9 equations: slot in an empty one
						if(decodedDataArray.length === 9) {
							decodedDataArray.splice(4, 0, [["", ""]]);
						}

						//open all duplicate equations
						for(i = 0; i < decodedDataArray.length; i++ ) {
							for(x = 1; x < decodedDataArray[i].length; x++) {
								$("#equation-"+(i+1)+" .plus-sign-button")[0].click();
							}
						}

						//make sure every calculation is expanded, so the shared values are visible
						if (window.PCLayout) window.PCLayout.expandAll();

						//flatten 3D array into 1D array
						var oneDimensionalArray = $.map(decodedDataArray, function recurs(n) {
							return ($.isArray(n) ? $.map(n, recurs): n);
						});

						// values were saved in canonical order; the page may be arranged differently
						$(CALCULATOR.canonicalEquations()).find('.input').each(function(index) {
							$(this).val(oneDimensionalArray[index]);
						});

						$(".input-row").each(function(index) {
							$(this).find('.input').first().trigger('propertychange');
						})

					}
				)
				.fail(
					function() {
						// bad/expired id -- nothing to restore, leave the page at its default state
					}
				);

			},

			copyLink: function(elem) {
				// create hidden text element, if it doesn't already exist
			    var targetId = "_hiddenCopyText_";
			    var isInput = elem.tagName === "INPUT" || elem.tagName === "TEXTAREA";
			    var origSelectionStart, origSelectionEnd;
			    if (isInput) {
			        // can just use the original source element for the selection and copy
			        target = elem;
			        origSelectionStart = elem.selectionStart;
			        origSelectionEnd = elem.selectionEnd;
			    } else {
			        // must use a temporary form element for the selection and copy
			        target = document.getElementById(targetId);
			        if (!target) {
			            var target = document.createElement("textarea");
			            target.style.position = "absolute";
			            target.style.left = "-9999px";
			            target.style.top = "0";
			            target.id = targetId;
			            document.body.appendChild(target);
			        }
			        target.textContent = elem.textContent;
			    }
			    // select the content
			    var currentFocus = document.activeElement;
			    target.focus();
			    target.setSelectionRange(0, target.value.length);
			    
			    // copy the selection
			    var succeed;
			    try {
			    	  succeed = document.execCommand("copy");
			    } catch(e) {
			        succeed = false;
			    }
			    // restore original focus
			    if (currentFocus && typeof currentFocus.focus === "function") {
			        currentFocus.focus();
			    }
			    
			    if (isInput) {
			        // restore prior selection
			        elem.setSelectionRange(origSelectionStart, origSelectionEnd);
			    } else {
			        // clear temporary content
			        target.textContent = "";
			    }
			    return succeed;
			},

			bindInputs: function() {
				$(".input").each(function() {
				    var currentVal = $(this);
				    // Save current value of input
				    currentVal.data('currentVal', currentVal.val());
				    // Look for changes in the value
				    currentVal.bind("propertychange keyup input paste", function(event){
				    	var inputs = Array();
				    	var parentContainer = $(this).closest('div[class^="input-row"]');
				    	parentContainer.find(".input").each(function() {
				    		inputs.push(Number($(this).val().replace(/[^0-9\.]/g, '')));
				    	});

				    	inputs['answer'] = parentContainer.find(".answer");
				    	inputs['formula'] = parentContainer.find(".formula");
				    	var equation = parseInt($(this).closest('.equation').attr('id').replace('equation-', ''), 10);

				    	// If value has changed...
				    	if (currentVal.data('currentVal') != currentVal.val()) {
			        		// Updated stored value
			        		currentVal.data('currentVal', currentVal.val());
			        		// Do action
					        //CALCULATOR.calcAnswer1(inputs);
					        if(!CALCULATOR.createNewUrl) CALCULATOR.createNewUrl = true;

					        // rows in page order: 1-4, 5 = percentage difference, then the old 5-9 (mixed fraction, more calculations) as 6-10
					        switch(equation) {
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
					    }
					});
				});
			},

			isNumberKey: function(key) {
				var charCode = (key.which) ? key.which : event.keyCode;
				if (charCode !=45 && charCode != 46 && charCode > 31 && (charCode < 48 || charCode > 57))
					return false;
				return true;
			}
		}
	})();

	$(".input").keypress(function() {
		var keyPressed = $(this).val();
		return CALCULATOR.isNumberKey(keyPressed);
	});

	$(".question-mark-button").click(function() {
		// the "?" sits inside the row's .eq-text wrapper, so the formula box is a sibling of the wrapper, not of the button
		$(this).closest(".input-row").children(".box-container").toggleClass("hide");
		$(this).toggleClass("selected");
	});

	$(".button-icon--mixed-fraction").click(function() {
		$(this).closest('div[class^="mixed-fraction-container"]').nextAll(".box-container").toggleClass("hide");
		$(this).toggleClass("selected");
	});

	$(".plus-sign-button").click(function() {
		$(this).closest('div[class^="input-row"]').clone(true).appendTo($(this).closest(".equation"));
		$(this).closest('div[class^="equation"]').find('.plus-sign-button').last().html('x').addClass("x-sign-button").unbind();
		$('.x-sign-button').bind("click", function() {
			$(this).closest(".input-row").remove();
		});

		CALCULATOR.bindInputs();
	});

	$("#share-calc-button").click(function() {
		CALCULATOR.shareUrl();
		if($("#share-calc-url-container").hasClass("hide")) {
			$("#share-calc-url-container").fadeIn(500).removeClass("hide").css("display","inline-block");
			$(this).html("Update Calculations");
		}
	});

	$("#copy-link-button").click(function() {
		CALCULATOR.copyLink(document.getElementById("url-to-share"));
		$('<span style="margin-left:0.5em;vertical-align:middle;font-weight:700;color:red">Copied!</span>').insertAfter($(this)).fadeOut(2000);
	});

	CALCULATOR.bindInputs();
	CALCULATOR.initializeCustomCalculation();

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
			return out.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
		}

		var svg = function (d) { return '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; };
		var CHEV_UP = svg('M2 8l4-4 4 4'), CHEV_DOWN = svg('M2 4l4 4 4-4');
		// "fold" icon: two chevrons pointing in (collapse) or out (expand), so it can't be mistaken for the move arrows
		var FOLD_IN = svg('M2 1.5l4 3 4-3M2 10.5l4-3 4 3'), FOLD_OUT = svg('M2 4.5l4-3 4 3M2 7.5l4 3 4-3');

		function el(id) { return document.getElementById(id); }

		function build(eq) {
			var bar = document.createElement('div');
			bar.className = 'pc-eq-tools pc-move';
			bar.innerHTML =
				'<button type="button" class="pc-tool pc-up" title="Move up" aria-label="Move this calculation up">' + CHEV_UP + '</button>' +
				'<button type="button" class="pc-tool pc-down" title="Move down" aria-label="Move this calculation down">' + CHEV_DOWN + '</button>';
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
			bar.querySelector('.pc-up').addEventListener('click', function () { move(eq.id, -1, '.pc-up'); });
			bar.querySelector('.pc-down').addEventListener('click', function () { move(eq.id, 1, '.pc-down'); });
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
				eq.querySelector('.pc-up').disabled = i === 0;
				eq.querySelector('.pc-down').disabled = i === state.order.length - 1;
			});
			var all = state.collapsed.length === DEFAULT.length;
			var b = document.getElementById('pc-collapse-all');
			if (b) b.textContent = all ? 'Expand all' : 'Collapse all';
			var r = document.getElementById('pc-reset');
			if (r) r.style.display = (state.order.join() === DEFAULT.join() && !state.collapsed.length) ? 'none' : '';
		}

		function move(id, dir, focusSel) {
			var i = state.order.indexOf(id), j = i + dir;
			if (j < 0 || j >= state.order.length) return;
			state.order.splice(i, 1);
			state.order.splice(j, 0, id);
			save(); paint();
			var b = el(id).querySelector(focusSel);
			if (b && !b.disabled) b.focus(); else el(id).querySelector('.pc-toggle').focus();
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
		bar.innerHTML = '<button type="button" id="pc-custom" class="pc-link" aria-pressed="false">Custom layout</button><button type="button" id="pc-reset" class="pc-link" style="display:none">Reset layout</button><button type="button" id="pc-collapse-all" class="pc-link">Collapse all</button>';
		parent.insertBefore(bar, first);
		// the move arrows and fold chevrons are hidden until "Custom layout" is clicked; the link then reads "Hide icons"
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
			expandAll: function () { state.collapsed = []; paint(); }
		};
	})();

});