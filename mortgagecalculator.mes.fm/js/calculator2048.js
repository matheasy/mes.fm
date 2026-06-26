$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			shortMonthNames: [ "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ],
            longMonthNames: [ "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December" ],
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

			calculate: function () {
				if(!CALCULATOR.createNewUrl) CALCULATOR.createNewUrl = true;
				
				//Inputs
				var homeValue = parseFloat($("#home-value-input").val().replace(/[^0-9\.]/g, ''));
				var P = parseFloat($("#loan-amount-input").val().replace(/[^0-9\.]/g, '')); //loan amount
				var i = parseFloat($("#interest-rate-input").val())/100; //interest rate
				if (i==0) i = 0.00000001;
				var loanTerm = parseFloat($("#loan-term-input").val());
				var startDate = $("#start-date-input").val();
				var propertyTax = parseFloat($("#property-tax-input").val())/100;
				var PMI = parseFloat($("#pmi-input").val())/100;
				var monthsPMI = parseFloat($("#pmi-months-input").val());
				var B = parseFloat($("#final-balloon-payment-input").val().replace(/[^0-9\.]/g, '')); //final balloon payment

				//Outputs
				var n = loanTerm * 12; //total number of monthly payments
				var totalPropertyTaxPaid = homeValue * propertyTax * loanTerm;
				var monthlyPMIPayment = PMI/12 * P;
				var totalPMIpaid = monthlyPMIPayment * monthsPMI;
				var monthlyPaymentWithoutTax = P*i/12*Math.pow((1+i/12),n)/(Math.pow((1+i/12),n)-1)+B*i/12/((1+i/12)-Math.pow((1+i/12),(n+1)));
				var totalPaymentWithoutTax = monthlyPaymentWithoutTax * n + B;
				var monthlyPaymentWithTax = monthlyPaymentWithoutTax + totalPropertyTaxPaid/n + totalPMIpaid/n;
				var totalPaymentWithTax = monthlyPaymentWithTax * n + B;
				var numberMonthsPMI = monthsPMI;
				var payOffDate = CALCULATOR.parseDate(startDate);
				payOffDate.setMonth(payOffDate.getMonth() + (n-1));
				payOffDate = CALCULATOR.getMonthYear(payOffDate);
				var totalInterestPaid = totalPaymentWithoutTax - P;
				var yearlyPropertyTax = homeValue * propertyTax;
				var payOffDatePMI = CALCULATOR.parseDate(startDate);
				payOffDatePMI.setMonth(payOffDatePMI.getMonth() + 28);
				payOffDatePMI = CALCULATOR.getMonthYear(payOffDatePMI);
				var monthlyPayment = monthlyPaymentWithoutTax;
				var monthlyTotalPayment = totalPaymentWithoutTax;
				var monthlyNumberPayments = n;
				var monthlyPayOffDate = payOffDate;
				var monthlyTotalInterestPaid = totalInterestPaid;
				var biWeeklyPayment = monthlyPayment/2;
				var biWeeklyNumberPayments = Math.log(((-B*i/26/(1+i/26)+monthlyPaymentWithoutTax/2)/(monthlyPaymentWithoutTax/2-P*i/26)))/Math.log(1+i/26);
				var biWeeklyTotalPayment = biWeeklyPayment * biWeeklyNumberPayments + B;
				var biWeeklyPayOffDate = CALCULATOR.parseDate(startDate);
				biWeeklyPayOffDate.setMonth(biWeeklyPayOffDate.getMonth() + biWeeklyNumberPayments/26*12);
				biWeeklyPayOffDate = CALCULATOR.getMonthYear(biWeeklyPayOffDate);
				var biWeeklyTotalInterestPaid = biWeeklyTotalPayment - P;
				var totalInterestSavings = monthlyTotalInterestPaid - biWeeklyTotalInterestPaid;
				var monthlyPaymentNoBalloon = P*i/12*Math.pow((1+i/12),n)/(Math.pow((1+i/12),n)-1);
				var totalPaymentNoBalloon = monthlyPaymentNoBalloon * n;
				var totalInterestPaidNoBalloon = totalPaymentNoBalloon - P;
				var monthlyPaymentBalloon = monthlyPaymentWithoutTax;
				var totalPaymentBalloon = totalPaymentWithoutTax;
				var totalInterestPaidBalloon = totalPaymentBalloon - P;
				var totalInterestSavingsBalloon = totalInterestPaidBalloon - totalInterestPaidNoBalloon;


				//Mortgage Repayment Summary
				$("#monthly-payment-no-tax-result").html('$'+CALCULATOR.preciseAnswer(monthlyPaymentWithoutTax));
				$("#total-payment-no-tax-result").html('$'+CALCULATOR.preciseAnswer(totalPaymentWithoutTax));
				$("#monthly-payment-tax-result").html('$'+CALCULATOR.preciseAnswer(monthlyPaymentWithTax));
				$("#total-payment-tax-result").html('$'+CALCULATOR.preciseAnswer(totalPaymentWithTax));
				$("#number-monthly-payments-result").html(n);
				$("#pay-off-date-result").html(payOffDate);

				//Payment Breakdown
				$("#payment-breakdown-principle-result").html('$'+CALCULATOR.preciseAnswer(P));	
				$("#payment-breakdown-total-interest-paid-result").html('$'+CALCULATOR.preciseAnswer(totalInterestPaid));
				$("#payment-breakdown-property-tax-result").html('$'+CALCULATOR.preciseAnswer(totalPropertyTaxPaid));
				$("#payment-breakdown-pmi-result").html('$'+CALCULATOR.preciseAnswer(totalPMIpaid));

				//Property Tax
                $("#property-tax-yearly-result").html('$'+CALCULATOR.preciseAnswer(yearlyPropertyTax));
				$("#property-tax-total-result").html('$'+CALCULATOR.preciseAnswer(totalPropertyTaxPaid));

				//Private Mortgage Insurance (PMI)
				$("#monthly-pmi-payment-result").html('$'+CALCULATOR.preciseAnswer(monthlyPMIPayment));
				$("#total-pmi-paid-result").html('$'+CALCULATOR.preciseAnswer(totalPMIpaid));
				$("#pmi-number-months-result").html(numberMonthsPMI);
                $("#pmi-pay-off-date-result").html(payOffDatePMI);							
		
				////Monthly vs. Bi-Weekly Payment (Excluding Tax/PMI)
				//Monthly
				$("#monthly-payment-result").html('$'+CALCULATOR.preciseAnswer(monthlyPayment));
				$("#monthly-total-payment-result").html('$'+CALCULATOR.preciseAnswer(monthlyTotalPayment));
				$("#monthly-number-payments-result").html(monthlyNumberPayments);
				$("#monthly-pay-off-date-result").html(monthlyPayOffDate);
				$("#monthly-total-interest-paid-result").html('$'+CALCULATOR.preciseAnswer(monthlyTotalInterestPaid));
				//Bi-Weekly
				$("#bi-weekly-payment-result").html('$'+CALCULATOR.preciseAnswer(biWeeklyPayment));
				$("#bi-weekly-total-payment-result").html('$'+CALCULATOR.preciseAnswer(biWeeklyTotalPayment));
				$("#bi-weekly-number-payments-result").html(Math.ceil(biWeeklyNumberPayments));
				$("#bi-weekly-pay-off-date-result").html(biWeeklyPayOffDate);
				$("#bi-weekly-total-interest-paid-result").html('$'+CALCULATOR.preciseAnswer(biWeeklyTotalInterestPaid));
				//Total
				$("#total-interest-savings-result").html('$'+CALCULATOR.preciseAnswer(totalInterestSavings));

				////Balloon Payment Breakdown (Excluding Tax/PMI)
				//Without Balloon
				$("#monthly-payment-no-balloon-result").html('$'+CALCULATOR.preciseAnswer(monthlyPaymentNoBalloon));
				$("#total-payment-no-balloon-result").html('$'+CALCULATOR.preciseAnswer(totalPaymentNoBalloon));
				$("#total-interest-paid-no-balloon-result").html('$'+CALCULATOR.preciseAnswer(totalInterestPaidNoBalloon));
				//With Balloon
				$("#monthly-payment-balloon-result").html('$'+CALCULATOR.preciseAnswer(monthlyPaymentBalloon));
				$("#total-payment-balloon-result").html('$'+CALCULATOR.preciseAnswer(totalPaymentBalloon));
				$("#total-interest-paid-balloon-result").html('$'+CALCULATOR.preciseAnswer(totalInterestPaidBalloon));
				//Total
				$("#total-extra-interest-balloon-result").html('$'+CALCULATOR.preciseAnswer(totalInterestSavingsBalloon));


				$.fn.addCommas = function(){ 
				    return this.each(function(){ 
				        $(this).text( $(this).text().replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1,") ); 
				    })
				}

				$(".result:contains('$')").each(function() {
					var inputValue = parseFloat($(this).text().replace("$", ""));
					if (!$(this).is(':contains("x")') && (inputValue >= 1000 || inputValue <= -1000)) 
						$(this).addCommas();
				});

			},

			parseDate: function(date) {
                  //var pieces = date.match(/(\d+)/g); //find all digits, similar to date.split("-");
                  var pieces = date.split("-");
                  var month = CALCULATOR.getCurrentDateValue(pieces[0]);
                  var year = pieces[1];
                  return new Date(year, month, '15'); // months start at 0, 15 is random day
            },

			getMonthYear: function(d) {
				var m = d.getMonth();
				var y = d.getFullYear();

                var currentDate = ($(document).width() <= 1000) ? CALCULATOR.shortMonthNames[m] +'-'+y : CALCULATOR.longMonthNames[m] +'-'+y;
                return currentDate;
			},

			getCurrentDateValue: function(d) {
				return ($(document).width() <= 1000) ? CALCULATOR.shortMonthNames.indexOf(d) : CALCULATOR.longMonthNames.indexOf(d);
			},

			shareUrl: function () {

				if(!CALCULATOR.createNewUrl) return false;

				var equation = {};
				equation['value'] = parseFloat($("#home-value-input").val().replace(/[^0-9\.]/g, ''));
				equation['dp-percent'] = parseFloat($("#down-payment-percent-input").val());
				equation['loan'] = parseFloat($("#loan-term-input").val());
				equation['date'] = $("#start-date-input").val();
				equation['rate'] = parseFloat($("#interest-rate-input").val());
				equation['tax'] = parseFloat($("#property-tax-input").val());
				equation['pmi'] = parseFloat($("#pmi-input").val());
				equation['pmi-months'] = parseFloat($("#pmi-months-input").val());
				equation['balloon'] = parseFloat($("#final-balloon-payment-input").val().replace(/[^0-9\.]/g, ''));

				/*if($("#kilograms-input").val() == '' || $("#centimeters-input").val() == '') {
					$("#url-to-share").val("https://mc.mes.fm");
					return false;
				}*/

				CALCULATOR.createUrl(equation);
				CALCULATOR.createNewUrl = false;
			},

			createUrl: function(data) {

				$("#url-to-share").val("Loading...");
 
				$.ajax({
					url:'php/createShareUrl.php',
					type:'POST',
					data:({data:data,tableName:'mc',site:'https://mc.mes.fm/'})
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

				if(!id) {
					var d = new Date();
					$('#start-date-input').val(CALCULATOR.getMonthYear(d));
					CALCULATOR.calculate();
					return false;
				}

				$.ajax({
					url:'php/getShareUrl.php',
					type:'GET',
					data:({id:id,tableName:'mc'})
				})
				.done(
					function(data) {
						if(data) {
							var decodedDataArray = JSON.parse(data);

							$("#home-value-input").val(decodedDataArray['value']);
							$("#down-payment-percent-input").val(decodedDataArray['dp-percent']);
							$("#loan-term-input").val(decodedDataArray['loan']);
							$("#start-date-input").val(decodedDataArray['date']);
							$("#interest-rate-input").val(decodedDataArray['rate']);
							$("#property-tax-input").val(decodedDataArray['tax']);
							$("#pmi-input").val(decodedDataArray['pmi']);
							$("#pmi-months-input").val(decodedDataArray['pmi-months']);
							$("#final-balloon-payment-input").val(decodedDataArray['balloon']);

							$("#down-payment-percent-input").trigger('propertychange');
						} else {
							var d = new Date();
							$('#start-date-input').val(CALCULATOR.getMonthYear(d));
						}

						CALCULATOR.calculate();
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

			isNumberKey: function(key) {
				var charCode = (key.which) ? key.which : event.keyCode;
				if (charCode != 45 && charCode != 46 && charCode != 36 && charCode > 31 && (charCode < 48 || charCode > 57))
					return false;
				return true;
			}
		}
	})();

	CALCULATOR.initializeCustomCalculation();

	/*$(".inputs__input").keypress(function() {
		var keyPressed = $(this).val();
		return CALCULATOR.isNumberKey(keyPressed);
	});*/

	$("#home-value-input").each(function() {
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
        		var homeValue = parseFloat(currentVal.val().replace(/[^0-9\.]/g, ''));
        		var downPaymentPercent = parseFloat($("#down-payment-percent-input").val())/100;
		        var downPaymentAmount = downPaymentPercent * homeValue;
		        $("#down-payment-amount-input").val(downPaymentAmount.toFixed(2));
		        $("#loan-amount-input").val((homeValue - downPaymentAmount).toFixed(2));
		        CALCULATOR.calculate();
		    }
		});
	});

	$("#loan-amount-input").each(function() {
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
        		var homeValue = parseFloat($("#home-value-input").val().replace(/[^0-9\.]/g, ''));
		        var downPaymentAmount = homeValue - currentVal.val().replace(/[^0-9\.]/g, '');
		        $("#down-payment-amount-input").val(downPaymentAmount.toFixed(2));
		        $("#down-payment-percent-input").val((downPaymentAmount / homeValue * 100).toFixed(2));
		        CALCULATOR.calculate();
		    }
		});
	});

	$("#down-payment-percent-input").each(function() {
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
        		var homeValue = parseFloat($("#home-value-input").val().replace(/[^0-9\.]/g, ''));
        		var downPaymentPercent = parseFloat(currentVal.val())/100;
		        var downPaymentAmount = downPaymentPercent * homeValue;
		        $("#down-payment-amount-input").val(downPaymentAmount.toFixed(2));
		        $("#loan-amount-input").val((homeValue - downPaymentAmount).toFixed(2));
		        CALCULATOR.calculate();
		    }
		});
	});

	$("#down-payment-amount-input").each(function() {
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
        		var homeValue = parseFloat($("#home-value-input").val().replace(/[^0-9\.]/g, ''));
        		var downPaymentAmount = parseFloat(currentVal.val().replace(/[^0-9\.]/g, ''));
		        $("#down-payment-percent-input").val((downPaymentAmount / homeValue * 100).toFixed(2));
		        $("#loan-amount-input").val((homeValue - downPaymentAmount).toFixed(2));
		        CALCULATOR.calculate();
		    }
		});
	});

	$(".inputs__input").each(function() {
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
		        CALCULATOR.calculate();
		    }
		});
	});

	$( ".calendar-month" ).datepicker({
        changeMonth: true,
        changeYear: true,
        showButtonPanel: true,
        dateFormat: 'MM-yy',
        onClose: function(dateText, inst) { 
            var month = $("#ui-datepicker-div .ui-datepicker-month :selected").val();
            var year = $("#ui-datepicker-div .ui-datepicker-year :selected").val();
            $(this).datepicker('setDate', new Date(year, month, 1));
            CALCULATOR.calculate();
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