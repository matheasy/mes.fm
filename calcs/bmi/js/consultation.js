$(document).ready(function(){

	var CONSULTATION = (function() {

		return {
			correctEmail: false,
			requiredInputsAreFilled:false,
			consultationID:1,
			consultationType:'',
			thirtyMinSkype:$("#skype-length").val() == 30 ? true : false,

			checkEmail: function() {
				var email = $("#email").val();
				var email2 = $("#email2").val();
				email = email.toLowerCase();
				email2 = email2.toLowerCase();

				if(email && email2 && email === email2) {
					CONSULTATION.correctEmail = true;
					$(".check-mark-container img").attr("src","//mes.fm/main_img/images/green-check-mark.png");
					$(".check-mark-container img").attr("alt","green check mark");
					$(".check-mark-container").css("display","inline-block");
					$("#email-error").css("display","none");
				} else {
					if(!email || !email2) {
						$(".check-mark-container,#email-error").css("display","none");
					} else {
						$(".check-mark-container img").attr("src","//mes.fm/main_img/images/red-x-mark.png");
						$(".check-mark-container img").attr("alt","red x mark");
						$(".check-mark-container").css("display","inline-block");
						$("#email-error").css("display","block");
					}
					CONSULTATION.correctEmail = false;
				}
			},

			submitForm: function() {

				$("#consultation-form").submit(function() {

					switch(CONSULTATION.consultationID) {
					    case 1:
					        CONSULTATION.consultationType = "Basic Consultation ($9.95 USD)";
					        break;
					    case 2:
					        CONSULTATION.consultationType = "Detailed Consultation ($59.95 USD)";
					        break;
					    case 3:
					    	if(CONSULTATION.thirtyMinSkype)
					        	CONSULTATION.consultationType = "30 minute Skype Video Chat Consultation ($124.95 USD)";
					        else
					        	CONSULTATION.consultationType = "60 minute Skype Video Chat Consultation ($179.95 USD)";
					        break;
					    default:
					        CONSULTATION.consultationType = "Basic Consultation ($9.95 USD)";
					}

					if(!CONSULTATION.correctEmail) {
						$('html, body').animate({
							scrollTop: $("#email").offset().top-35
						}, 700);
						return false;
					}

					$(".required").each(function() {
						var element = $(this);
						if (element.val() == "") {
							alert("All fields with a * must be filled out.");
							$('html, body').animate({
								scrollTop: element.offset().top-35
							}, 700);
							CONSULTATION.requiredInputsAreFilled = false;
							return false;
						} else {
							CONSULTATION.requiredInputsAreFilled = true;
						}
					});

					if(!CONSULTATION.requiredInputsAreFilled) {
						return false;
					}

					$("#loading-image").css("display","block");
					$("#darkLayer").css("display","block");

					$.ajax({
						url:'php/verify.php',
						type:'POST',
						data:$('#consultation-form').serialize() + "&consultation_id="+ CONSULTATION.consultationID+"&consultation_type="+ CONSULTATION.consultationType//+ "&yolo=" + yolo, // serializes the form's elements.
					})
						.done(function(data) {
							if(data == "PASS") {
								if(CONSULTATION.consultationID == 1)
									window.location.href = "https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=5BENUJKHQ7EYJ";
								else if (CONSULTATION.consultationID == 2)
									window.location.href = "https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=7FRGWDRGSDUBL";
								else {
									if(CONSULTATION.thirtyMinSkype)
										window.location.href = "https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=2AHX9R2L9HRKW";
									else
										window.location.href = "https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=RFP7KM8FBLBNW";
								}
							} else {
								$("#captcha-error").css("display","block");
					          	$("#loading-image").css("display","none");
								$("#darkLayer").css("display","none");
								$('html, body').animate({
									scrollTop: $('.g-recaptcha').offset().top-35
								}, 700);
							}
						});
					return false; // avoid to execute the actual submit of the form.
				});
			},

			isNumberKey: function() {
				$("#custom-input-input").keypress(function() {
					var keyPressed = $(this).val();
					var charCode = (keyPressed.which) ? keyPressed.which : event.keyCode;

					if (charCode != 46 && charCode > 31 && (charCode < 48 || charCode > 57))
						return false;
					return true;
				});
			}
		}
	})();

	//CONSULTATION.isNumberKey();

	//$(".inflation-button").click(function() {
	//	CONSULTATION.calcAnswer();
	//});

	$(".basic-button").click(function() {
		$(".detailed-button,.skype-button").removeClass("active-button");
		$(".basic-button").addClass("active-button");
		$("#detailed-consultation,#skype-consultation").addClass("hide");
		$("#basic-consultation,.hide-first").removeClass("hide");
		$("#pay-button").prop("value", "BUY NOW! $9.95 USD");
		CONSULTATION.consultationID = 1;
	});

	$(".detailed-button").click(function() {
		$(".basic-button,.skype-button").removeClass("active-button");
		$(".detailed-button").addClass("active-button");
		$("#skype-consultation").addClass("hide");
		$("#basic-consultation,#detailed-consultation,.hide-first").removeClass("hide");
		$("#pay-button").prop("value", "BUY NOW! $59.95 USD");
		CONSULTATION.consultationID = 2;
	});

	$(".skype-button").click(function() {
		$(".basic-button,.detailed-button").removeClass("active-button");
		$(".skype-button").addClass("active-button");
		$("#detailed-consultation").addClass("hide");
		$("#basic-consultation,#skype-consultation,.hide-first").removeClass("hide");
		if(CONSULTATION.thirtyMinSkype)
			$("#pay-button").prop("value", "BUY NOW! $124.95 USD");
		else
			$("#pay-button").prop("value", "BUY NOW! $179.95 USD");
		CONSULTATION.consultationID = 3;
	});

	$(".privacy-policy-button").click(function() {
		$(".privacy-policy").toggleClass("hide");
		$(".privacy-policy-button").toggleClass("selected");
	});

	$(".client-statement-button").click(function() {
		$(".client-statement").toggleClass("hide");
		$(".client-statement-button").toggleClass("selected");
	});

	$("#skype-length").change(function() {
		CONSULTATION.thirtyMinSkype = $("#skype-length").val() == 30 ? true : false;
		if(CONSULTATION.thirtyMinSkype)
			$("#pay-button").prop("value", "BUY NOW! $124.95 USD");
		else
			$("#pay-button").prop("value", "BUY NOW! $179.95 USD");
	});

	$("#email,#email2").each(function() {
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
        		CONSULTATION.checkEmail();
        	}
        });
    });

    $( ".calendar" ).datepicker({
    	numberOfMonths: 1,
    	dateFormat: 'yy/mm/dd'
    });

    CONSULTATION.submitForm();
    CONSULTATION.checkEmail();
});