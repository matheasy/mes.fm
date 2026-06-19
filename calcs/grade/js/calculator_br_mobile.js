$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			userKnowsCurrentGrade: true,
			assignmentCount: 4,
			userChangingScore: true,

			calcAnswerWithoutAssignments: function () {
				var desiredGrade = parseFloat($("#desired-grade-input").val().replace(",", "."));
				var currentGrade = parseFloat($("#current-grade-input").val().replace(",", "."));
				var finalWeight = parseFloat($("#final-weight-input").val().replace(",", "."));
				var gradeNeeded = ((desiredGrade-(currentGrade*(100-finalWeight)/100))/finalWeight)*100;
				this.calcFinalResult(desiredGrade,currentGrade,finalWeight,gradeNeeded);
			},

			calcAnswerWithAssignments: function () {

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
		            scoresArray1.push(Number(this.value.replace(",", ".")));
		        });

		        $("#ass-table tr").find("input:eq(1)").each(function() { 
		            scoresArray2.push(Number(this.value.replace(",", ".")));
		        });

			    $("#ass-table tr").find("input:eq(2)").each(function(index) { 
		            //gradesArray.push(Number(this.value));
		            if(CALCULATOR.userChangingScore)
		            	var grade = scoresArray1[index]/scoresArray2[index]*100;
		            else
		            	var grade = $(this).val().replace(",", ".");

		            if(isFinite(grade)) {
		            	if(CALCULATOR.userChangingScore) {
		            		$(this).val(grade.toFixed(1).replace(".", ","));
		            	} else {
		            		var g = parseFloat(grade);
		            		var i = index+1;
		            		var score = scoresArray1[index]/scoresArray2[index]*100;
		            		if((g.toFixed(1) != score.toFixed(1) && g != "")||g == 0){
		            			var rawScore = $("#ass-table tr:eq("+i+")").find("input:eq(0)");
		            			var outOf = $("#ass-table tr:eq("+i+")").find("input:eq(1)");

		            			if(outOf.val()=="") {
				            		rawScore.val(grade.replace(".", ","));
				            		outOf.val(100);
			            		} else {
			            			var newScore = outOf.val() * grade / 100;
			            			rawScore.val(newScore.toFixed(1).replace(".", ","));
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
		            sumOfWeights += Number(this.value.replace(",", "."));
		            weightsArray.push(Number(this.value.replace(",", ".")));
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
					$("#result").val(grade.toFixed(2).replace(".", ",")+"%");
					$("#min-result").html(min.toFixed(2).replace(".", ",")+"%");
				    $("#max-result").html(max.toFixed(2).replace(".", ",")+"%");
				}

				$(".graph-table-container").css("display","block");

				switch(true)
				{
				  case grade >= 0 && grade <= 100:
				  	finalResult.html("Você <span>"+grade.toFixed(2).replace(".", ",")+"%</span> no exame final para obter <span>"+desired.toFixed(2).replace(".", ",")+"%</span> no curso!");
				    this.showCheckMark(true);
				    break;
				  case grade < 0:
				  	finalResult.html("Você <span>"+grade.toFixed(2).replace(".", ",")+"%</span> no exame final para obter <span>"+desired.toFixed(2).replace(".", ",")+"%</span> no curso!");
				    this.showCheckMark(true);
				    break;
				  case grade > 100:
				  	finalResult.html("Você <span>"+grade.toFixed(2).replace(".", ",")+"%</span> no exame final para obter <span>"+desired.toFixed(2).replace(".", ",")+"%</span> no curso!");
				    this.showCheckMark(false);
				    break;
				  default:
				    finalResult.text("Por favor verifique se tudo está preenchido.");
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
		        	$("#graph-table").html('<tr><th>Nota Desejado</th><th>Nota Necessário no Exame Final</th></tr>');
		            if(lowestGrade % 1 != 0)
		            	$("#graph-table").append('<tr><td>'+lowestGrade.replace(".", ",")+'%</td><td>0,00%</td></tr>');
		            for(var x = min; x<=max; x++){

		                var y = (x - current*(100-weight)/100)/weight;
		                y = (y * 100).toFixed(2).replace(".", ",");
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
				    $("#ass-table").append('<tr><td>'+CALCULATOR.assignmentCount+'</td><td><input type="number" class="scores-input">/<input type="number" class="scores-input"></td><td><input type="number" class="grades-input"></td><td><input type="number"></td><td><img src="//mes.fm/main_img/red-x-mark.png" alt="red x mark"></td></tr>"');
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

					if (charCode != 46 && charCode != 44 && charCode > 31 && (charCode < 48 || charCode > 57))
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
	        alert("Por favor, pressione o 'Você sabe qual a sua nota atual?' mudar se você quiser alterar manualmente o seu nota atual.");
	    	this.blur();
    	}
	});

	$("#final-weight-input").click(function() {
    	if(!CALCULATOR.userKnowsCurrentGrade) {
        	alert("Por favor, pressione o 'Você sabe qual a sua nota atual?' mudar se você quiser alterar manualmente o peso do exame final.");
    		this.blur();
    	}
	});

	$(".graph-table-button").click(function() {
		$(this).toggleClass("active-button");

		var graphTable = $("#graph-table");
        if(graphTable.css("display") == "none") {
			graphTable.css("display","table");
			$(".graph-table-button").html("Esconder Todos Os Resultados Possíveis");
			if(CALCULATOR.userKnowsCurrentGrade)
				CALCULATOR.calcAnswerWithoutAssignments();
			else
				CALCULATOR.calcAnswerWithAssignments();
		} else {
			graphTable.css("display","none");
			$(".graph-table-button").html("Mostrar Todos Os Resultados Possíveis");
		}

	});

	CALCULATOR.setUpInputListener();
	CALCULATOR.isNumberKey();
	CALCULATOR.addAssignment();
	CALCULATOR.calcAnswerWithoutAssignments();

});