$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			courseCount: $('#course-table tr').length-1,
			percentageInput: true,
			scale433:false,
			createNewUrl: true,
			oldShareUrl: '',

			calcAnswer: function () {
				if(!CALCULATOR.createNewUrl) CALCULATOR.createNewUrl = true;

		        var sumOfCredits = 0;
		        var creditsArray = [];
		        var gradesArray = [];
		        var finalGPA = 0;


		        if(CALCULATOR.percentageInput) {
		        	$("#course-table tr").find("input:eq(0)").each(function() {
		            	var gradePoint = 0;
		            	if(CALCULATOR.scale433)
		            		gradePoint = CALCULATOR.convertPercentToGPA433(this.value);
		            	else
		            		gradePoint = CALCULATOR.convertPercentToGPA4(this.value);

			           	gradesArray.push(gradePoint);
		        	});
		        } else {
		        	$("#course-table tr").find("select").each(function() {
                		gradesArray.push(Number($(this).val()));
		        	});
		        }

		        $("#course-table tr").find("input:eq(1)").each(function() { 
		            sumOfCredits += Number(this.value);
		            creditsArray.push(Number(this.value));
		        });

		        for(var i = 0; i < creditsArray.length; i++) {
            		var GPA = (creditsArray[i] * gradesArray[i])/sumOfCredits;
		            finalGPA = finalGPA + GPA;
		        }

				this.calcFinalResult(finalGPA);
			},

			calcFinalResult: function(gpa) {
				var result = $("#result");
				var finalResult = $("#result-text");

				switch(true)
				{
				  case gpa >= 1:
				  	result.val(gpa.toFixed(2));
				  	finalResult.html("Your GPA is: <span>"+gpa.toFixed(2)+"</span>");
				    this.showCheckMark(true);
				    break;
				  case gpa < 1:
				  	result.val(gpa.toFixed(2));
				  	finalResult.html("Your GPA is: <span>"+gpa.toFixed(2)+"</span>");
				    this.showCheckMark(false);
				    break;
				  default:
				  	result.val("");
				    finalResult.text("");
					$("#check-mark-container").css("display","none");
				}
			},

			convertPercentToGPA433: function(PercentToConvert) {
		        PercentToConvert = Math.round(PercentToConvert);
		        switch(true)
		        {
		        case PercentToConvert >= 90.00:
		            return 4.33;
		        case PercentToConvert >= 85.00:
		            return 4.00;
		        case PercentToConvert >= 80.00:
		            return 3.67;
		        case PercentToConvert >= 77.00:
		            return 3.33;
		        case PercentToConvert >= 73.00:
		            return 3.00;
		        case PercentToConvert >= 70.00:
		            return 2.67;
		        case PercentToConvert >= 67.00:
		            return 2.33;
		        case PercentToConvert >= 63.00:
		            return 2.00;
		        case PercentToConvert >= 60.00:
		            return 1.67;
		        case PercentToConvert >= 55.00:
		            return 1.33;
		        case PercentToConvert >= 50.00:
		            return 1.00;
		        default:
		            return 0.00;
		        }
		    },

		    convertPercentToGPA4: function(PercentToConvert) {
		        PercentToConvert = Math.round(PercentToConvert);
		        switch(true)
		        {
		        case PercentToConvert >= 93.00:
		            return 4.00;
		        case PercentToConvert >= 90.00:
		            return 3.70;
		        case PercentToConvert >= 87.00:
		            return 3.30;
		        case PercentToConvert >= 83.00:
		            return 3.00;
		        case PercentToConvert >= 80.00:
		            return 2.70;
		        case PercentToConvert >= 77.00:
		            return 2.30;
		        case PercentToConvert >= 73.00:
		            return 2.00;
		        case PercentToConvert >= 70.00:
		            return 1.70;
		        case PercentToConvert >= 67.00:
		            return 1.30;
		        case PercentToConvert >= 65.00:
		            return 1.00;
		        default:
		            return 0.00;
		        }
		    },

			showCheckMark: function(pass) {
				if(pass) {
					$("#check-mark-container img").attr("src","//mes.fm/main_img/green-check-mark.png");
					$("#check-mark-container img").attr("alt","green check mark");
				} else {
					$("#check-mark-container img").attr("src","//mes.fm/main_img/red-circle-mark.png");
					$("#check-mark-container img").attr("alt","red circle mark");
				}

				$("#check-mark-container").css("display","table-cell");
			},

			addCourse: function() {
				$(".add-course-button").click(function() { //add course
					CALCULATOR.courseCount++;
				    $("#course-table").append('<tr class="course"><td>'+CALCULATOR.courseCount+'</td>'+
				    	'<td class="percentage-column"><input type="number"></td>'+
				    	'<td class="letter-grade-column display-none"><select>'+
				    	'<option>--</option>'+
				    	'<option>A+</option>'+
						'<option>A</option>'+
						'<option>A-</option>'+
						'<option>B+</option>'+
						'<option>B</option>'+
						'<option>B-</option>'+
						'<option>C+</option>'+
						'<option>C</option>'+
						'<option>C-</option>'+
						'<option>D+</option>'+
						'<option>D</option>'+
						'<option>F</option>'+
						'</select></td>'+
					'<td><input type="number"></td>'+
					'<td><img src="//mes.fm/main_img/red-x-mark.png" alt="red x mark"></td></tr>');
					CALCULATOR.setUpCorrectValues();
					CALCULATOR.changeLetterGradeValues();
				    CALCULATOR.setUpInputListener();
				    CALCULATOR.isNumberKey();
				});
			},

			setUpCorrectValues: function() {
				if(CALCULATOR.percentageInput){
					$(".percentage-column").removeClass("display-none");
					$(".letter-grade-column").addClass("display-none");
				} else {
					$(".letter-grade-column").removeClass("display-none");
					$(".percentage-column").addClass("display-none");
				}
			},

			changeLetterGradeValues: function() {

				if(CALCULATOR.scale433) {
					CALCULATOR.scale433 = true;
					$("#course-table").find("select").each(function() {   
			            $(this).find("option:eq(0)").val("0");
			            $(this).find("option:eq(1)").val("4.33");
			            $(this).find("option:eq(2)").val("4.00");
			            $(this).find("option:eq(3)").val("3.67");
			            $(this).find("option:eq(4)").val("3.33");
			            $(this).find("option:eq(5)").val("3.00");
			            $(this).find("option:eq(6)").val("2.67");
			            $(this).find("option:eq(7)").val("2.33");
			            $(this).find("option:eq(8)").val("2.00");
			            $(this).find("option:eq(9)").val("1.67");
			            $(this).find("option:eq(10)").val("1.33");
			            $(this).find("option:eq(11)").val("1.00");
			            $(this).find("option:eq(12)").val("0.00");
			        });
				} else {
					CALCULATOR.scale433 = false;
					$("#course-table").find("select").each(function() {   
			            $(this).find("option:eq(1)").val("4.00");
			            $(this).find("option:eq(2)").val("4.00");
			            $(this).find("option:eq(3)").val("3.70");
			            $(this).find("option:eq(4)").val("3.30");
			            $(this).find("option:eq(5)").val("3.00");
			            $(this).find("option:eq(6)").val("2.70");
			            $(this).find("option:eq(7)").val("2.30");
			            $(this).find("option:eq(8)").val("2.00");
			            $(this).find("option:eq(9)").val("1.70");
			            $(this).find("option:eq(10)").val("1.30");
			            $(this).find("option:eq(11)").val("1.00");
			            $(this).find("option:eq(12)").val("0.00");
			        });
				}
			},

			shareUrl: function () {

				if(!CALCULATOR.createNewUrl) return false;

				var equation = {};
				var grades = [];

				equation['type'] = CALCULATOR.percentageInput ? 'percentage' : 'letter';
				equation['scale'] = CALCULATOR.scale433 ? '433' : '4';

				$('#course-table .course').each(function() {
					var grade = [];
					var percent = CALCULATOR.percentageInput ? $(this).find('input:eq(0)').val() : $(this).find('select').val();
					var weight = $(this).find('input:eq(1)').val()
					
					if((percent != '' && percent != 0) || weight != '') {
						grade.push(percent);
						grade.push(weight);
						grades.push(grade);
					}
						
				});

				equation['grades'] = grades;

				if($("#result").val() == '') {
					$("#url-to-share").val("https://gc.mes.fm");
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
					data:({data:data,tableName:'gpa',site:'https://gpa.mes.fm/'})
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
					data:({id:id,tableName:'gpa'})
				})
				.done(
					function(data) {
						if(data) {
							var decodedDataArray = JSON.parse(data);

							//open all courses
							for(i = CALCULATOR.courseCount; i < decodedDataArray['grades'].length; i++ ) {
								$(".add-course-button").click();
							}

							if(decodedDataArray['type'] == "letter")
								$(".letter-grade-button").click();

							if(decodedDataArray['scale'] == "433")
								$(".433-scale-button").click();

							for(i = 0; i < decodedDataArray['grades'].length; i++) {
								if(decodedDataArray['type'] == "percentage")
									$("#course-table .course:eq("+i+") input:eq(0)").val(decodedDataArray['grades'][i][0]);
								else
									$("#course-table .course:eq("+i+") select").val(decodedDataArray['grades'][i][0]);

								$("#course-table .course:eq("+i+") input:eq(1)").val(decodedDataArray['grades'][i][1]);
							}

							if(decodedDataArray['type'] == "percentage" && decodedDataArray['scale'] == "4")
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
				$("#course-table input").each(function() {
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
				$("#course-table input").keypress(function() {
					var keyPressed = $(this).val();
					var charCode = (keyPressed.which) ? keyPressed.which : event.keyCode;

					if (charCode != 46 && charCode > 31 && (charCode < 48 || charCode > 57))
						return false;
					return true;
				});
			}
		}
	})();

	CALCULATOR.addCourse();
	CALCULATOR.setUpInputListener();
	CALCULATOR.isNumberKey();
	CALCULATOR.initializeCustomCalculation();

	$(document).on('click', "#course-table img", function() { //remove course
		if(CALCULATOR.courseCount > 1) {
		    $(this).closest("tr").remove();
		    CALCULATOR.courseCount--;
		    for(var i = 1; i <= CALCULATOR.courseCount;i++)
		        $('#course-table tr').eq(i).find('td').eq(0).text(i.toString());
		} else {
			$('#course-table input').val('');
		}

		CALCULATOR.calcAnswer();
	});

	$(".percentage-button").click(function() {
		$(".letter-grade-button").removeClass("active-button");
		$(".percentage-button").addClass("active-button");
		$(".percentage-column").removeClass("display-none");
		$(".letter-grade-column").addClass("display-none");

		CALCULATOR.percentageInput = true;
		CALCULATOR.calcAnswer();

	});

	$(".letter-grade-button").click(function() {
		$(".percentage-button").removeClass("active-button");
		$(".letter-grade-button").addClass("active-button");
		$(".letter-grade-column").removeClass("display-none");
		$(".percentage-column").addClass("display-none");

		CALCULATOR.percentageInput = false;
		CALCULATOR.calcAnswer();

	});

	$(".433-scale-button").click(function() {
		$(".4-scale-button").removeClass("active-button");
		$(".433-scale-button").addClass("active-button");

		CALCULATOR.scale433 = true;
		CALCULATOR.changeLetterGradeValues();
		CALCULATOR.calcAnswer();

	});

	$(".4-scale-button").click(function() {
		$(".433-scale-button").removeClass("active-button");
		$(".4-scale-button").addClass("active-button");
		
		CALCULATOR.scale433 = false;
		CALCULATOR.changeLetterGradeValues();
		CALCULATOR.calcAnswer();

	});

	$(document).on('change', "select", function() {
		CALCULATOR.calcAnswer();
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