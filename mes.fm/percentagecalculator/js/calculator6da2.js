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

			shareUrl: function () {

				if(!CALCULATOR.createNewUrl) return false;

				var inputs = [];
				var inputRow = [];
				var equation = [];
				var emptyEquation = true;

				$('.equation').each(function(index1) {
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

						//open all duplicate equations
						for(i = 0; i < decodedDataArray.length; i++ ) {
							for(x = 1; x < decodedDataArray[i].length; x++) {
								$("#equation-"+(i+1)+" .plus-sign-button")[0].click();
							}
						}

						//open extra calculations -- ensure it's shown rather than
						//toggling, since it's open by default now (a blind .click()
						//would close it instead of opening it)
						$("#extra-calcs").removeClass("hide");
						$("#more-calcs-button").addClass("selected");

						//flatten 3D array into 1D array
						var oneDimensionalArray = $.map(decodedDataArray, function recurs(n) {
							return ($.isArray(n) ? $.map(n, recurs): n);
						});

						$('.input').each(function(index) {
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
				    	var equation = $(this).closest('div[class^="equation"]').index('.equation') + 1;

				    	// If value has changed...
				    	if (currentVal.data('currentVal') != currentVal.val()) {
			        		// Updated stored value
			        		currentVal.data('currentVal', currentVal.val());
			        		// Do action
					        //CALCULATOR.calcAnswer1(inputs);
					        if(!CALCULATOR.createNewUrl) CALCULATOR.createNewUrl = true;

					        switch(equation) {
					        	case 1:
					        		CALCULATOR.calcAnswer1(inputs);
					        	break;
					        	case 2:
					        		CALCULATOR.calcAnswer2(inputs);
					        	break;
					        	case 3:
					        		CALCULATOR.calcAnswer3(inputs);
					        	break;
					        	case 4:
					        		CALCULATOR.calcAnswer4(inputs);
					        	break;
					        	case 5:
					        		CALCULATOR.calcAnswer5(inputs);
					        	break;
					        	case 6:
					        		CALCULATOR.calcAnswer6(inputs);
					        	break;
					        	case 7:
					        		CALCULATOR.calcAnswer7(inputs);
					        	break;
					        	case 8:
					        		CALCULATOR.calcAnswer8(inputs);
					        	break;
					        	case 9:
					        		CALCULATOR.calcAnswer9(inputs);
					        	break;
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
		$(this).nextAll(".box-container").toggleClass("hide");
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

});