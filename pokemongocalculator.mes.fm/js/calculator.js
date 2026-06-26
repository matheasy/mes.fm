$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			resultArray: [],
			totalEvoCount: 0,

			calcAnswer: function () {



				CALCULATOR.resultArray = [];
				CALCULATOR.totalEvoCount = 0;
				var pokemonArray = [];
				var result = "";
				var result2 = "";

				$("#pokemon-table tr").not(":first").each(function() {
					var pokemon = [];
					pokemon.name = $(this).find("td").html(); //[0]
					pokemon.amount = $(this).find("td input:eq(0)").val(); //[1]
					pokemon.candy = $(this).find("td input:eq(1)").val(); //[2]
					pokemon.candyReq = $(this).data("value"); //[3]
					pokemon.transferEvo = parseInt($(this).find("select").val());

			        if(pokemon.amount != 0 || pokemon.candy != 0)
			        	pokemonArray.push(pokemon);
			    });

			    $("#pokemon-result-table").html('<tr><th>Pokemon</th><th># Evo\'s</th><th>XP</th><th>Time</th></tr>');
				
				for(i = 0; i < pokemonArray.length; i++) {

					var pokemonName = pokemonArray[i].name;
					var numPokemon = pokemonArray[i].amount;
					var numCandies = pokemonArray[i].candy;
					var candyReq = pokemonArray[i].candyReq;
					var transferEvo = pokemonArray[i].transferEvo;

					$("#pokemon-result-table").append("<tr></tr>");

					CALCULATOR.getNewData(pokemonName, numPokemon, numCandies, candyReq, transferEvo, i);
				}

				$("#pokemon-result-table").append("<tr class='total-row italic'><td>TOTAL</td><td>"+CALCULATOR.totalEvoCount+"</td><td>"+1000*CALCULATOR.totalEvoCount
					+"</td><td>"+(0.5 * CALCULATOR.totalEvoCount)+" min</td></tr>");
					
				for (i = 0; i < CALCULATOR.resultArray.length; i++) {
					var first = (i==0) ? "Before using a lucky egg, you should transfer: <br>" : "";
					var text = first + "<span class='span'>" + CALCULATOR.resultArray[i].transAmt + "</span> " + CALCULATOR.resultArray[i].name + "<br>";
					result += text;
				}

				var transferEvoCount = 0;
				for (i = 0; i < CALCULATOR.resultArray.length; i++) {
					if(CALCULATOR.resultArray[i].trans) {
						transferEvoCount++;
						var first = (transferEvoCount==1) ? "<br>Do not forget to transfer your <span class='span'>evolved</span> " : ", ";
						var name = CALCULATOR.resultArray[i].name+'s';
						var text = first + name;
						result += text;
					}					
				}

				if(transferEvoCount) result += ' as well!';

				/*for (i = 0; i < CALCULATOR.resultArray.length; i++) {
					var first = (i==0) ? "<br>You can evolve: <br>" : "";
					var transferEvo = CALCULATOR.resultArray[i].trans ? (" if you transfer your evolved " + CALCULATOR.resultArray[i].name + " as well<br>"):"<br>";
					var text = first + "<span class='span'>" + CALCULATOR.resultArray[i].evos + "</span> " + CALCULATOR.resultArray[i].name + transferEvo;
					result += text;
				}*/
				
				/*result += "<br>You will have a total of <span class='span'>" + CALCULATOR.totalEvoCount + "</span> evolutions which will take about <span class='span'>" + (0.5 * CALCULATOR.totalEvoCount)
				+ "</span> minutes to finish evolving.<br>You will gain a total of <span class='span'>" + 1000 * CALCULATOR.totalEvoCount + "</span> EXP.<br>";*/

				if(CALCULATOR.totalEvoCount < 60)
					result2 += "<span class='span result--result'>RESULT</span><br> Do <span class='span'>NOT</span> activate your lucky egg until you have found more pokemon or else you will waste about <span class='span'>"
				+ (30- 0.5*CALCULATOR.totalEvoCount) + " minutes</span> of your Lucky Egg!";
				else
					result2 += "<span class='span result--result'>RESULT</span><br> You should use <span class='span'>" + parseInt(CALCULATOR.totalEvoCount/60) + "</span> lucky eggs.";

				//console.log(CALCULATOR.resultArray);

				if(CALCULATOR.resultArray.length) {
					$("#result,#result2").removeClass("hide");
					$("#result").html(result);
					$("#result2").html(result2);
				} else {
					$("#result,#result2").addClass("hide");
					$("#result").html("");
					$("#result2").html("");
				}
					

			},

			getNewData: function(name,amount,candy,req,transfer,i) {

				var numEvo = parseInt(candy/req);
				var numPossibleEvo = Math.min(amount,numEvo);
				var candy = candy - (numPossibleEvo * req) + numPossibleEvo;

				if(transfer)
					candy = candy + numPossibleEvo;

				amount = amount - numPossibleEvo;
				var numEvoTransferred = numPossibleEvo;
				var transferAmount = 0;

				while(true) {

					if((candy + amount) < (req + 1) || amount === 0)
						break;

					while (candy < req) {
						transferAmount++;
						amount--;
						candy++;
					}

					amount--;
					candy = candy - req + 1;
					if(transfer) {
						numEvoTransferred++;
						candy++;
					}
						
					numPossibleEvo++;
				}

				CALCULATOR.totalEvoCount += numPossibleEvo;

				var result = {name:name, transAmt:transferAmount, trans:transfer, evos:numPossibleEvo};
				CALCULATOR.resultArray[i] = result;

				//$("#pokemon-result-table").html('<tr><th>Pokemon</th><th>XP Gain</th><th>Time</th></tr>');

				$("#pokemon-result-table tr:nth-child("+(i+2)+")").html("<td>"+name+"</td><td>"+numPossibleEvo+"</td><td>"+(numPossibleEvo*1000)+"</td><td>"+(numPossibleEvo/2)+" min</td>");

			},

			setUpInputListener: function() {
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

	//$("#swag").unbind();

	//$(".chosen-select").chosen({width:"50%", placeholder_text_single:"Select Another Pokemon..."});
	$("#add-another-pokemon-button").change(function() {
		$("#pokemon-table").append('<tr class="light-grey" data-value="'+$(this).val()+'"><td>'+$(this).find('option:selected').text()+'</td><td><input class="input" type="number" min="0" step="1"></td></td>'+
			'<td><input class="input" type="number" min="0" step="1"></td></td><td><select class="select input"><option value="1">Yes</option>'+
			'<option selected value="0">No</option></select class="input"></td></tr>');
		$(this).find('option:selected').attr("disabled", true);
		$(this).val(0);
		CALCULATOR.setUpInputListener();
		CALCULATOR.isNumberKey();
	});

	CALCULATOR.setUpInputListener();
	CALCULATOR.isNumberKey();
	CALCULATOR.calcAnswer();
});