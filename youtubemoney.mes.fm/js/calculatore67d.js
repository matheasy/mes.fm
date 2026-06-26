$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			createNewUrl: true,
			oldShareUrl: '',

			calcAnswer: function () {
				if(!CALCULATOR.createNewUrl) CALCULATOR.createNewUrl = true;

				var views = $("#input1").val();
				views = views.replace(/,/g, '');
				var RPM = $("#input2").val();
				RPM = RPM.replace(/,/g, '');
				RPM = parseFloat(RPM);
				var revenue = views * RPM/1000;
				var minRevenue = views * 1.36/1000;
				var maxRevenue = views * 3.40/1000;
				/*if(isNaN(answer))
				    $("#answer1").val("");
				else
				    $("#answer1").val(answer.toFixed(2)+"%");*/
				if(!isNaN(views)) {
					if(!isNaN(RPM)) {
						revenue = revenue.toFixed(2);
						revenue = this.commaSeparateNumber(revenue);
						$("#result-text").html("Estimated Revenue:<br><span class='numbers'>$"+revenue+" <span class='usd'>USD</span></span>");
					} else {
						minRevenue = minRevenue.toFixed(2);
						minRevenue = this.commaSeparateNumber(minRevenue);
						maxRevenue = maxRevenue.toFixed(2);
						maxRevenue = this.commaSeparateNumber(maxRevenue);
						$("#result-text").html("Estimated Revenue:<br>Between <span class='numbers'>$"+minRevenue+" <span class='usd'>USD</span> - $"+maxRevenue+" <span class='usd'>USD</span></span><br>"+
							"<p>The values above are based on the typical RPM range from $1.36 to $3.40.</p>");						
					}

					$(".input-container").css("display","block");
				} else {
					$(".input-container").css("display","none");
				}

			},

			commaSeparateNumber: function(val){
			    while (/(\d+)(\d{3})/.test(val.toString())){
			      val = val.toString().replace(/(\d+)(\d{3})/, '$1'+','+'$2');
			    }
			    return val;
			},

			shareUrl: function () {

				if(!CALCULATOR.createNewUrl) return false;

				var equation = {};
				equation['views'] = parseInt($("#input1").val().replace(/[^0-9\.]/g, ''));
				equation['rpm'] = $("#input2").val().replace(/[^0-9\.]/g, '');

				if(isNaN(equation['views']) || equation['views'] == '') {
					$("#url-to-share").val("https://ymc.mes.fm");
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
					data:({data:data,tableName:'ymc',site:'https://ymc.mes.fm/'})
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
					data:({id:id,tableName:'ymc'})
				})
				.done(
					function(data) {
						if(data) {
							var decodedDataArray = JSON.parse(data);
							$("#input1").val(decodedDataArray['views']);
							$("#input2").val(decodedDataArray['rpm']);
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

	$("#input1").keypress(function() {
		var keyPressed = $(this).val();
		return CALCULATOR.isNumberKeyNoDecimal(keyPressed);
	});

	$("#input2").keypress(function() {
		var keyPressed = $(this).val();
		return CALCULATOR.isNumberKey(keyPressed);
	});

	$(".input").each(function() {
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