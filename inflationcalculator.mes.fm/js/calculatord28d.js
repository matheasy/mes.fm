$(document).ready(function(){

	var CALCULATOR = (function() {

		return {
			createNewUrl: true,
			oldShareUrl: '',

			calcAnswer: function (referrer = 0) {
				if(!CALCULATOR.createNewUrl) CALCULATOR.createNewUrl = true;

				var country = $("#country-select option:selected").text();
				var trueIndexYear = $("#index-year-select option:selected").text(); //used for dollar graph only
				var trueIndexYearValue = $("#index-year-select").val(); //used for dollar graph only
				var indexYear = $("#index-year-select option:selected").text();
				var indexYearValue = $("#index-year-select").val();
				var comparisonYear = $("#comparison-year-select option:selected").text();
				var comparisonYearValue = $("#comparison-year-select").val();
		        var customInput = parseFloat($("#custom-input-input").val()).toFixed(2);

				var firstYear = $("#index-year-select option:first").text();
				var lastYear = $("#index-year-select option:last").text();

				firstYear = parseInt(firstYear);
				lastYear = parseInt(lastYear);

		        if(isNaN(customInput))
		        	customInput = 1.00;

				var inflationRate = 0;

				if(indexYear > comparisonYear){
					indexYear = $("#comparison-year-select option:selected").text();
					indexYearValue = $("#comparison-year-select").val();
					comparisonYear = $("#index-year-select option:selected").text();
					comparisonYearValue = $("#index-year-select").val();
				}
				
				inflationRate = ((comparisonYearValue / indexYearValue - 1) * 100).toFixed(2);

				var indexWorth = (customInput * (inflationRate/100 + 1)).toFixed(2);
				var comparisonWorth = (customInput / (inflationRate/100 + 1)).toFixed(2);

				var finalResult1 = $("#result-1");
				var finalResult2 = $("#result-2");
				var finalResult3 = $("#result-3");

				finalResult1.html("Using CPI for "+country+" the inflation rate between "+indexYear+" and "+comparisonYear+" is <span>"+inflationRate+"%</span>");
				finalResult2.html("<span>$"+customInput+"</span> in "+indexYear+" would be worth <span>$"+indexWorth+"</span> in "+comparisonYear+".");
				finalResult3.html("<span>$"+customInput+"</span> in "+comparisonYear+" would be worth <span>$"+comparisonWorth+"</span> in "+indexYear+".");

				if(referrer == "comparison")
					return false;
				
				$("#graph-table tr td:last-child").remove();

				if(!referrer) {
					$("#graph-table").html('<tr><th>Year</th><th>Inflation Rate (%)</th><th>CPI</th><th>Worth ($)*</th></tr>');
					this.updateInflationGraph(firstYear,lastYear,country);
					this.updateCPIGraph(firstYear,lastYear,country);
				}

				if(!referrer || referrer == "dollar")
					this.updateDollarGraph(firstYear,lastYear,customInput,trueIndexYear,trueIndexYearValue,country);
			},

			updateInflationGraph: function(first,last,country) {
		        var tableData = new Array([]);
		        tableData[0][0] = 'Year';
		        tableData[0][1] = 'Inflation Rate';
		        //tableData[0][2] = 'Worth of Dollar';

		        var range = last - first;
		        var yearsBetween = parseInt(range/10);
		        if(yearsBetween <= 4)
		        	yearsBetween = 4;
		        
                for(var i = 0; i <= range; i++) {
                	var x = first + i;

                    var y = 0;
                    if(i>1){
	                    var a = $("#index-year-select option:eq("+(i-2)+")").val();
	                    var b = $("#index-year-select option:eq("+(i-1)+")").val();
	                    var y = ((b/a - 1)*100);
	                    y  = parseFloat(y);
	                }

                    var array = [x.toString(),y];
                    tableData.push(array);
                    $("#graph-table").append('<tr><td>'+x+'</td><td>'+y.toFixed(2)+'</td></tr>');
                }

                var data = google.visualization.arrayToDataTable(tableData);

                var formatter = new google.visualization.NumberFormat(
                	{suffix: '%', negativeColor: 'red', negativeParens: true});
                	formatter.format(data, 1); // Apply formatter to third column

				//title: country+"'s Consumer Price Index (CPI) and Worth of $"+dollar+" vs. Year",
                var options = {
                  title: country+"'s Inflation Rate vs. Year",
                  colors:["red"],
                  lineWidth:3,
                  legend: {position: 'top'},
                  chartArea: {width: '85%'},
                  vAxes: {
                  	/*0: {/*maxValue:25,*//*title:"Inflation Rate"}//,*/
                  	//1: {maxValue:50,title:"Worth of $"+dollar}
                  },
                  hAxis: {title:"Year",showTextEvery: yearsBetween}//,
                  /*series: {
                  	0: {type: "line", targetAxisIndex: 0},
                  	1: {type: "line", targetAxisIndex: 1} //area
                  }*/
                };

                var chart = new google.visualization.LineChart(document.getElementById('inflation-graph'));
                chart.draw(data, options);
			},

			updateCPIGraph: function(first,last,country) {
		        var tableData = new Array([]);
		        tableData[0][0] = 'Year';
		        tableData[0][1] = 'CPI';

		        var range = last - first;
		        var yearsBetween = parseInt(range/10);
		        if(yearsBetween <= 4)
		        	yearsBetween = 4;

                for(var i = 0; i <= range; i++) {
                	var x = first + i;

                    var y = $("#index-year-select option:eq("+i+")").val();
                    y = parseFloat(y);

                    var array = [x.toString(),y];
                    tableData.push(array);
                    var graphTableIndex = i + 1;
                    $("#graph-table tr:eq("+graphTableIndex+")").append('<td>'+y.toFixed(2)+'</td></tr>');
                }

                var data = google.visualization.arrayToDataTable(tableData);

                var options = {
                  title: country+"'s CPI vs. Year",
                  //colors:["red"],
                  lineWidth:3,
                  legend: {position: 'top'},
                  chartArea: {width: '85%'},
                  vAxes: {
                  	0: {title:"CPI"}
                  },
                  hAxis: {title:"Year",showTextEvery: yearsBetween}
                };

                var chart = new google.visualization.LineChart(document.getElementById('cpi-graph'));
                chart.draw(data, options);
			},

			updateDollarGraph: function(first,last,dollar,index,value,country) {
		        var tableData = new Array([]);
		        tableData[0][0] = 'Year';
		        tableData[0][1] = 'Worth of $'+dollar;

		        var range = last - first;
		        var yearsBetween = parseInt(range/10);
		        if(yearsBetween <= 4)
		        	yearsBetween = 4;

                for(var i = 0; i <= range; i++) {
                	var x = first + i;

                    var a = $("#index-year-select option:eq("+i+")").val();

                   	var inflationRate = ((a / value - 1) * 100);
                   	var y = (dollar * (inflationRate/100 + 1)).toFixed(2);
                    y = parseFloat(y);

                    var array = [x.toString(),y];
                    tableData.push(array);
                    var graphTableIndex = i + 1;
                    $("#graph-table tr:eq("+graphTableIndex+")").append('<td>'+y.toFixed(2)+'</td></tr>');
                }

                var data = google.visualization.arrayToDataTable(tableData);

                var formatter = new google.visualization.NumberFormat(
                	{prefix: '$', negativeColor: 'red', negativeParens: true});
                	formatter.format(data, 1); // Apply formatter to third column

                var dataTitle = "Worth of $"+dollar+" in "+country+" in "+index+" vs. worth of $"+dollar+" in comparison year";

                var options = {
                  title: dataTitle,
                  colors:["green"],
                  lineWidth:3,
                  legend: {position: 'top'},
                  chartArea: {width: '85%'},
                  vAxes: {
                  	0: {title:"Worth of $"+dollar}
                  },
                  hAxis: {title:"Comparison Year",showTextEvery: yearsBetween},
                };

                $("#data-table-title").html("*"+dataTitle);

                var chart = new google.visualization.LineChart(document.getElementById('dollar-graph'));
                chart.draw(data, options);
			},

			changeCountry: function(referrer,i=0,c=0) {

				if(!referrer || referrer == "initialize")
					$("#country-select,#data-source-select,#index-year-select,#comparison-year-select").attr('disabled','disabled');
					
				var country = $("#country-select").val();
				var source = $("#data-source-select").val();

				//$.get('changeCountry.php', {country: country}) /* same as $.ajax */

				$.ajax({
					url:'php/changeCountry.php',
					type:'GET',
					data:({country:country,source:source})
				})
					.done(
						function(data) {
							$("#index-year-select,#comparison-year-select").html(data);
							$("#country-select,#data-source-select,#index-year-select,#comparison-year-select").removeAttr('disabled');
							if(referrer == "initialize") {
								$("#index-year-select option[value='"+i+"']").attr("selected","selected");
								$("#comparison-year-select option[value='"+c+"']").attr("selected","selected");
							} else {
								$("#index-year-select option").last().attr("selected","selected");
								$("#comparison-year-select option").last().attr("selected","selected");
							}
							
							CALCULATOR.calcAnswer();
						});
			},

			changeSource: function() {
				$("#country-select,#data-source-select,#index-year-select,#comparison-year-select").attr('disabled','disabled');
				var source = $("#data-source-select").val();

				$.ajax({
					url:'php/changeSource.php',
					type:'GET',
					data:({source:source})
				})
					.done(
						function(data) {
							$("#country-select").html(data);
							CALCULATOR.changeCountry(true);
						});
			},

			loadCustomData: function(c,iY,cY) {
				$("#country-select,#data-source-select,#index-year-select,#comparison-year-select").attr('disabled','disabled');
				var source = $("#data-source-select").val();

				$.ajax({
					url:'php/changeSource.php',
					type:'GET',
					data:({source:source})
				})
					.done(
						function(data) {
							$("#country-select").html(data);
							$("#country-select").val(c);
							CALCULATOR.changeCountry("initialize",iY,cY);
						});
			},

			shareUrl: function () {

				if(!CALCULATOR.createNewUrl) return false;

				var equation = {};
				equation['source'] = $("#data-source-select").val();
				equation['country'] = $("#country-select").val();
				equation['indexYear'] = $("#index-year-select").val();
				equation['comparisonYear'] = $("#comparison-year-select").val();
				equation['customInput'] = parseFloat($("#custom-input-input").val());

				CALCULATOR.createUrl(equation);
				CALCULATOR.createNewUrl = false;
			},

			createUrl: function(data) {

				$("#url-to-share").val("Loading...");

				$.ajax({
					url:'php/createShareUrl.php',
					type:'POST',
					data:({data:data,tableName:'ic',site:'https://ic.mes.fm/'})
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
					CALCULATOR.changeCountry();
					return false;
				}

				$.ajax({
					url:'php/getShareUrl.php',
					type:'GET',
					data:({id:id,tableName:'ic'})
				})
				.done(
					function(data) {
						if(data) {
							var decodedDataArray = JSON.parse(data);
							$("#data-source-select").val(decodedDataArray['source']);
							$("#custom-input-input").val(decodedDataArray['customInput']);
							var countryValue = decodedDataArray['country'];
							var indexYearValue = decodedDataArray['indexYear'];
							var comparisonYearValue = decodedDataArray['comparisonYear'];
							CALCULATOR.loadCustomData(countryValue,indexYearValue,comparisonYearValue);
							$(".cpi-button").click();
							$(".dollar-button").click();
							$("#graph-table-button").click();
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

	CALCULATOR.isNumberKey();

	$(document).on('change', "#country-select", function() {
		CALCULATOR.changeCountry();
	});

	$(document).on('change', "#data-source-select", function() {
		CALCULATOR.changeSource();
	});

	$(document).on('change', "#index-year-select",  function() {
    	CALCULATOR.calcAnswer("dollar");
	});

	$(document).on('change', "#comparison-year-select",  function() {
    	CALCULATOR.calcAnswer("comparison");
	});

	$("#custom-input-input").each(function() {
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
        		CALCULATOR.calcAnswer("dollar");
        	}
        });
    });

    CALCULATOR.initializeCustomCalculation();

    $(".inflation-button,.cpi-button,.dollar-button").click(function() {
		$(this).toggleClass("active-button");
	});
	
	$(".inflation-button").click(function() {
		var graph = $("#inflation-graph");
        if(graph.css("display") == "none") {
			graph.css("display","block");
		} else {
			graph.css("display","none");
		}

		CALCULATOR.calcAnswer();
	});

	$(".cpi-button").click(function() {
		var graph = $("#cpi-graph");
        if(graph.css("display") == "none") {
			graph.css("display","block");
		} else {
			graph.css("display","none");
		}

		CALCULATOR.calcAnswer();
	});

	$(".dollar-button").click(function() {
		var graph = $("#dollar-graph");
        if(graph.css("display") == "none") {
			graph.css("display","block");
		} else {
			graph.css("display","none");
		}

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