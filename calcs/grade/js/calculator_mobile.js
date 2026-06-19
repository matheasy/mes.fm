$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			userKnowsCurrentGrade: true,
			assignmentCount: 4,
			userChangingScore: true,
			createNewUrl: true,
			oldShareUrl: '',

			calcAnswerWithoutAssignments: function () {
				if(!CALCULATOR.createNewUrl) CALCULATOR.createNewUrl = true;

				var desiredGrade = parseFloat($("#desired-grade-input").val());
				var currentGrade = parseFloat($("#current-grade-input").val());
				var finalWeight = parseFloat($("#final-weight-input").val());
				var gradeNeeded = ((desiredGrade-(currentGrade*(100-finalWeight)/100))/finalWeight)*100;
				this.calcFinalResult(desiredGrade,currentGrade,finalWeight,gradeNeeded);
			},

			calcAnswerWithAssignments: function () {
				if(!CALCULATOR.createNewUrl) CALCULATOR.createNewUrl = true;

				if($("#ass-table .scores-input").is(":focus")) {
					CALCULATOR.userChangingScore = true;
				}

				if($("#ass-table .grades-input").is(":focus")) {
			        CALCULATOR.userChangingScore = false;
				};

		        var desiredGrade = parseFloat($("#desired-grade-input").val());
		        var sumOfWeights = 0;
		        var finalWeight = 100;
		        var gradeWithoutFinal = 0;
		        var scoresArray1 = [];
		        var scoresArray2 = [];
		        var weightsArray = [];
		        var gradesArray = [];
		        var currentGrade = 0;
		        var gradeNeeded = 0;

		        $("#ass-table tr").find("input:eq(0)").each(function(index) { 
		            scoresArray1.push(Number(this.value));
		        });

		        $("#ass-table tr").find("input:eq(1)").each(function() { 
		            scoresArray2.push(Number(this.value));
		        });

			    $("#ass-table tr").find("input:eq(2)").each(function(index) { 
		            //gradesArray.push(Number(this.value));
		            if(CALCULATOR.userChangingScore)
		            	var grade = scoresArray1[index]/scoresArray2[index]*100;
		            else
		            	var grade = $(this).val();

		            if(isFinite(grade)) {
		            	if(CALCULATOR.userChangingScore) {
		            		$(this).val(grade.toFixed(1));
		            	} else {
		            		var g = parseFloat(grade);
		            		var i = index+1;
		            		var score = scoresArray1[index]/scoresArray2[index]*100;
		            		if((g.toFixed(1) != score.toFixed(1) && g != "")||g == 0){
		            			var rawScore = $("#ass-table tr:eq("+i+")").find("input:eq(0)");
		            			var outOf = $("#ass-table tr:eq("+i+")").find("input:eq(1)");

		            			if(outOf.val()=="") {
				            		rawScore.val(grade);
				            		outOf.val(100);
			            		} else {
			            			var newScore = outOf.val() * grade / 100;
			            			rawScore.val(newScore.toFixed(1));
			            		}
		            		}
		            	}
		            } else {
		            	grade = 0;
		            	$(this).val("");
		            }

		            gradesArray.push(grade);

		        });

				$("#ass-table tr").find("input:eq(3)").each(function() { 
		            sumOfWeights += Number(this.value);
		            weightsArray.push(Number(this.value));
		        });

		        for(var i = 0; i < weightsArray.length; i++) {
		            var grade = (weightsArray[i] * gradesArray[i])/100;
		            currentGrade = currentGrade + grade;

		        }

				if(!isNaN(sumOfWeights))
					currentGrade = (currentGrade/sumOfWeights)*100;

				finalWeight -= sumOfWeights;

				if(!isNaN(currentGrade))
	        		$("#current-grade-input").val(currentGrade.toFixed(2));
	        	else
	        		$("#current-grade-input").val("");

	        	if(!isNaN(finalWeight))
					$("#final-weight-input").val(finalWeight.toFixed(2));
				else
					$("#final-weight-input").val("");

        		gradeNeeded = ((desiredGrade-(currentGrade*sumOfWeights)/100)/finalWeight)*100;

				this.calcFinalResult(desiredGrade,currentGrade,finalWeight,gradeNeeded);
			},

			calcFinalResult: function(desired,current,weight,grade) {
				var finalResult = $("#result-text");
				var min = current*(100-weight)/100;
				var max = current*(100-weight)/100+weight;

				if(isNaN(grade)){
				    $("#result").val("");
				    $("#min-result").html("0%");
				    $("#max-result").html("100%");
				} else {
					$("#result").val(grade.toFixed(2)+"%");
					$("#min-result").html(min.toFixed(2)+"%");
				    $("#max-result").html(max.toFixed(2)+"%");
				}

				$(".graph-table-container").css("display","block");

				switch(true)
				{
				  case grade >= 0 && grade <= 100:
				  	finalResult.html("You need <span>"+grade.toFixed(2)+"%</span> on the final exam to get <span>"+desired.toFixed(2)+"%</span> in the course!");
				    this.showCheckMark(true);
				    break;
				  case grade < 0:
				  	finalResult.html("You need <span>"+grade.toFixed(2)+"%</span> on the final exam to get <span>"+desired.toFixed(2)+"%</span> in the course.<br>In other words, you can get <span>0%</span> on the exam and still have <span>"+min.toFixed(2)+"%</span> in the course! :)");
				    this.showCheckMark(true);
				    break;
				  case grade > 100:
				  	finalResult.html("You need <span>"+grade.toFixed(2)+"%</span> on the final exam to get <span>"+desired.toFixed(2)+"%</span> in the course.<br>In other words, you can only get <span>"+desired.toFixed(2)+"%</span> in the course if there are bonus marks on the final exam! :(");
				    this.showCheckMark(false);
				    break;
				  default:
				    finalResult.text("Please make sure all textfields are filled out.");
					$("#check-mark-container,.graph-table-container").css("display","none");
				}
				if($(".graph-table-button").hasClass("active-button"))
					this.updateGraphTable(min,max,desired,current,weight);
			},

			updateGraphTable: function(min,max,desired,current,weight) {

				var lowestGrade = min.toFixed(2);
				var highestGrade = max.toFixed(2);
				min = Math.ceil(min);
		        max = Math.floor(max);
		        desired = Math.round(desired);
		        if(min>=0 && max <= 100 && !isNaN(min) && !isNaN(max)){
		            $("#graph-table").html('<tr><th>Desired Grade</th><th>Grade Needed on Final Exam</th></tr>');
		            if(lowestGrade % 1 != 0)
		            	$("#graph-table").append('<tr><td>'+lowestGrade+'%</td><td>0.00%</td></tr>');
		            for(var x = min; x<=max; x++){

		                var y = (x - current*(100-weight)/100)/weight;
		                y = (y * 100).toFixed(2);
		                $("#graph-table").append('<tr><td>'+x+'%</td><td>'+y+'%</td></tr>');
		                if(x==desired)
		                    $('#graph-table tr:last').css("background-color","#4CD964");
		            }
		            if(highestGrade % 1 != 0)
		            	$("#graph-table").append('<tr><td>'+highestGrade+'%</td><td>100.00%</td></tr>');
		        } else {
		           $("#graph-table").html('');
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

			addAssignment: function() {
				$(".add-ass-button").click(function() { //add assignment
					CALCULATOR.assignmentCount++;
				    $("#ass-table").append('<tr><td>'+CALCULATOR.assignmentCount+'</td><td><input type="number" class="scores-input saved-input">/<input type="number" class="scores-input saved-input"></td><td><input type="number" class="grades-input"></td><td><input type="number" class="saved-input"></td><td><img src="//mes.fm/main_img/red-x-mark.png" alt="red x mark"></td></tr>"');
				    CALCULATOR.setUpInputListener();
				    CALCULATOR.isNumberKey();
				});
			},

			shareUrl: function () {

				if(!CALCULATOR.createNewUrl) return false;

				var inputs = [];
				var equation = {};
				var assignments = [];

				equation['desired'] = parseFloat($("#desired-grade-input").val());

				if(CALCULATOR.userKnowsCurrentGrade) {
					equation['current'] = parseFloat($("#current-grade-input").val());
					equation['weight'] = parseFloat($("#final-weight-input").val());
				} else {
					$('#ass-table tr').each(function(index1) {
						$(this).find('.saved-input').each(function(index2) {
							inputs[index2] = $(this).val();
						});
						if(inputs[0] != '' || inputs[1] != '' || inputs[2] != '')
							assignments.push(inputs);
						inputs = [];
					});
					assignments.shift();
					equation['ass'] = assignments;
				}

				if($("#desired-grade-input").val() == '' || $("#current-grade-input").val() == '' || $("#final-weight-input").val() == '') {
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
					data:({data:data,tableName:'gc',site:'https://gc.mes.fm/'})
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
					data:({id:id,tableName:'gc'})
				})
				.done(
					function(data) {
						if(data) {
							var decodedDataArray = JSON.parse(data);

							if(decodedDataArray['ass']) {

								$(".no-button").click();

								//open all assignments
								for(i = CALCULATOR.assignmentCount; i < decodedDataArray['ass'].length; i++ ) {
									$(".add-ass-button").click();
								}

								//flatten 2D array into 1D array
								var oneDimensionalArray = $.map(decodedDataArray['ass'], function recurs(n) {
									return ($.isArray(n) ? $.map(n, recurs): n);
								});

								$('#ass-table .saved-input').each(function(index) {
									$(this).val(oneDimensionalArray[index]);
								});

								CALCULATOR.calcAnswerWithAssignments();

							} else {
								$("#desired-grade-input").val(decodedDataArray['desired']);
								$("#current-grade-input").val(decodedDataArray['current']);
								$("#final-weight-input").val(decodedDataArray['weight']);

								CALCULATOR.calcAnswerWithoutAssignments();

							}
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
				$("#desired-grade-input,#current-grade-input,#final-weight-input,#ass-table input").each(function() {
					var currentVal = $(this);
				    // Save current value of input
				    currentVal.data('currentVal', currentVal.val());
				    // Look for changes in the value
				    currentVal.bind("propertychange keydown input paste", function(event){
				    // If value has changed...
				    	if (currentVal.data('currentVal') != currentVal.val()) {
			        		// Updated stored value
			        		currentVal.data('currentVal', currentVal.val());
			        		// Do action
			        		if(CALCULATOR.userKnowsCurrentGrade)
					        	CALCULATOR.calcAnswerWithoutAssignments();
			        		else
					        	CALCULATOR.calcAnswerWithAssignments();
					    }
					});
				});
			},

			isNumberKey: function() {
				$("#desired-grade-input,#current-grade-input,#final-weight-input,#ass-table input").keypress(function() {
					var keyPressed = $(this).val();
					var charCode = (keyPressed.which) ? keyPressed.which : event.keyCode;

					if (charCode != 46 && charCode > 31 && (charCode < 48 || charCode > 57))
						return false;
					return true;
				});
			}
		}
	})();

	CALCULATOR.setUpInputListener();
	CALCULATOR.isNumberKey();
	CALCULATOR.addAssignment();
	CALCULATOR.initializeCustomCalculation();

	$(document).on('click', "#ass-table img", function() { //remove assignment
		if(CALCULATOR.assignmentCount > 1) {
		    $(this).closest("tr").remove();
		    CALCULATOR.assignmentCount--;
		    for(var i = 1; i <= CALCULATOR.assignmentCount;i++)
		        $('#ass-table tr').eq(i).find('td').eq(0).text(i.toString());
		} else {
			$('#ass-table input').val('');
		}

		CALCULATOR.calcAnswerWithAssignments();
	});

	$(".yes-button").click(function() { //yes button pressed
		$(".no-button").removeClass("active-button");
		$(".yes-button").addClass("active-button");
		$("#right-side-container").css("display","none");
		$("#fec-box-ad").css("position","absolute");

		$('html, body').animate({
			scrollTop: $("#question-anchor").offset().top-10
		}, 700);

		CALCULATOR.userKnowsCurrentGrade = true;
		CALCULATOR.calcAnswerWithoutAssignments();
	});

	$(".no-button").click(function() { //no button pressed
		$(".yes-button").removeClass("active-button");
		$(".no-button").addClass("active-button");
		$("#right-side-container").css("display","block");
		$("#fec-box-ad").css("position","static");

		$('html, body').animate({
			scrollTop: $("#assignments-anchor").offset().top-10
		}, 700);

		CALCULATOR.userKnowsCurrentGrade = false;
		CALCULATOR.calcAnswerWithAssignments();
	});

	$("#current-grade-input").click(function() {
    	if(!CALCULATOR.userKnowsCurrentGrade) {
	        alert("Please press the 'Do you know your Current Grade?' switch if you want to manually change your current grade.");
	    	this.blur();
    	}
	});

	$("#final-weight-input").click(function() {
    	if(!CALCULATOR.userKnowsCurrentGrade) {
        	alert("Please press the 'Do you know your Current Grade?' switch if you want to manually change the weight of the final exam.");
    		this.blur();
    	}
	});

	$(".graph-table-button").click(function() {
		$(this).toggleClass("active-button");

		var graphTable = $("#graph-table");
        if(graphTable.css("display") == "none") {
			graphTable.css("display","table");
			$(".graph-table-button").html("Hide All Possible Outcomes");
			if(CALCULATOR.userKnowsCurrentGrade)
				CALCULATOR.calcAnswerWithoutAssignments();
			else
				CALCULATOR.calcAnswerWithAssignments();
		} else {
			graphTable.css("display","none");
			$(".graph-table-button").html("Show All Possible Outcomes");
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