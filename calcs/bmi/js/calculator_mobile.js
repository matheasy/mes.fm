$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			imperial: false,
			createNewUrl: true,
			oldShareUrl: '',

			calcBMI: function () {
				if(!CALCULATOR.createNewUrl) CALCULATOR.createNewUrl = true;

				if(this.imperial){
					var weight = parseFloat($("#pounds-input").val());
					var feet = parseFloat($("#feet-input").val());
					var inches = parseFloat($("#inches-input").val());
					var height = feet * 12 + inches;

					var bmi = (weight/(height*height))*703.06957964;


					} else {
						var weight = parseFloat($("#kilograms-input").val());
						var centimeters = parseFloat($("#centimeters-input").val());
						var height = centimeters/100;

						var bmi = weight/(height*height);
					}

					if(isNaN(bmi)) {
						$("#bmi-input-result").val("");
					} else {
					    $("#bmi-input-result").val(bmi.toFixed(1));
					}

					this.calcFinalResult(weight,height,bmi);
			},

			calcFinalResult: function(weight,height,bmi) {
				bmi = bmi.toFixed(1);
				if(this.imperial) {
					var unit = "pounds";
					var extra = 703.06957964;
				} else {
					var unit = "kilograms";
					var extra = 1;
				}
				var finalResult = $("#result-text");

				switch(true)
				{
				  case bmi < 18.5:
				    finalResult.html("You are <span>underweight</span>.<br>To obtain a normal body weight, you should gain between <span>"+((18.5*(height*height)/extra)-weight).toFixed(2)+"</span> and <span>"+((24.9*(height*height)/extra)-weight).toFixed(2)+"</span> "+unit+".");
				    this.showCheckMark(false);
				    this.highlightCategory(1);
				    break;
				  case bmi >= 18.5 && bmi <= 24.9:
				    finalResult.html("You have a normal body weight. Great job!");
				    this.showCheckMark(true);
				    this.highlightCategory(2);
				    break;
				  case bmi > 24.9 && bmi <= 29.9:
				    finalResult.html("You are <span>overweight</span>.<br>To obtain a normal body weight, you should lose between <span>"+(weight-(24.9*(height*height)/extra)).toFixed(2)+"</span> and <span>"+(weight-(18.5*(height*height)/extra)).toFixed(2)+"</span> "+unit+".");
				    this.showCheckMark(false);
				    this.highlightCategory(3);
				    break;
				  case bmi > 29.9:
				    finalResult.html("You are <span>obese</span>.<br>To obtain a normal body weight, you should lose between <span>"+(weight-(24.9*(height*height)/extra)).toFixed(2)+"</span> and <span>"+(weight-(18.5*(height*height)/extra)).toFixed(2)+"</span> "+unit+".");
				    this.showCheckMark(false);
				    this.highlightCategory(4);
				    break;
				  default:
				    finalResult.text("Please enter your weight and height in the fields at the top.");
				    this.resetProperties();
				}
			},

			showCheckMark: function(normal) {
				if(normal) {
					$("#check-mark-container img").attr("src","//mes.fm/main_img/green-check-mark.png");
					$("#check-mark-container img").attr("alt","green check mark");
				} else {
					$("#check-mark-container img").attr("src","//mes.fm/main_img/red-circle-mark.png");
					$("#check-mark-container img").attr("alt","red circle mark");
				}

				$("#check-mark-container").css("display","table-cell");
			},

			highlightCategory: function(n) {
				$("#bmi-categories-container .category").removeClass("healthy-category");
				$("#bmi-categories-container .category").removeClass("unhealthy-category");

				if(n==2)
					$("#bmi-categories-container .category:nth-child("+n+")").addClass("healthy-category");
				else
					$("#bmi-categories-container .category:nth-child("+n+")").addClass("unhealthy-category");
			},

			resetProperties: function() {
				$("#check-mark-container").css("display","none");
				$("#bmi-categories-container .category").removeClass("healthy-category");
				$("#bmi-categories-container .category").removeClass("unhealthy-category");				
			},

			convertToMetric: function() {
				var pounds = parseFloat($("#pounds-input").val());
				var feet = parseFloat($("#feet-input").val());
				var inches = parseFloat($("#inches-input").val());

				var kilograms = pounds * 0.453592;
				var centimeters = (feet*12 + inches)*2.54;

				if(isNaN(kilograms)) {
					$("#kilograms-input").val("");
				} else {
					$("#kilograms-input").val(kilograms.toFixed(2));
				}

				if(isNaN(centimeters)) {
					$("#centimeters-input").val("");
				} else {
					$("#centimeters-input").val(centimeters.toFixed(2));
				}
			},

			convertToImperial: function() {
				var kilograms = parseFloat($("#kilograms-input").val());
				var centimeters = parseFloat($("#centimeters-input").val());

				var pounds = kilograms * 2.20462;
				var inches = centimeters * 0.393701;
				var feet = parseInt(inches/12);

				inches = inches - feet*12;

				if(isNaN(pounds)) {
					$("#pounds-input").val("");
				} else {
					$("#pounds-input").val(pounds.toFixed(2));
				}

				if(isNaN(feet)) {
					$("#feet-input").val("");
				} else {
					$("#feet-input").val(feet);
				}

				if(isNaN(inches)) {
					$("#inches-input").val("");
				} else {
					$("#inches-input").val(inches.toFixed(2));
				}
			},

			shareUrl: function () {

				if(!CALCULATOR.createNewUrl) return false;
				
				var equation = {};
				equation['weight'] = parseFloat($("#kilograms-input").val());
				equation['height'] = parseFloat($("#centimeters-input").val());

				if($("#bmi-input-result").val() == '') {
					$("#url-to-share").val("https://bmi.mes.fm");
					return false;
				}

				CALCULATOR.createNewUrl = false;
				CALCULATOR.createUrl(equation);
			},

			createUrl: function(data) {

				$("#url-to-share").val("Loading...");

				$.ajax({
					url:'php/createShareUrl.php',
					type:'POST',
					data:({data:data,tableName:'bmi',site:'https://bmi.mes.fm/'})
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
					data:({id:id,tableName:'bmi'})
				})
				.done(
					function(data) {
						if(data) {
							var decodedDataArray = JSON.parse(data);
							$("#kilograms-input").val(decodedDataArray['weight']);
							$("#centimeters-input").val(decodedDataArray['height']);
							CALCULATOR.convertToImperial();
							CALCULATOR.calcBMI();
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

			isNumberKey: function(key) {
				var charCode = (key.which) ? key.which : event.keyCode;
				if (charCode != 46 && charCode > 31 && (charCode < 48 || charCode > 57))
					return false;
				return true;
			},

			isNumberKeyNoDecimal: function(key) {
				var charCode = (key.which) ? key.which : event.keyCode;
				if (charCode > 31 && (charCode < 48 || charCode > 57))
					return false;
				return true;
			}
		}
	})();

	CALCULATOR.initializeCustomCalculation();

	$("#pounds-input,#inches-input,#kilograms-input,#centimeters-input").keypress(function() {
		var keyPressed = $(this).val();
		return CALCULATOR.isNumberKey(keyPressed);
	});

	$("#feet-input").keypress(function() {
		var keyPressed = $(this).val();
		return CALCULATOR.isNumberKeyNoDecimal(keyPressed);
	});

	$("#pounds-input,#feet-input,#inches-input,#kilograms-input,#centimeters-input").each(function() {
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
		        CALCULATOR.calcBMI();
		    }
		});
	});

	$(".metric-button").click(function() {
		$(".imperial-button").removeClass("active-button");
		$(".metric-button").addClass("active-button");
		$("#imperial-container").addClass("hide");
		$("#metric-container").removeClass("hide");

		CALCULATOR.imperial = false;
		CALCULATOR.convertToMetric();
		CALCULATOR.calcBMI();
	});

	$(".imperial-button").click(function() {
		$(".metric-button").removeClass("active-button");
		$(".imperial-button").addClass("active-button");
		$("#metric-container").addClass("hide");
		$("#imperial-container").removeClass("hide");

		CALCULATOR.imperial = true;
		CALCULATOR.convertToImperial();
		CALCULATOR.calcBMI();
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