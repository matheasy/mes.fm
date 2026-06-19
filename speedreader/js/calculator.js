$(document).ready(function(){

	var CALCULATOR = (function(){
		var wordIndex = 0;
		var calculatorRunning = false;
		var interval = 0;

		return {
			startCountDown: function() {
				clearInterval(interval);
				var string = this.getArrayOfWords($("#text-input").val());
				var wordCount = $("#word-count").val();
				var speed = $("#speed").val()/wordCount;
				this.countDown(string,speed,wordCount);
			},

			countDown: function(string,speed,wordCount) {
				calculatorRunning = true;
				var start = new Date().getTime();
				var elapsedTime = 0;
				var arrayString = string;
				var intervalLength = parseInt(1/(speed/60000));

				interval = setInterval(function() {
					
					$("#result").empty();
					for (var i = 0; i < wordCount; i++) {
						$("#result").append(arrayString[wordIndex+i]);
						$("#scanner span:eq("+(wordIndex+i)+")").addClass("yellowBG");
						if(wordIndex > 0)
							$("#scanner span:eq("+(wordIndex-(1+i))+")").removeClass("yellowBG");
					}

				    if(wordIndex >= arrayString.length) {
				    	CALCULATOR.resetInterval();
				    	return;
				    }

				    wordIndex = wordIndex + parseInt(wordCount);

				}, intervalLength);
	        },

	        getArrayOfWords: function(text) {
	        	var text = $("#text-input").val();
	        	//var textArray = text.replace(/([ .,;"”]+)/g,'$1§sep§').split('§sep§');
	        	var textArray = text.replace(/([ \n]+)/g,'$1§sep§').split('§sep§');
	        	return textArray;
	        },

	        updateScanner: function(text) {
	        	var words = this.getArrayOfWords($("#text-input").val());
	        	$("#scanner").empty();
	        	$.each(words, function(i, v) {
	        		$("#scanner").append($("<span>").text(v));
	        	});

	        	//bind click to #scanner spans
	        	$("#scanner span").click(function(){
					CALCULATOR.clearYellowBG();
					var currentIndex = $(this).index();
					CALCULATOR.setWordIndex(currentIndex);
					CALCULATOR.startCountDown();
					if(calculatorRunning) {
						$("#playSpeed").addClass("hide");
	        			$("#pauseSpeed").removeClass("hide");
					} else {
						$("#playSpeed").toggleClass("hide");
						$("#pauseSpeed").toggleClass("hide");
					}
				});
	        },

	        clearYellowBG: function() {
	        	$("#scanner span").removeClass("yellowBG");
	        },

	        pauseInterval: function() {
	        	if(calculatorRunning) {
		        	clearInterval(interval);
		        	calculatorRunning = false;
		        	$("#pauseSpeed").toggleClass("hide");
					$("#playSpeed").toggleClass("hide");
				}
	        },

	        resetInterval: function() {
	        	clearInterval(interval);
	        	wordIndex = 0;
	        	calculatorRunning = false;
	        	this.clearYellowBG();
	        	$("#playSpeed").removeClass("hide");
	        	$("#pauseSpeed").addClass("hide");
	        	$("#result").html("Press Play!");
	        },

	        getWordIndex: function() {
	        	return wordIndex;
	        },

	        setWordIndex: function(i) {
	        	wordIndex = i;
	        },

	        getCalculatorRunning: function() {
	        	return calculatorRunning;
	        },

	        initializeEvents: function() {
	        	$("#text-input").each(function() {
					var currentString = $(this);
				    // Save current value of input
				    currentString.data('currentString', currentString.val());
				    // Look for changes in the value
				    currentString.bind("propertychange keyup input paste", function(event){
				    // If value has changed...
				    	if (currentString.data('currentString') != currentString.val()) {
			        		// Updated stored value
			        		currentString.data('currentString', currentString.val());
			        		// Do action
			        		CALCULATOR.resetInterval();
			        		CALCULATOR.updateScanner();
					    }
					});
				});

				$("#word-count,#speed").change(function() {
					CALCULATOR.pauseInterval();
				});

				$("#playSpeed").click(function(){
					CALCULATOR.startCountDown();
					$(this).toggleClass("hide");
					$("#pauseSpeed").toggleClass("hide");
				});

				$("#pauseSpeed").click(function(){
					CALCULATOR.pauseInterval();
					
				});

				$("#stopSpeed").click(function(){
					CALCULATOR.resetInterval();
				});

				$("#settingsButton").click(function() {
					$("#settingsTable").fadeToggle().toggleClass("hide");
					$(this).toggleClass("grey-bg")
					if(CALCULATOR.getCalculatorRunning()) CALCULATOR.pauseInterval();
				});

				$("#fontSize").change(function() {
					$("#result").css("fontSize",$(this).val()+'px');
				});

				$("#font-color").change(function() {
					$("#result").css("color",$(this).val());
				});

				$("#background-color").change(function() {
					$("#result-container").css("background-color",$(this).val());
				});
	        }
	    }
	})();

	CALCULATOR.updateScanner();
	CALCULATOR.initializeEvents();
	
});

