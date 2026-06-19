$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			courseCount: $('#course-table tr').length-1,

			calcAnswer: function () {
		        var sumOfCredits = 0;
		        var creditsArray = [];
		        var gradesArray = [];
		        var averageGrade = 0;

			    $("#course-table tr").find("input:eq(0)").each(function() { 
		            gradesArray.push(Number(this.value));
		        });

			    $("#course-table tr").find("input:eq(1)").each(function() { 
		            sumOfCredits += Number(this.value);
		            creditsArray.push(Number(this.value));
		        });

		        for(var i = 0; i < creditsArray.length; i++) {
		            var grade = (creditsArray[i] * gradesArray[i])/100;
		            averageGrade = averageGrade + grade;
		        }

				if(!isNaN(sumOfCredits))
					averageGrade = (averageGrade/sumOfCredits)*100;

				if(!isNaN(averageGrade)) {
					$("#result").val(averageGrade.toFixed(2)+"%");
					$("#result-text").html("Your weighted average course percentage is: <span>"+averageGrade.toFixed(2)+"%</span>");
				} else {
					$("#result").val("");
					$("#result-text").html("");	
				}

			},

			addCourse: function() {
				$(".add-course-button").click(function() { //add assignment
					CALCULATOR.courseCount++;
				    $("#course-table").append('<tr><td>'+CALCULATOR.courseCount+'</td><td><input type="number"></td><td><input type="number"></td><td><img src="//mes.fm/main_img/red-x-mark.png" alt="red x mark"></td></tr>"');
				    CALCULATOR.setUpInputListener();
				    CALCULATOR.isNumberKey();
				});
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

	CALCULATOR.addCourse();
	CALCULATOR.setUpInputListener();
	CALCULATOR.isNumberKey();
	CALCULATOR.calcAnswer();

});