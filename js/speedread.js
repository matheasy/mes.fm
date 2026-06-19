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
				    	wordIndex = 0;
				    	calculatorRunning = false;
				    	clearInterval(interval);
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
				});
	        },

	        clearYellowBG: function() {
	        	/*var wordCount = $("#word-count").val();
	        	for (var i = 0; i < wordCount; i++) {
	        		$("#scanner span:eq("+(wordIndex-(1+i))+")").removeClass("yellowBG");
	        	}*/

	        	$("#scanner span").removeClass("yellowBG");
	        },

	        resetInterval: function() {
	        	clearInterval(interval);
	        	wordIndex = 0;
	        	calculatorRunning = false;
	        },

	        getWordIndex: function() {
	        	return wordIndex;
	        },

	        setWordIndex: function(i) {
	        	wordIndex = i;
	        },

	        getCalculatorRunning: function() {
	        	return calculatorRunning;
	        }
	    }
	})();

	CALCULATOR.updateScanner();

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

	$("#createSpeed").click(function(){
		CALCULATOR.startCountDown();
	});

	$("#speed").change(function() {
		if(CALCULATOR.getCalculatorRunning()) CALCULATOR.startCountDown();
	});

	$("#font-size").change(function() {
		$("#result").css("font-size",$(this).val()+'px');
	});

	$("#font-color").change(function() {
		$("#result").css("color",$(this).val());
	});

	$("#background-color").change(function() {
		$("#result-container").css("background-color",$(this).val());
	});
	
});

