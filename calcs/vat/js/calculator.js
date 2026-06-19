$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			addTax: true,
			createNewUrl: true,
			oldShareUrl: '',

			calcAnswer: function () {
				if(!CALCULATOR.createNewUrl) CALCULATOR.createNewUrl = true;

				var netValue = parseFloat($("#net-value-input").val().replace(/[^0-9\.]/g, ''));
				var vatRate = parseFloat($("#vat-rate-input").val());
				var tax = 0;
				var gross = 0;

				if(CALCULATOR.addTax) {
					tax = netValue*vatRate/100;
					gross = netValue + tax;
				} else {
					tax = netValue-netValue/(1+vatRate/100);
					gross = netValue - tax;
				}
				this.calcFinalResult(tax,gross);
			},

			calcFinalResult: function(tax,gross) {
				var result = $("#result");
				var result2 = $("#result-2");
				var finalResult = $("#result-text");

				if(!isNaN(tax)) {
					result.val("$"+tax.toFixed(2));
					result2.val("$"+gross.toFixed(2));
					if(CALCULATOR.addTax)
						finalResult.html("The VAT (value added tax) is <span>$"+tax.toFixed(2)+"</span>.<br>The gross amount after adding this tax to the net value is <span>$"+gross.toFixed(2)+"</span>.");
					else
						finalResult.html("The tax amount amount removed is <span>$"+tax.toFixed(2)+"</span>.<br>The gross amount after removing this tax from the net value is <span>$"+gross.toFixed(2)+"</span>.");

				} else {
					result.val("");
					result2.val("");
					finalResult.html("Please make sure all textfields are filled out.");
				}
			},

			shareUrl: function () {

				if(!CALCULATOR.createNewUrl) return false;

				var equation = {};
				equation['tax'] = CALCULATOR.addTax ? true : false;
				equation['value'] = $("#net-value-input").val().replace(/[^0-9\.]/g, '');
				equation['rate'] = $("#vat-rate-input").val().replace(/[^0-9\.]/g, '');

				if($("#result").val() == '') {
					$("#url-to-share").val("https://vat.mes.fm");
					return false;
				}

				CALCULATOR.createUrl(equation);
				CALCULATOR.createNewUrl = false;
			},

			createUrl: function(data) {

				$("#url-to-share").val("Loading...");
 
				$.ajax({
					url:'php/createShareUrl.php',
					type:'POST',
					data:({data:data,tableName:'vat',site:'https://vat.mes.fm/'})
				})
					.done(
						function(data) {							
							$("#url-to-share").val(data);
							CALCULATOR.oldShareUrl = data;
						});
			},

			initializeCustomCalculation: function() {

				var indexOfSlash = window.location.pathname.lastIndexOf('/');
				var id = window.location.pathname.substring(indexOfSlash + 1);

				if(!id)
					return false;

				$.ajax({
					url:'php/getShareUrl.php',
					type:'GET',
					data:({id:id,tableName:'vat'})
				})
				.done(
					function(data) {
						if(data) {
							var decodedDataArray = JSON.parse(data);
							$("#net-value-input").val(decodedDataArray['value']);
							$("#vat-rate-input").val(decodedDataArray['rate']);

							if(decodedDataArray['tax'] == "false")
								$(".remove-button").click();
							else
								CALCULATOR.calcAnswer();
						}
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

			setUpInputListener: function() {
				$("#net-value-input,#vat-rate-input").each(function() {
					var currentVal = $(this);
				    // Save current value of input
				    currentVal.data('currentVal', currentVal.val());
				    // Look for changes in the value
				    currentVal.bind("propertychange keyup input paste", function(event){
				    // If value has changed...
				    	if (currentVal.data('currentVal') != currentVal.val()) {
			        		// Updated stored value
			        		currentVal.data('currentVal', currentVal.val());
			        		// Do action
			        		CALCULATOR.calcAnswer();
					    }
					});
				});
			},

			isNumberKey: function() {
				$("#net-value-input,#vat-rate-input").keypress(function() {
					var keyPressed = $(this).val();
					var charCode = (keyPressed.which) ? keyPressed.which : event.keyCode;

					if (charCode != 46 && charCode > 31 && (charCode < 48 || charCode > 57))
						return false;
					return true;
				});
			}
		}
	})();

	CALCULATOR.initializeCustomCalculation();
	CALCULATOR.setUpInputListener();
	CALCULATOR.isNumberKey();

	$(".add-button").click(function() {
		$(".remove-button").removeClass("active-button");
		$(".add-button").addClass("active-button");
		$("#header-1").html("Tax Amount Added");
		$("#header-2").html("Gross Amount After Adding Tax");
		CALCULATOR.addTax = true;
		CALCULATOR.calcAnswer();

	});

	$(".remove-button").click(function() {
		$(".add-button").removeClass("active-button");
		$(".remove-button").addClass("active-button");
		$("#header-1").html("Tax Amount Removed");
		$("#header-2").html("Gross Amount After Removing Tax");
		CALCULATOR.addTax = false;
		CALCULATOR.calcAnswer();

	});

	$("#navbar ul li").click(function() {
		if($(this).find("ul").hasClass("display-block")){
			$(this).find("ul").removeClass("display-block");
			$("#navbar").removeClass("bottom");
		} else {
			$("#navbar li ul").removeClass("display-block");
			$(this).find("ul").addClass("display-block");
			$("#navbar").addClass("bottom");
		}
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
});