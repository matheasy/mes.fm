$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			userKnowsCurrentGrade: false,
			assignmentCount: 7,
			userChangingScore: true,

			calcAnswerWithAssignments: function () {

				if($("#ass-table .scores-input").is(":focus")) {
					CALCULATOR.userChangingScore = true;
				}

				if($("#ass-table .grades-input").is(":focus")) {
			        CALCULATOR.userChangingScore = false;
				};

		        var desiredGrade = parseFloat($("#desired-grade-input").val());
		        var sumOfWeights = 0;
		        var finalWeight = parseFloat($("#final-weight-input").val());;
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

				if(!isNaN(currentGrade))
	        		$("#current-grade-input").val(currentGrade.toFixed(2));
	        	else
	        		$("#current-grade-input").val("");

        		gradeNeeded = ((desiredGrade * (sumOfWeights + finalWeight)/100 - (currentGrade * sumOfWeights)/100)/finalWeight)*100;

				this.calcFinalResult(desiredGrade,currentGrade,finalWeight,gradeNeeded,sumOfWeights);
			},

			calcFinalResult: function(desired,current,weight,grade,weightSums) {
				var finalResult = $("#result-text");
				var min = current*weightSums/(weightSums+weight);
				var max = (current*weightSums/100+weight)/(weightSums+weight)*100;
				
				if(isNaN(grade)){
				    $("#result").val("");
				    $("#min-result").html("0%");
				    $("#max-result").html("100%");
				} else {
					$("#result").val(grade.toFixed(2)+"%");
					$("#min-result").html(min.toFixed(2)+"%");
				    $("#max-result").html(max.toFixed(2)+"%");
				}

				switch(true)
				{
				  case grade >= 0 && grade <= 100:
				  	finalResult.html("You need <span>"+grade.toFixed(2)+"%</span> on the midterm exam to have <span>"+desired.toFixed(2)+"%</span> so far in the course!");
				    this.showCheckMark(true);
				    break;
				  case grade < 0:
				  	finalResult.html("You need <span>"+grade.toFixed(2)+"%</span> on the midterm exam to have <span>"+desired.toFixed(2)+"%</span> so far in the course.<br>In other words, you can get <span>0%</span> on the exam and still have <span>"+min.toFixed(2)+"%</span> so far in the course! :)");
				    this.showCheckMark(true);
				    break;
				  case grade > 100:
				  	finalResult.html("You need <span>"+grade.toFixed(2)+"%</span> on the midterm exam to have <span>"+desired.toFixed(2)+"%</span> so far in the course.<br>In other words, you can only have <span>"+desired.toFixed(2)+"%</span> so far in the course if there are bonus marks on the midterm exam! :(");
				    this.showCheckMark(false);
				    break;
				  default:
				    finalResult.text("Please make sure all textfields are filled out.");
					$("#check-mark-container,.graph-table-container").css("display","none");
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
				    $("#ass-table").append('<tr><td>'+CALCULATOR.assignmentCount+'</td><td><input type="number" class="scores-input">&nbsp;/&nbsp;<input type="number" class="scores-input"></td><td><input type="number" class="grades-input"></td><td><input type="number"></td><td><img src="//mes.fm/main_img/red-x-mark.png" alt="red x mark"></td></tr>"');
				    CALCULATOR.setUpInputListener();
				    CALCULATOR.isNumberKey();
				});
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

	$("#current-grade-input").click(function() {
    	if(!CALCULATOR.userKnowsCurrentGrade) {
	        alert("Your current grade is automatically calculated based on your assignment scores.");
	    	this.blur();
    	}
	});

	CALCULATOR.setUpInputListener();
	CALCULATOR.isNumberKey();
	CALCULATOR.addAssignment();
	CALCULATOR.calcAnswerWithAssignments();

});